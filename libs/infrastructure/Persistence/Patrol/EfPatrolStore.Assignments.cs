using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Caching.Memory;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfPatrolStore
{
    private const int DefaultAssignmentPage = 1;
    private const int DefaultAssignmentPageSize = 100;
    private const int MaxAssignmentPageSize = 500;

    public IReadOnlyList<AssignmentDto> GetActiveAssignments() =>
        GetCurrentAssignmentEntities(DateTimeOffset.UtcNow)
            .OrderByDescending(assignment => assignment.PlannedAt)
            .Take(50)
            .Select(assignment => MapAssignment(assignment))
            .ToList();

    public IReadOnlyList<AssignmentDto> GetAssignments(int page = DefaultAssignmentPage, int pageSize = DefaultAssignmentPageSize)
    {
        var paging = NormalizeAssignmentPaging(page, pageSize);
        var assignments = GetAssignmentQuery()
            .OrderByDescending(assignment => assignment.PlannedAt)
            .ThenByDescending(assignment => assignment.Id)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .ToList();
        var assignmentIds = assignments.Select(assignment => assignment.Id).ToArray();
        var resultTimesByAssignment = dbContext.PatrolResults
            .AsNoTracking()
            .Where(result => result.AssignmentId.HasValue && assignmentIds.Contains(result.AssignmentId.Value))
            .GroupBy(result => result.AssignmentId!.Value)
            .Select(group => new
            {
                AssignmentId = group.Key,
                StartedAt = group.Min(result => result.ActualAt),
                FinishedAt = group.Max(result => result.ActualAt)
            })
            .ToDictionary(result => result.AssignmentId);

        return assignments
            .Select(assignment =>
            {
                resultTimesByAssignment.TryGetValue(assignment.Id, out var resultTimes);
                return MapAssignment(assignment, resultTimes?.StartedAt, resultTimes?.FinishedAt);
            })
            .ToList();
    }

    public AssignmentSettingsDto GetSettings()
    {
        var settings = EnsureAssignmentSettings();
        return MapAssignmentSettings(settings);
    }

    public AssignmentSettingsDto UpdateSettings(UpdateAssignmentSettingsDto request)
    {
        var settings = EnsureAssignmentSettings();
        if (request.ShiftSettings is not null)
        {
            settings.DayStart = NormalizeTimeValue(request.ShiftSettings.DayStart, settings.DayStart);
            settings.DayEnd = NormalizeTimeValue(request.ShiftSettings.DayEnd, settings.DayEnd);
            settings.NightStart = NormalizeTimeValue(request.ShiftSettings.NightStart, settings.NightStart);
            settings.NightEnd = NormalizeTimeValue(request.ShiftSettings.NightEnd, settings.NightEnd);
        }

        if (request.FavoriteEmployeeIds is not null)
        {
            var employeeIds = request.FavoriteEmployeeIds
                .Where(id => id != Guid.Empty)
                .Distinct()
                .ToList();
            var existingEmployeeIds = dbContext.Employees
                .Where(employee => employeeIds.Contains(employee.Id))
                .Select(employee => employee.Id)
                .ToHashSet();
            var orderedEmployeeIds = employeeIds
                .Where(existingEmployeeIds.Contains)
                .ToList();

            dbContext.AssignmentFavoriteEmployees.RemoveRange(dbContext.AssignmentFavoriteEmployees);
            var now = DateTimeOffset.UtcNow;
            for (var index = 0; index < orderedEmployeeIds.Count; index++)
            {
                dbContext.AssignmentFavoriteEmployees.Add(new AssignmentFavoriteEmployeeEntity
                {
                    Id = Guid.NewGuid(),
                    EmployeeId = orderedEmployeeIds[index],
                    SortOrder = index,
                    CreatedAt = now
                });
            }
        }

        settings.UpdatedAt = DateTimeOffset.UtcNow;
        SaveChangesAndInvalidateDashboardSummary();
        return MapAssignmentSettings(settings);
    }

    public CreateAssignmentResult Create(CreateAssignmentDto request)
    {
        var patrolRequest = request.PatrolRequestId is null
            ? null
            : dbContext.PatrolRequests.FirstOrDefault(item => item.Id == request.PatrolRequestId.Value);
        var employee = request.EmployeeId is null
            ? null
            : dbContext.Employees.FirstOrDefault(item => item.Id == request.EmployeeId.Value);
        var route = request.RouteId is null
            ? null
            : dbContext.Routes.FirstOrDefault(item => item.Id == request.RouteId.Value && !item.IsArchived);
        var existingAssignment = FindReusableAssignment(request, patrolRequest, employee, route);
        if (existingAssignment is not null)
        {
            return new CreateAssignmentResult(MapAssignment(existingAssignment), new Dictionary<string, string[]>());
        }

        var errors = ValidateCreateAssignment(request, patrolRequest, employee, route);

        if (errors.Count > 0)
        {
            return new CreateAssignmentResult(null, errors);
        }

        var confirmedPatrolRequest = patrolRequest!;
        var confirmedEmployee = employee!;
        var confirmedRoute = route!;
        var plannedAt = request.PlannedAt!.Value.ToUniversalTime();
        var shouldNotify = request.NotifyEmployee || confirmedPatrolRequest.NotifyEmployee;
        var notificationText = NormalizeOptionalText(request.NotificationText, confirmedPatrolRequest.NotificationText);

        confirmedPatrolRequest.Status = AssignmentStatusValues.Assigned;
        confirmedPatrolRequest.NotifyEmployee = shouldNotify;
        confirmedPatrolRequest.NotificationText = shouldNotify
            ? NormalizeOptionalText(notificationText, BuildAssignmentNotificationText(confirmedEmployee.FullName, confirmedRoute.Name, plannedAt))
            : string.Empty;
        if (!string.IsNullOrWhiteSpace(request.Comment))
        {
            confirmedPatrolRequest.Description = NormalizeOptionalText(request.Comment);
        }

        var assignment = new AssignmentEntity
        {
            Id = Guid.NewGuid(),
            PatrolRequestId = confirmedPatrolRequest.Id,
            EmployeeId = confirmedEmployee.Id,
            RouteId = confirmedRoute.Id,
            Shift = string.IsNullOrWhiteSpace(request.Shift) ? confirmedEmployee.Shift : request.Shift!.Trim(),
            Status = shouldNotify ? AssignmentStatusValues.Waiting : AssignmentStatusValues.Assigned,
            PlannedAt = plannedAt,
            ProgressPercent = 0,
            LockVersion = 0
        };

        dbContext.Assignments.Add(assignment);
        AddMobileNotificationForEmployee(
                confirmedEmployee.Id,
                "patrolRequest",
                "Новая заявка на обход",
                string.IsNullOrWhiteSpace(confirmedPatrolRequest.NotificationText)
                    ? BuildAssignmentNotificationText(confirmedEmployee.FullName, confirmedRoute.Name, plannedAt)
                    : confirmedPatrolRequest.NotificationText,
                "patrolRequest",
                confirmedPatrolRequest.Id.ToString(),
                $"patrol-request:{confirmedPatrolRequest.Id}");
        SaveChangesAndInvalidateDashboardSummary();

        assignment.PatrolRequest = confirmedPatrolRequest;
        assignment.Employee = confirmedEmployee;
        assignment.Route = confirmedRoute;

        return new CreateAssignmentResult(MapAssignment(assignment), new Dictionary<string, string[]>());
    }

    public AssignmentCommandResult? Start(Guid id)
    {
        var assignment = FindAssignment(id);
        if (assignment is null)
        {
            return null;
        }

        if (assignment.Status == AssignmentStatusValues.InProgress || assignment.Status == AssignmentStatusValues.Completed)
        {
            return new AssignmentCommandResult(MapAssignment(assignment), false, "Назначение уже запущено или завершено.");
        }

        if (assignment.Status == AssignmentStatusValues.Cancelled)
        {
            return new AssignmentCommandResult(MapAssignment(assignment), false, "Отмененное назначение не запускается.");
        }

        assignment.Status = AssignmentStatusValues.InProgress;
        if (assignment.PatrolRequest is not null)
        {
            assignment.PatrolRequest.Status = AssignmentStatusValues.InProgress;
        }

        assignment.StartedAt ??= DateTimeOffset.UtcNow;
        assignment.ProgressPercent = Math.Max(assignment.ProgressPercent, 1);
        assignment.LockVersion++;
        SaveChangesAndInvalidateDashboardSummary();

        return new AssignmentCommandResult(MapAssignment(assignment), true, "Назначение запущено.");
    }

    public AssignmentCommandResult? Cancel(Guid id)
    {
        var assignment = FindAssignment(id);
        if (assignment is null)
        {
            return null;
        }

        if (assignment.Status == AssignmentStatusValues.Cancelled || assignment.Status == AssignmentStatusValues.Completed)
        {
            return new AssignmentCommandResult(MapAssignment(assignment), false, "Назначение уже закрыто.");
        }

        assignment.Status = AssignmentStatusValues.Cancelled;
        if (assignment.PatrolRequest is not null)
        {
            assignment.PatrolRequest.Status = AssignmentStatusValues.Cancelled;
        }

        AddMobileNotificationForEmployee(
                assignment.EmployeeId,
                "patrolAssignmentCancelled",
                "Маршрут отменен",
                BuildAssignmentCancellationNotificationText(
                    assignment.Employee?.FullName ?? assignment.PatrolRequest?.EmployeeName ?? "сотрудник",
                    assignment.Route?.Name ?? assignment.PatrolRequest?.RouteName ?? "маршрут",
                    assignment.PlannedAt),
                "assignment",
                assignment.Id.ToString(),
                $"patrol-assignment-cancelled:{assignment.Id}");
        assignment.LockVersion++;
        SaveChangesAndInvalidateDashboardSummary();

        return new AssignmentCommandResult(MapAssignment(assignment), true, "Назначение отменено.");
    }

    public AssignmentCommandResult? Complete(Guid id, CompleteAssignmentDto? request = null)
    {
        var assignment = FindAssignment(id);
        if (assignment is null)
        {
            return null;
        }

        if (assignment.Status == AssignmentStatusValues.Completed)
        {
            var hasResult = dbContext.PatrolResults.Any(result => result.AssignmentId == assignment.Id);
            if (!hasResult && request is not null)
            {
                var backfillErrors = ValidateCompleteAssignment(request, assignment.Route?.Points);
                if (backfillErrors.Count > 0)
                {
                    return new AssignmentCommandResult(MapAssignment(assignment), false, "Результат обхода не сохранен.", backfillErrors);
                }

                var backfillActualAt = request.ActualAt!.Value.ToUniversalTime();
                assignment.FinishedAt ??= backfillActualAt;
                if (assignment.PatrolRequest is not null)
                {
                    assignment.PatrolRequest.Status = AssignmentStatusValues.Completed;
                }

                UpsertPatrolResult(assignment, request, backfillActualAt, DateTimeOffset.UtcNow);
                SaveChangesAndInvalidateDashboardSummary();

                return new AssignmentCommandResult(MapAssignment(assignment), true, "Результат завершенного назначения сохранен.");
            }

            return new AssignmentCommandResult(MapAssignment(assignment), false, "Назначение уже завершено.");
        }

        if (assignment.Status == AssignmentStatusValues.Cancelled)
        {
            return new AssignmentCommandResult(MapAssignment(assignment), false, "Отмененное назначение не завершается.");
        }

        var errors = ValidateCompleteAssignment(request, assignment.Route?.Points);
        if (errors.Count > 0)
        {
            return new AssignmentCommandResult(MapAssignment(assignment), false, "Результат обхода не сохранен.", errors);
        }

        var actualAt = request!.ActualAt!.Value.ToUniversalTime();
        assignment.Status = AssignmentStatusValues.Completed;
        if (assignment.PatrolRequest is not null)
        {
            assignment.PatrolRequest.Status = AssignmentStatusValues.Completed;
        }

        assignment.StartedAt ??= assignment.PlannedAt <= actualAt ? assignment.PlannedAt : actualAt;
        assignment.FinishedAt = actualAt;
        assignment.ProgressPercent = 100;
        assignment.LockVersion++;
        UpsertPatrolResult(assignment, request, actualAt, DateTimeOffset.UtcNow);
        SaveChangesAndInvalidateDashboardSummary();

        return new AssignmentCommandResult(MapAssignment(assignment), true, "Назначение завершено.");
    }

    private IQueryable<AssignmentEntity> GetAssignmentQuery() =>
        dbContext.Assignments
            .AsNoTracking()
            .Include(assignment => assignment.Employee)
            .Include(assignment => assignment.Route)
            .Include(assignment => assignment.PatrolRequest);

    private IReadOnlyList<AssignmentEntity> GetCurrentAssignmentEntities(DateTimeOffset now)
    {
        var settings = EnsureAssignmentSettings();
        var recentWindowStart = now.AddDays(-2);
        return GetAssignmentQuery()
            .Where(assignment =>
                (AssignmentStatusValues.Active.Contains(assignment.Status) || AssignmentStatusValues.Delayed.Contains(assignment.Status))
                && assignment.FinishedAt == null
                && !dbContext.PatrolResults.Any(result => result.AssignmentId == assignment.Id)
                && (assignment.StartedAt != null || assignment.PlannedAt >= recentWindowStart))
            .AsEnumerable()
            .Where(assignment => IsCurrentAssignmentWindow(assignment, settings, now))
            .ToList();
    }

    private AssignmentEntity? FindAssignment(Guid id) =>
        dbContext.Assignments
            .Include(assignment => assignment.Employee)
            .Include(assignment => assignment.Route)
            .ThenInclude(route => route!.Points)
            .Include(assignment => assignment.PatrolRequest)
            .FirstOrDefault(assignment => assignment.Id == id);

    private AssignmentEntity? FindReusableAssignment(
        CreateAssignmentDto request,
        PatrolRequestEntity? patrolRequest,
        EmployeeEntity? employee,
        RouteEntity? route)
    {
        if (request.PatrolRequestId is null || patrolRequest is null || employee is null || route is null)
        {
            return null;
        }

        var assignment = dbContext.Assignments
            .Include(item => item.Employee)
            .Include(item => item.Route)
            .Include(item => item.PatrolRequest)
            .FirstOrDefault(item =>
                item.PatrolRequestId == request.PatrolRequestId.Value
                && item.Status != AssignmentStatusValues.Completed
                && item.Status != AssignmentStatusValues.Cancelled);

        if (assignment is null || assignment.EmployeeId != employee.Id || assignment.RouteId != route.Id)
        {
            return null;
        }

        return assignment;
    }

    private Dictionary<string, string[]> ValidateCreateAssignment(
        CreateAssignmentDto request,
        PatrolRequestEntity? patrolRequest,
        EmployeeEntity? employee,
        RouteEntity? route)
    {
        var errors = new Dictionary<string, string[]>();

        if (request.PatrolRequestId is null || request.PatrolRequestId == Guid.Empty)
        {
            errors["patrolRequestId"] = ["Укажите заявку для назначения."];
        }
        else if (patrolRequest is null)
        {
            errors["patrolRequestId"] = ["Заявка не найдена."];
        }
        else if (IsClosedPatrolRequestStatus(patrolRequest.Status))
        {
            errors["patrolRequestId"] = ["Закрытую или отмененную заявку нельзя назначить повторно."];
        }
        else if (dbContext.Assignments.Any(assignment => assignment.PatrolRequestId == request.PatrolRequestId.Value))
        {
            errors["patrolRequestId"] = ["Для заявки уже есть назначение."];
        }

        if (request.EmployeeId is null || request.EmployeeId == Guid.Empty)
        {
            errors["employeeId"] = ["Выберите сотрудника."];
        }
        else if (employee is null)
        {
            errors["employeeId"] = ["Сотрудник не найден."];
        }

        if (request.RouteId is null || request.RouteId == Guid.Empty)
        {
            errors["routeId"] = ["Выберите маршрут."];
        }
        else if (route is null)
        {
            errors["routeId"] = ["Маршрут не найден или перенесен в архив."];
        }
        else if (!RouteHasActivePoints(route.Id))
        {
            errors["routeId"] = ["В маршруте нет активных точек обхода."];
        }

        if (request.PlannedAt is null || request.PlannedAt == default)
        {
            errors["plannedAt"] = ["Укажите дату и время старта."];
        }
        else if (request.PlannedEndAt is not null && request.PlannedEndAt <= request.PlannedAt)
        {
            errors["plannedEndAt"] = ["Крайний срок выполнения должен быть позже времени старта."];
        }

        if (request.Comment?.Length > 300)
        {
            errors["comment"] = ["Комментарий не должен превышать 300 символов."];
        }

        if (request.NotificationText?.Length > 1000)
        {
            errors["notificationText"] = ["Уведомление не должно превышать 1000 символов."];
        }

        var shift = string.IsNullOrWhiteSpace(request.Shift) ? employee?.Shift : request.Shift;
        if (string.IsNullOrWhiteSpace(shift))
        {
            errors["shift"] = ["Укажите смену назначения."];
        }

        if (employee is not null && request.PlannedAt is not null && !string.IsNullOrWhiteSpace(shift))
        {
            AddEmployeeAssignmentConflictError(errors, "employeeId", employee.Id, request.PlannedAt.Value, shift);
        }

        return errors;
    }

    private void AddEmployeeAssignmentConflictError(
        Dictionary<string, string[]> errors,
        string fieldName,
        Guid employeeId,
        DateTimeOffset plannedAt,
        string shift)
    {
        var plannedDateStart = new DateTimeOffset(plannedAt.Year, plannedAt.Month, plannedAt.Day, 0, 0, 0, plannedAt.Offset).ToUniversalTime();
        var plannedDateEnd = plannedDateStart.AddDays(1);
        var hasEmployeeConflict = dbContext.Assignments.Any(assignment =>
            assignment.EmployeeId == employeeId
            && assignment.Status != AssignmentStatusValues.Completed
            && assignment.Status != AssignmentStatusValues.Cancelled
            && assignment.Shift == shift
            && assignment.PlannedAt >= plannedDateStart
            && assignment.PlannedAt < plannedDateEnd);

        if (hasEmployeeConflict)
        {
            errors[fieldName] = ["У сотрудника уже есть активное назначение на эту смену."];
        }
    }

    private static bool IsClosedPatrolRequestStatus(string status)
    {
        var normalized = status.Trim();
        return normalized == "Закрыта"
            || normalized == "Закрыто"
            || normalized == "Завершена"
            || normalized == "Завершено"
            || normalized == "Отменена"
            || normalized == AssignmentStatusValues.Completed
            || normalized == AssignmentStatusValues.Cancelled;
    }

    private static bool IsCurrentAssignmentWindow(AssignmentEntity assignment, AssignmentSettingsEntity settings, DateTimeOffset now)
    {
        if (assignment.Status == AssignmentStatusValues.Completed || assignment.Status == AssignmentStatusValues.Cancelled)
        {
            return false;
        }

        if (!AssignmentStatusValues.Active.Contains(assignment.Status) && !AssignmentStatusValues.Delayed.Contains(assignment.Status))
        {
            return false;
        }

        if (assignment.StartedAt is not null)
        {
            return true;
        }

        return GetAssignmentShiftEnd(assignment, settings).AddHours(1) >= now;
    }

    private static DateTimeOffset GetAssignmentShiftEnd(AssignmentEntity assignment, AssignmentSettingsEntity settings)
    {
        var isNight = assignment.Shift.Contains("ноч", StringComparison.OrdinalIgnoreCase)
            || assignment.Shift.Contains("night", StringComparison.OrdinalIgnoreCase);
        var start = ParseShiftTime(isNight ? settings.NightStart : settings.DayStart, isNight ? new TimeOnly(20, 0) : new TimeOnly(8, 0));
        var end = ParseShiftTime(isNight ? settings.NightEnd : settings.DayEnd, isNight ? new TimeOnly(8, 0) : new TimeOnly(20, 0));
        var plannedLocal = assignment.PlannedAt.ToLocalTime();
        var plannedDate = DateOnly.FromDateTime(plannedLocal.DateTime);
        var plannedTime = TimeOnly.FromDateTime(plannedLocal.DateTime);
        var endDate = plannedDate;

        if (end <= start)
        {
            endDate = plannedTime < end ? plannedDate : plannedDate.AddDays(1);
        }

        var endLocal = endDate.ToDateTime(end);
        return new DateTimeOffset(endLocal, TimeZoneInfo.Local.GetUtcOffset(endLocal)).ToUniversalTime();
    }

    private static TimeOnly ParseShiftTime(string value, TimeOnly fallback) =>
        TimeOnly.TryParseExact(value, "HH:mm", out var parsed) ? parsed : fallback;

    private static AssignmentPaging NormalizeAssignmentPaging(int page, int pageSize)
    {
        var normalizedPageSize = pageSize <= 0 ? DefaultAssignmentPageSize : Math.Min(pageSize, MaxAssignmentPageSize);
        var maxPage = Math.Max(DefaultAssignmentPage, int.MaxValue / normalizedPageSize);
        var normalizedPage = page <= 0 ? DefaultAssignmentPage : Math.Min(page, maxPage);
        return new AssignmentPaging(normalizedPage, normalizedPageSize);
    }

    private sealed record AssignmentPaging(int Page, int PageSize);

    private static AssignmentDto MapAssignment(
        AssignmentEntity assignment,
        DateTimeOffset? resultStartedAt = null,
        DateTimeOffset? resultFinishedAt = null)
    {
        var startedAt = assignment.StartedAt ?? resultStartedAt;
        var finishedAt = assignment.FinishedAt ?? resultFinishedAt;

        return new(
            assignment.Id,
            assignment.PatrolRequestId,
            assignment.EmployeeId,
            assignment.Employee?.FullName ?? assignment.PatrolRequest?.EmployeeName ?? string.Empty,
            assignment.RouteId,
            assignment.Route?.Name ?? assignment.PatrolRequest?.RouteName ?? string.Empty,
            assignment.Shift,
            assignment.Status,
            assignment.PlannedAt,
            startedAt,
            finishedAt,
            assignment.ProgressPercent,
            assignment.PlannedAt.ToLocalTime().ToString("HH:mm"));
    }

    private static string BuildAssignmentCancellationNotificationText(string employeeName, string routeName, DateTimeOffset plannedAt)
    {
        var plannedLocal = plannedAt.ToLocalTime().ToString("dd.MM.yyyy, HH:mm");
        return $"Маршрут \"{routeName}\" для {employeeName} на {plannedLocal} отменен. Начинать обход не нужно.";
    }

    private AssignmentSettingsEntity EnsureAssignmentSettings()
    {
        var settings = dbContext.AssignmentSettings.FirstOrDefault(settings => settings.Id == 1);
        if (settings is not null)
        {
            return settings;
        }

        settings = new AssignmentSettingsEntity
        {
            Id = 1,
            DayStart = "08:00",
            DayEnd = "20:00",
            NightStart = "20:00",
            NightEnd = "08:00",
            UpdatedAt = DateTimeOffset.UtcNow
        };
        dbContext.AssignmentSettings.Add(settings);
        SaveChangesAndInvalidateDashboardSummary();
        return settings;
    }

    private AssignmentSettingsDto MapAssignmentSettings(AssignmentSettingsEntity settings)
    {
        var favoriteEmployeeIds = dbContext.AssignmentFavoriteEmployees
            .AsNoTracking()
            .OrderBy(favorite => favorite.SortOrder)
            .Select(favorite => favorite.EmployeeId)
            .ToList();
        return new AssignmentSettingsDto(
            favoriteEmployeeIds,
            new AssignmentShiftSettingsDto(
                settings.DayStart,
                settings.DayEnd,
                settings.NightStart,
                settings.NightEnd));
    }
}
