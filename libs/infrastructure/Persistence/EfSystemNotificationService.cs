using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Infrastructure.Persistence;

internal sealed class EfSystemNotificationService(Patrol360DbContext dbContext) : ISystemNotificationService
{
    private const int MaxLimit = 50;

    public IReadOnlyList<SystemNotificationDto> GetNotifications(SessionUserDto currentUser, int limit)
    {
        var take = Math.Clamp(limit, 1, MaxLimit);
        var permissions = new HashSet<string>(currentUser.Permissions, StringComparer.OrdinalIgnoreCase);
        var now = DateTimeOffset.UtcNow;
        var notifications = new List<SystemNotificationDto>();

        if (CanSeePatrol(permissions))
        {
            AddPatrolNotifications(notifications, now);
        }

        if (permissions.Contains("emu.view"))
        {
            AddEmuNotifications(notifications);
        }

        if (permissions.Contains("inventory.view"))
        {
            AddInventoryNotifications(notifications, permissions);
        }

        if (permissions.Contains("mobile_accounts.write"))
        {
            AddMobilePushNotifications(notifications);
        }

        return notifications
            .OrderByDescending(notification => notification.CreatedAt)
            .ThenBy(notification => notification.Id, StringComparer.Ordinal)
            .Take(take)
            .ToArray();
    }

    private void AddPatrolNotifications(List<SystemNotificationDto> notifications, DateTimeOffset now)
    {
        var activeStatuses = new HashSet<string>(AssignmentStatusValues.Active, StringComparer.OrdinalIgnoreCase);
        var overdueAssignments = dbContext.Assignments
            .AsNoTracking()
            .Include(assignment => assignment.Employee)
            .Include(assignment => assignment.Route)
            .Where(assignment => activeStatuses.Contains(assignment.Status) && assignment.FinishedAt == null && assignment.PlannedAt < now)
            .OrderBy(assignment => assignment.PlannedAt)
            .Take(5)
            .Select(assignment => new
            {
                assignment.Id,
                EmployeeName = assignment.Employee == null ? string.Empty : assignment.Employee.FullName,
                RouteName = assignment.Route == null ? string.Empty : assignment.Route.Name,
                assignment.PlannedAt,
                assignment.Status
            })
            .ToArray();

        foreach (var assignment in overdueAssignments)
        {
            notifications.Add(new SystemNotificationDto(
                $"patrol-overdue-{assignment.Id}",
                "obhod",
                "Просрочен обход",
                $"{DisplayName(assignment.EmployeeName)} · {DisplayName(assignment.RouteName)} · {assignment.Status}",
                "danger",
                assignment.PlannedAt,
                "assignment",
                assignment.Id.ToString(),
                "assign"));
        }

        var activeAssignments = dbContext.Assignments
            .AsNoTracking()
            .Include(assignment => assignment.Employee)
            .Include(assignment => assignment.Route)
            .Where(assignment => activeStatuses.Contains(assignment.Status) && assignment.FinishedAt == null && assignment.PlannedAt >= now)
            .OrderBy(assignment => assignment.PlannedAt)
            .Take(4)
            .Select(assignment => new
            {
                assignment.Id,
                EmployeeName = assignment.Employee == null ? string.Empty : assignment.Employee.FullName,
                RouteName = assignment.Route == null ? string.Empty : assignment.Route.Name,
                assignment.PlannedAt,
                assignment.Status
            })
            .ToArray();

        foreach (var assignment in activeAssignments)
        {
            notifications.Add(new SystemNotificationDto(
                $"patrol-active-{assignment.Id}",
                "obhod",
                "Активное назначение",
                $"{DisplayName(assignment.EmployeeName)} · {DisplayName(assignment.RouteName)} · {assignment.Status}",
                assignment.Status.Equals(AssignmentStatusValues.InProgress, StringComparison.OrdinalIgnoreCase) ? "warning" : "info",
                assignment.PlannedAt,
                "assignment",
                assignment.Id.ToString(),
                "assign"));
        }

        var recentRequests = dbContext.PatrolRequests
            .AsNoTracking()
            .Where(request => request.Status != AssignmentStatusValues.Completed && request.Status != AssignmentStatusValues.Cancelled)
            .OrderByDescending(request => request.CreatedAt)
            .Take(4)
            .Select(request => new
            {
                request.Id,
                request.Number,
                request.EmployeeName,
                request.RouteName,
                request.CreatedAt,
                request.Status
            })
            .ToArray();

        foreach (var request in recentRequests)
        {
            notifications.Add(new SystemNotificationDto(
                $"patrol-request-{request.Id}",
                "obhod",
                string.IsNullOrWhiteSpace(request.Number) ? "Заявка на обход" : $"Заявка {request.Number}",
                $"{DisplayName(request.EmployeeName)} · {DisplayName(request.RouteName)} · {request.Status}",
                "info",
                request.CreatedAt,
                "patrol_request",
                request.Id.ToString(),
                "assign"));
        }
    }

