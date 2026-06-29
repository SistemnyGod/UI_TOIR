using System.Text.Json;
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
                .OrderBy(point => point.SequenceNo)
                .Select(point => new MobilePatrolPointDto(
                    point.Id,
                    route.Id,
                    point.Name,
                    point.SequenceNo,
                    point.NfcCode,
                    string.IsNullOrWhiteSpace(point.Tag) ? null : point.Tag,
                    point.IsRequired,
                    route.VersionNo)))
            .ToArray();

        if (sessionTouched)
        {
            dbContext.SaveChanges();
        }

        return new MobileBootstrapDto(
            MapUser(account),
            MapDevice(account, session),
            BuildMobileEmployees(boundEmployeeIds),
            BuildMobileEmuSections(),
            requestBoard,
            assignments,
            routeDtos,
            pointDtos,
            DateTimeOffset.UtcNow,
            DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString());
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


    private IReadOnlyList<MobilePatrolRequestBoardItemDto> BuildRequestBoard(IReadOnlySet<Guid> boundEmployeeIds)
    {
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

    private IReadOnlyList<MobilePatrolAssignmentDto> BuildAssignments(IReadOnlySet<Guid> boundEmployeeIds)
    {
        return dbContext.Assignments
            .AsNoTracking()
            .Where(assignment => boundEmployeeIds.Contains(assignment.EmployeeId))
            .Where(assignment => assignment.Status != AssignmentStatusValues.Completed
                && assignment.Status != AssignmentStatusValues.Cancelled)
            .OrderBy(assignment => assignment.PlannedAt)
            .Select(assignment => new MobilePatrolAssignmentDto(
                assignment.Id,
                assignment.PatrolRequestId,
                assignment.RouteId,
                MapAssignmentStatus(assignment.Status),
                assignment.StartedAt,
                assignment.FinishedAt,
                assignment.LockVersion))
            .ToArray();
    }

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
