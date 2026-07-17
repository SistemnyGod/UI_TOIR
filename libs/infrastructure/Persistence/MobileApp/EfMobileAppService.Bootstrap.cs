using System.Text.Json;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfMobileAppService
{
    public MobileBootstrapDto? GetBootstrap(string accessToken)
    {
        var session = FindActiveSession(accessToken);
        if (session?.MobileAccount is null)
        {
            return null;
        }

        var sessionTouched = TouchSession(session);
        var account = session.MobileAccount;
        var boundEmployeeIds = GetBoundEmployeeIds(account);
        if (boundEmployeeIds.Count == 0)
        {
            return null;
        }

        var requestBoard = BuildRequestBoard(boundEmployeeIds);
        var assignments = BuildAssignments(boundEmployeeIds);
        var cancelledAssignmentIds = BuildCancelledAssignmentIds(boundEmployeeIds);
        var routeIds = requestBoard.Select(item => item.RouteId)
            .Concat(assignments.Select(item => item.RouteId))
            .ToHashSet();

        var routeIdArray = routeIds.ToArray();
        var pilotRouteNames = PilotRouteNames.Select(name => name.ToLowerInvariant()).ToArray();
        var routes = dbContext.Routes
            .AsNoTracking()
            .Include(route => route.Points)
            .Where(route => !route.IsArchived)
            .Where(route => routeIdArray.Contains(route.Id) || pilotRouteNames.Contains(route.Name.ToLower()))
            .AsEnumerable()
            .OrderBy(route => route.Name)
            .ToList();

        var routeDtos = routes
            .Select(route => new MobilePatrolRouteDto(
                route.Id,
                route.Name,
                route.VersionNo,
                AllowFreeOrder: true,
                NfcEnabled: true,
                QrFallbackEnabled: true))
            .ToArray();

        var pointDtos = routes
            .SelectMany(route => route.Points
                .Where(IsMobileRoutePointVisible)
                .OrderBy(point => point.SequenceNo)
                .Select(point => new MobilePatrolPointDto(
                    point.Id,
                    route.Id,
                    point.Name,
                    point.SequenceNo,
                    point.NfcCode,
                    string.IsNullOrWhiteSpace(point.Tag) ? null : point.Tag,
                    point.IsRequired,
                    point.RequiresPhoto,
                    route.VersionNo,
                    point.Description,
                    point.Instruction)))
            .ToArray();

        if (sessionTouched)
        {
            dbContext.SaveChanges();
        }

        var user = MapUser(account);
        var device = MapDevice(account, session);
        var employees = BuildMobileEmployees(boundEmployeeIds);
        var emuSections = BuildMobileEmuSections();
        var syncCursor = BuildBootstrapCursor(user, device, employees, emuSections, requestBoard, assignments, cancelledAssignmentIds, routeDtos, pointDtos);

        return new MobileBootstrapDto(
            user,
            device,
            employees,
            emuSections,
            requestBoard,
            assignments,
            routeDtos,
            pointDtos,
            DateTimeOffset.UtcNow,
            syncCursor)
        {
            CancelledAssignmentIds = cancelledAssignmentIds
        };
    }

    public MobileDeviceRegistrationDto? RegisterPushToken(string accessToken, MobilePushTokenRegistrationDto request)
    {
        var session = FindActiveSession(accessToken);
        if (session?.MobileAccount is null)
        {
            return null;
        }

        if (string.IsNullOrWhiteSpace(request.DeviceId)
            || string.IsNullOrWhiteSpace(request.PushToken)
            || !string.Equals(session.DeviceId, request.DeviceId, StringComparison.Ordinal))
        {
            return null;
        }

        var now = DateTimeOffset.UtcNow;
        session.PushToken = NormalizeOptionalText(request.PushToken);
        session.PushTokenRegisteredAt = now;
        session.PushTokenRevokedAt = null;
        var normalizedPushToken = session.PushToken;
        foreach (var notification in dbContext.MobileNotifications
            .Where(notification => notification.MobileAccountId == session.MobileAccountId)
            .Where(notification => notification.PushStatus == "waitingSync"))
        {
            notification.PushStatus = "queued";
            notification.PushTokenSnapshot = normalizedPushToken;
            notification.PushLastError = string.Empty;
        }

        TouchSession(session);
        dbContext.SaveChanges();

        return new MobileDeviceRegistrationDto(session.DeviceId, PushEnabled: true, now);
    }

    public IReadOnlyList<MobileNotificationDto> GetNotifications(string accessToken, bool unreadOnly)
    {
        var session = FindActiveSession(accessToken);
        if (session?.MobileAccount is null)
        {
            return [];
        }

        TouchSession(session);
        var query = dbContext.MobileNotifications
            .AsNoTracking()
            .Where(notification => notification.MobileAccountId == session.MobileAccountId);
        if (unreadOnly)
        {
            query = query.Where(notification => notification.ReadAt == null);
        }

        var notifications = query
            .OrderByDescending(notification => notification.CreatedAt)
            .Take(50)
            .AsEnumerable()
            .Select(MapNotification)
            .ToList();

        dbContext.SaveChanges();
        return notifications;
    }

    public MobileNotificationDto? MarkNotificationRead(string accessToken, Guid notificationId)
    {
        var session = FindActiveSession(accessToken);
        if (session?.MobileAccount is null)
        {
            return null;
        }

        var notification = dbContext.MobileNotifications
            .FirstOrDefault(item => item.Id == notificationId && item.MobileAccountId == session.MobileAccountId);
        if (notification is null)
        {
            return null;
        }

        notification.ReadAt ??= DateTimeOffset.UtcNow;
        TouchSession(session);
        dbContext.SaveChanges();

        return MapNotification(notification);
    }

    public IReadOnlyList<MobileWorkTaskDto> GetWorkTasks(string accessToken)
    {
        var session = FindActiveSession(accessToken);
        if (session?.MobileAccount is null)
        {
            return [];
        }

        TouchSession(session);
        var boundEmployeeIds = GetBoundEmployeeIds(session.MobileAccount).ToArray();
        var tasks = BuildWorkTasks(boundEmployeeIds)
            .OrderByDescending(task => task.PlannedAt ?? DateTimeOffset.MinValue)
            .Take(100)
            .ToArray();

        dbContext.SaveChanges();
        return tasks;
    }

    public MobileWorkTaskDto? GetWorkTask(string accessToken, Guid taskId)
    {
        var session = FindActiveSession(accessToken);
        if (session?.MobileAccount is null)
        {
            return null;
        }

        TouchSession(session);
        var boundEmployeeIds = GetBoundEmployeeIds(session.MobileAccount).ToArray();
        var task = BuildWorkTasks(boundEmployeeIds)
            .FirstOrDefault(item => item.TaskId == taskId);

        dbContext.SaveChanges();
        return task;
    }

    public IReadOnlyList<MobileWorkItemDto> GetWorkItemsV2(string accessToken)
    {
        var session = FindActiveSession(accessToken);
        if (session?.MobileAccount is null)
        {
            return [];
        }

        TouchSession(session);
        var boundEmployeeIds = GetBoundEmployeeIds(session.MobileAccount);
        var mobilePlanTaskIds = dbContext.EmuWorkAuditEvents
            .AsNoTracking()
            .Where(row => row.PlanTaskId != null && row.Actor.StartsWith("mobile:"))
            .Select(row => row.PlanTaskId!.Value)
            .ToHashSet();

        var sessionRows = dbContext.EmuWorkSessions
            .AsNoTracking()
            .Include(row => row.Section)
            .Include(row => row.Employees)
            .Where(row => row.DeletedAt == null)
            .Where(row => row.CompletedAt == null || row.Employees.Any(employee => boundEmployeeIds.Contains(employee.EmployeeId)))
            .OrderByDescending(row => row.UpdatedAt)
            .Take(200)
            .ToList();
        var sessionIds = sessionRows.Select(row => row.Id).ToArray();
        var attachmentsByWorkTaskId = sessionIds.Length == 0
            ? new Dictionary<Guid, IReadOnlyList<MobileUploadedFileEntity>>()
            : dbContext.MobileUploadedFiles
                .AsNoTracking()
                .Where(file => file.MobileAccountId == session.MobileAccountId
                    && file.WorkTaskId != null
                    && sessionIds.Contains(file.WorkTaskId.Value))
                .AsEnumerable()
                .GroupBy(file => file.WorkTaskId!.Value)
                .ToDictionary(group => group.Key, group => (IReadOnlyList<MobileUploadedFileEntity>)group.OrderBy(file => file.UploadedAt).ToArray());
        var sessions = sessionRows
            .Select(row => MapMobileWorkSessionItem(
                row,
                boundEmployeeIds,
                attachmentsByWorkTaskId.GetValueOrDefault(row.Id, [])))
            .ToList();

        var startedPlanTaskIds = sessions
            .Where(row => row.PlanTaskId is not null)
            .Select(row => row.PlanTaskId!.Value)
            .ToHashSet();
        var plans = dbContext.EmuWorkPlanTasks
            .AsNoTracking()
            .Include(row => row.Section)
            .Include(row => row.Employees)
                .ThenInclude(row => row.Employee)
            .Where(row => row.ApprovalStatus == "Согласовано" && row.Status == "Запланировано")
            .Where(row => !startedPlanTaskIds.Contains(row.Id))
            .OrderBy(row => row.PlannedDate)
            .Take(200)
            .AsEnumerable()
            .Select(row => MapMobilePlanItem(row, boundEmployeeIds, mobilePlanTaskIds.Contains(row.Id)));

        dbContext.SaveChanges();
        return sessions.Concat(plans)
            .OrderBy(item => item.PlannedAt ?? DateTimeOffset.MaxValue)
            .ThenBy(item => item.Title)
            .ToArray();
    }

    private static MobileWorkItemDto MapMobileWorkSessionItem(
        EmuWorkSessionEntity row,
        IReadOnlySet<Guid> boundEmployeeIds,
        IReadOnlyList<MobileUploadedFileEntity> attachments)
    {
        var participants = row.Employees
            .OrderBy(employee => employee.ArrivedAt)
            .Select(employee => new MobileWorkParticipantDto(
                employee.EmployeeId,
                employee.FullNameSnapshot,
                employee.Status,
                employee.ArrivedAt,
                employee.FinishedAt,
                boundEmployeeIds.Contains(employee.EmployeeId)))
            .ToArray();
        var hasCurrentParticipant = participants.Any(item => item.IsCurrentMobileEmployee && item.FinishedAt is null);
        var hasOtherActiveParticipant = participants.Any(item => !item.IsCurrentMobileEmployee && item.FinishedAt is null);
        var completed = row.CompletedAt is not null;
        var paused = row.Status == "В ожидании";

        return new MobileWorkItemDto(
            row.Id,
            "workSession",
            row.Id,
            row.PlanTaskId,
            row.TaskDescription,
            row.TaskDescription,
            row.SectionId,
            row.Section.Name,
            row.ArrivedAt,
            completed ? "completedServer" : paused ? "paused" : hasCurrentParticipant ? "inProgress" : "available",
            string.Empty,
            row.RowVersion,
            row.Source,
            participants,
            participants,
            attachments.Select(MapMobileWorkAttachment).ToArray(),
            new MobileWorkItemCapabilitiesDto(
                CanStart: false,
                CanJoin: !completed && !hasCurrentParticipant,
                CanReplace: !completed && !hasCurrentParticipant && hasOtherActiveParticipant,
                CanPause: !completed && hasCurrentParticipant && !paused,
                CanResume: !completed && hasCurrentParticipant && paused,
                CanComplete: !completed && hasCurrentParticipant));
    }

    private static MobileWorkAttachmentDto MapMobileWorkAttachment(MobileUploadedFileEntity row) =>
        new(row.Id, row.OriginalFileName, row.ContentType, row.SizeBytes, row.UploadedAt);

    private static MobileWorkItemDto MapMobilePlanItem(
        EmuWorkPlanTaskEntity row,
        IReadOnlySet<Guid> boundEmployeeIds,
        bool createdFromMobile)
    {
        var assigned = row.Employees
            .Select(link => new MobileWorkParticipantDto(
                link.EmployeeId,
                link.Employee.FullName,
                "Назначен",
                null,
                null,
                boundEmployeeIds.Contains(link.EmployeeId)))
            .ToArray();
        return new MobileWorkItemDto(
            row.Id,
            "planTask",
            null,
            row.Id,
            row.Title,
            string.IsNullOrWhiteSpace(row.Description) ? row.Title : row.Description,
            row.SectionId,
            row.Section?.Name ?? "Без участка",
            new DateTimeOffset(row.PlannedDate.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero),
            assigned.Any(item => item.IsCurrentMobileEmployee) ? "assigned" : "available",
            row.ApprovalStatus,
            row.RowVersion,
            createdFromMobile ? "mobile" : "web",
            assigned,
            [],
            [],
            new MobileWorkItemCapabilitiesDto(
                CanStart: true,
                CanJoin: false,
                CanReplace: false,
                CanPause: false,
                CanResume: false,
                CanComplete: false));
    }


    private IReadOnlyList<MobilePatrolRequestBoardItemDto> BuildRequestBoard(IReadOnlySet<Guid> boundEmployeeIds)
    {
        // Filter persisted terminal states before materialising requests and their
        // navigation properties. The legacy free-form status guard remains below.
        var closedPersistedStatuses = new[]
        {
            AssignmentStatusValues.Completed,
            AssignmentStatusValues.Cancelled,
            "completed",
            "cancelled",
            "canceled"
        };

        return dbContext.PatrolRequests
            .AsNoTracking()
            .Include(request => request.Assignment)
                .ThenInclude(assignment => assignment!.Employee)
            .Include(request => request.Employee)
            .Where(request => request.RouteId != null)
            .Where(request =>
                request.EmployeeId == null
                || boundEmployeeIds.Contains(request.EmployeeId.Value)
                || (request.Assignment != null && boundEmployeeIds.Contains(request.Assignment.EmployeeId)))
            .Where(request =>
                request.Assignment == null
                || request.EmployeeId == null
                || request.Assignment.EmployeeId == request.EmployeeId)
            .Where(request => !closedPersistedStatuses.Contains(request.Status))
            .Where(request => request.Assignment == null || !closedPersistedStatuses.Contains(request.Assignment.Status))
            .AsEnumerable()
            .Where(request => !IsClosedRequestStatus(request.Status))
            .Where(request => request.Assignment is null || !IsClosedRequestStatus(request.Assignment.Status))
            .OrderBy(request => request.ScheduledDate)
            .ThenBy(request => request.ScheduledTime)
            .Select(request => new MobilePatrolRequestBoardItemDto(
                request.Id,
                BuildMobileRequestDisplayNumber(request.Id),
                request.RouteId!.Value,
                request.RouteName,
                BuildPlannedStartAt(request.ScheduledDate, request.ScheduledTime),
                ResolveRequestEmployeeName(request),
                MapRequestStatus(request),
                request.CreatedAt.ToUnixTimeMilliseconds()))
            .ToArray();
    }

    private static string BuildBootstrapCursor(
        MobileUserDto user,
        MobileDeviceDto device,
        IReadOnlyList<MobileEmployeeDto> employees,
        IReadOnlyList<MobileEmuSectionDto> emuSections,
        IReadOnlyList<MobilePatrolRequestBoardItemDto> requestBoard,
        IReadOnlyList<MobilePatrolAssignmentDto> assignments,
        IReadOnlyList<Guid> cancelledAssignmentIds,
        IReadOnlyList<MobilePatrolRouteDto> routes,
        IReadOnlyList<MobilePatrolPointDto> points)
    {
        // Do not include server time: an unchanged snapshot must keep the same
        // cursor so the client can skip a costly SQLite rewrite safely.
        var snapshot = JsonSerializer.Serialize(new
        {
            user,
            device,
            employees,
            emuSections,
            requestBoard,
            assignments,
            cancelledAssignmentIds,
            routes,
            points
        }, JsonOptions);
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(snapshot))).ToLowerInvariant();
    }

    private IReadOnlyList<MobilePatrolAssignmentDto> BuildAssignments(IReadOnlySet<Guid> boundEmployeeIds)
    {
        return dbContext.Assignments
            .AsNoTracking()
            .Where(assignment => boundEmployeeIds.Contains(assignment.EmployeeId))
            .Where(assignment => assignment.Status != AssignmentStatusValues.Assigned
                && assignment.Status != AssignmentStatusValues.Waiting)
            .Where(assignment => assignment.Status != AssignmentStatusValues.Completed
                && assignment.Status != AssignmentStatusValues.Cancelled)
            .Where(assignment => assignment.PatrolRequest != null
                && assignment.PatrolRequest.Status != AssignmentStatusValues.Completed
                && assignment.PatrolRequest.Status != AssignmentStatusValues.Cancelled)
            .OrderBy(assignment => assignment.PlannedAt)
            .Select(assignment => new MobilePatrolAssignmentDto(
                assignment.Id,
                assignment.PatrolRequestId,
                assignment.RouteId,
                MapAssignmentStatus(assignment.Status),
                assignment.StartedAt,
                assignment.FinishedAt,
                assignment.LockVersion,
                assignment.RouteVersionNo))
            .ToArray();
    }

    private Guid[] BuildCancelledAssignmentIds(IReadOnlySet<Guid> boundEmployeeIds) =>
        dbContext.Assignments
            .AsNoTracking()
            .Where(assignment => boundEmployeeIds.Contains(assignment.EmployeeId))
            .Where(assignment => assignment.Status == AssignmentStatusValues.Cancelled
                || (assignment.PatrolRequest != null
                    && assignment.PatrolRequest.Status == AssignmentStatusValues.Cancelled))
            .Select(assignment => assignment.Id)
            .ToArray();

    private IReadOnlyList<MobileWorkTaskDto> BuildWorkTasks(IReadOnlyCollection<Guid> boundEmployeeIds)
    {
        if (boundEmployeeIds.Count == 0)
        {
            return [];
        }

        return dbContext.EmuWorkSessions
            .AsNoTracking()
            .Include(workSession => workSession.Section)
            .Include(workSession => workSession.Employees)
                .ThenInclude(employee => employee.Employee)
            .Include(workSession => workSession.Pauses)
            .Where(workSession => workSession.DeletedAt == null)
            .Where(workSession => workSession.Employees.Any(employee => boundEmployeeIds.Contains(employee.EmployeeId)))
            .OrderByDescending(workSession => workSession.ArrivedAt)
            .Take(100)
            .AsEnumerable()
            .Select(workSession => new MobileWorkTaskDto(
                workSession.Id,
                BuildWorkTaskTitle(workSession),
                MapWorkTaskStatus(workSession, boundEmployeeIds),
                workSession.ArrivedAt,
                workSession.RowVersion,
                workSession.CompletedAt,
                workSession.SectionId,
                workSession.Section.Name,
                workSession.Employees.FirstOrDefault(employee => boundEmployeeIds.Contains(employee.EmployeeId))?.EmployeeId,
                workSession.Employees.FirstOrDefault(employee => boundEmployeeIds.Contains(employee.EmployeeId))?.FullNameSnapshot,
                workSession.CreatedAt,
                "synced"))
            .ToArray();
    }

    private IReadOnlyList<MobileEmployeeDto> BuildMobileEmployees(IReadOnlyCollection<Guid> boundEmployeeIds)
    {
        if (boundEmployeeIds.Count == 0)
        {
            return [];
        }

        return dbContext.Employees
            .AsNoTracking()
            .Where(employee => boundEmployeeIds.Contains(employee.Id))
            .OrderBy(employee => employee.FullName)
            .Select(employee => new MobileEmployeeDto(
                employee.Id,
                employee.FullName,
                string.IsNullOrWhiteSpace(employee.Position) ? null : employee.Position,
                string.IsNullOrWhiteSpace(employee.Department) ? null : employee.Department))
            .ToArray();
    }

    private IReadOnlyList<MobileEmuSectionDto> BuildMobileEmuSections() =>
        dbContext.EmuWorkSections
            .AsNoTracking()
            .Where(section => section.IsActive)
            .OrderBy(section => section.SortOrder)
            .ThenBy(section => section.Name)
            .Select(section => new MobileEmuSectionDto(section.Id, section.Name, section.SortOrder))
            .ToArray();
}