    private void AddEmuNotifications(List<SystemNotificationDto> notifications)
    {
        var emuNotifications = dbContext.EmuNotifications
            .AsNoTracking()
            .Where(notification => notification.Status == "new")
            .OrderByDescending(notification => notification.CreatedAt)
            .Take(6)
            .Select(notification => new
            {
                notification.Id,
                notification.Title,
                notification.Message,
                notification.CreatedAt,
                notification.WorkSessionId,
                notification.PlanTaskId
            })
            .ToArray();

        foreach (var notification in emuNotifications)
        {
            notifications.Add(new SystemNotificationDto(
                $"emu-{notification.Id}",
                "emu",
                DisplayName(notification.Title, "ЭМУ"),
                DisplayName(notification.Message, "Новое уведомление по работам"),
                "warning",
                notification.CreatedAt,
                notification.WorkSessionId.HasValue ? "emu_work_session" : notification.PlanTaskId.HasValue ? "emu_plan_task" : "emu",
                (notification.WorkSessionId ?? notification.PlanTaskId)?.ToString(),
                notification.PlanTaskId.HasValue ? "emu-dashboard" : "emu-work-accounting"));
        }
    }

    private void AddInventoryNotifications(List<SystemNotificationDto> notifications, IReadOnlySet<string> permissions)
    {
        if (!permissions.Contains("inventory.audit.view"))
        {
            return;
        }

        var visibleEntityTypes = new[]
        {
            "ppe_card",
            "ppe_card_line",
            "custody_record",
            "custody_document",
            "employee",
            "export_job"
        };

        var inventoryLogs = dbContext.InventorySystemLogs
            .AsNoTracking()
            .Where(log => visibleEntityTypes.Contains(log.EntityType))
            .OrderByDescending(log => log.CreatedAt)
            .Take(8)
            .Select(log => new
            {
                log.Id,
                log.EntityType,
                log.EntityId,
                log.Action,
                log.Details,
                log.CreatedAt
            })
            .ToArray();

        foreach (var log in inventoryLogs)
        {
            notifications.Add(new SystemNotificationDto(
                $"inventory-log-{log.Id}",
                "inventory",
                InventoryTitle(log.EntityType, log.Action),
                DisplayName(log.Details, "Операция в бухгалтерии"),
                InventoryTone(log.Action),
                log.CreatedAt,
                log.EntityType,
                log.EntityId?.ToString(),
                InventoryNavigateTo(log.EntityType)));
        }
    }

    private void AddMobilePushNotifications(List<SystemNotificationDto> notifications)
    {
        var failedPush = dbContext.MobileNotifications
            .AsNoTracking()
            .Where(notification => notification.PushStatus == "failed" || notification.PushStatus == "waitingSync")
            .OrderByDescending(notification => notification.CreatedAt)
            .Take(4)
            .Select(notification => new
            {
                notification.Id,
                notification.Title,
                notification.Message,
                notification.PushStatus,
                notification.CreatedAt
            })
            .ToArray();

        foreach (var notification in failedPush)
        {
            notifications.Add(new SystemNotificationDto(
                $"mobile-push-{notification.Id}",
                "mobile",
                notification.PushStatus == "failed" ? "Push не доставлен" : "Push ожидает синхронизацию",
                $"{DisplayName(notification.Title)} · {DisplayName(notification.Message)}",
                notification.PushStatus == "failed" ? "danger" : "warning",
                notification.CreatedAt,
                "mobile_notification",
                notification.Id.ToString(),
                "accounts"));
        }
    }

    private static bool CanSeePatrol(IReadOnlySet<string> permissions) =>
        permissions.Contains("requests.read") || permissions.Contains("assignments.read") || permissions.Contains("dashboard.read");

    private static string InventoryNavigateTo(string entityType) =>
        entityType switch
        {
            "ppe_card" or "ppe_card_line" => "inventory-ppe",
            "custody_record" or "custody_document" => "inventory-custody",
            "employee" => "inventory-employees",
            "export_job" => "inventory-reports",
            _ => "inventory-history"
        };

    private static string InventoryTitle(string entityType, string action)
    {
        var area = entityType switch
        {
            "ppe_card" or "ppe_card_line" => "СИЗ",
            "custody_record" or "custody_document" => "Под ответственность",
            "employee" => "Сотрудники",
            "export_job" => "Отчет",
            _ => "Бухгалтерия"
        };

        return $"{area}: {ActionLabel(action)}";
    }

    private static string InventoryTone(string action) =>
        action.Contains("archiv", StringComparison.OrdinalIgnoreCase) ||
        action.Contains("delete", StringComparison.OrdinalIgnoreCase) ||
        action.Contains("failed", StringComparison.OrdinalIgnoreCase)
            ? "warning"
            : action.Contains("created", StringComparison.OrdinalIgnoreCase)
                ? "success"
                : "info";

    private static string ActionLabel(string action) =>
        action switch
        {
            "created" => "создано",
            "updated" => "обновлено",
            "archived" => "архив",
            "status_changed" => "статус изменен",
            "import" => "импорт",
            "print" => "печать",
            "disabled" => "отключено",
            _ when action.StartsWith("import", StringComparison.OrdinalIgnoreCase) => "импорт",
            _ when action.StartsWith("print", StringComparison.OrdinalIgnoreCase) => "печать",
            _ when action.StartsWith("export", StringComparison.OrdinalIgnoreCase) => "экспорт",
            _ => string.IsNullOrWhiteSpace(action) ? "событие" : action
        };

    private static string DisplayName(string? value, string fallback = "Не указано") =>
        string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();
}
