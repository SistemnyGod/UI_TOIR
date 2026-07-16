using Microsoft.EntityFrameworkCore;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;
namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfMobileAppService
{
    private MobileOutboxResponseDto ProcessTakePatrolRequest(MobileAccountEntity account, MobileOutboxCommandDto command)
    {
        var boundEmployeeIds = GetBoundEmployeeIds(account);
        if (boundEmployeeIds.Count == 0)
        {
            return Rejected(command.ClientOperationId, "Mobile account has no linked employees.");
        }

        var requestId = ReadGuid(command.Payload, "requestId");
        var routeId = ReadGuid(command.Payload, "routeId");
        var requestRevision = ReadLong(command.Payload, "requestRevision");
        if (requestId is null || routeId is null || requestRevision is null)
        {
            return Rejected(command.ClientOperationId, "takePatrolRequest payload is incomplete.");
        }

        if (!Guid.TryParse(command.EntityLocalId, out var clientAssignmentId))
        {
            return Rejected(command.ClientOperationId, "takePatrolRequest entityLocalId must contain client assignment id.");
        }

        var patrolRequest = dbContext.PatrolRequests
            .Include(item => item.Assignment)
            .FirstOrDefault(item => item.Id == requestId.Value);
        if (patrolRequest is null || patrolRequest.RouteId != routeId.Value)
        {
            return Conflict(command.ClientOperationId, "Patrol request is not available on the server.");
        }

        var serverRevision = patrolRequest.CreatedAt.ToUnixTimeMilliseconds();
        if (serverRevision != requestRevision.Value)
        {
            return Conflict(command.ClientOperationId, "Patrol request was changed after mobile bootstrap.");
        }

        if (patrolRequest.EmployeeId is not null && !boundEmployeeIds.Contains(patrolRequest.EmployeeId.Value))
        {
            return Conflict(command.ClientOperationId, "Patrol request belongs to another employee.");
        }

        if (patrolRequest.Assignment is not null)
        {
            return Conflict(command.ClientOperationId, "Patrol request is already assigned.");
        }

        if (dbContext.Assignments.Any(item => item.Id == clientAssignmentId))
        {
            return Conflict(command.ClientOperationId, "Client assignment id is already used.");
        }

        var employeeId = patrolRequest.EmployeeId ?? boundEmployeeIds.First();
        var employee = dbContext.Employees.FirstOrDefault(item => item.Id == employeeId);
        var route = dbContext.Routes.FirstOrDefault(item => item.Id == routeId.Value && !item.IsArchived);
        if (employee is null || route is null)
        {
            return Conflict(command.ClientOperationId, "Employee or route is no longer available.");
        }

        var routeRevision = GetOrCreateCurrentRouteRevision(route);

        var startedAt = ReadDateTimeOffset(command.Payload, "takenAtLocal") ?? DateTimeOffset.UtcNow;
        var assignment = new AssignmentEntity
        {
            Id = clientAssignmentId,
            PatrolRequestId = patrolRequest.Id,
            EmployeeId = employee.Id,
            RouteId = route.Id,
            RouteVersionNo = route.VersionNo,
            RouteRevisionId = routeRevision.Id,
            RouteRevision = routeRevision,
            Shift = string.IsNullOrWhiteSpace(employee.Shift) ? "-" : employee.Shift,
            Status = AssignmentStatusValues.InProgress,
            PlannedAt = BuildPlannedStartAt(patrolRequest.ScheduledDate, patrolRequest.ScheduledTime),
            StartedAt = startedAt.ToUniversalTime(),
            ProgressPercent = 1,
            LockVersion = 1,
        };

        patrolRequest.EmployeeId ??= employee.Id;
        patrolRequest.EmployeeName = employee.FullName;
        patrolRequest.RouteId = route.Id;
        patrolRequest.RouteName = route.Name;
        patrolRequest.Status = AssignmentStatusValues.InProgress;
        dbContext.Assignments.Add(assignment);

        return new MobileOutboxResponseDto(
            command.ClientOperationId,
            "accepted",
            assignment.Id.ToString(),
            assignment.LockVersion,
            "Request assigned",
            null,
            null);
    }

    private MobileOutboxResponseDto ProcessAcceptPatrolRequest(MobileAccountEntity account, MobileOutboxCommandDto command)
    {
        var boundEmployeeIds = GetBoundEmployeeIds(account);
        if (boundEmployeeIds.Count == 0)
        {
            return Rejected(command.ClientOperationId, "Mobile account has no linked employees.");
        }

        var requestId = ReadGuid(command.Payload, "requestId");
        var routeId = ReadGuid(command.Payload, "routeId");
        var requestRevision = ReadLong(command.Payload, "requestRevision");
        if (requestId is null || routeId is null || requestRevision is null)
        {
            return Rejected(command.ClientOperationId, "acceptPatrolRequest payload is incomplete.");
        }

        if (!Guid.TryParse(command.EntityLocalId, out var clientAssignmentId))
        {
            return Rejected(command.ClientOperationId, "acceptPatrolRequest entityLocalId must contain client assignment id.");
        }

        var patrolRequest = dbContext.PatrolRequests
            .Include(item => item.Assignment)
            .FirstOrDefault(item => item.Id == requestId.Value);
        if (patrolRequest is null || patrolRequest.RouteId != routeId.Value)
        {
            return Conflict(command.ClientOperationId, "Patrol request is not available on the server.");
        }

        var serverRevision = patrolRequest.CreatedAt.ToUnixTimeMilliseconds();
        if (serverRevision != requestRevision.Value)
        {
            return Conflict(command.ClientOperationId, "Patrol request was changed after mobile bootstrap.");
        }

        if (patrolRequest.EmployeeId is not null && !boundEmployeeIds.Contains(patrolRequest.EmployeeId.Value))
        {
            return Conflict(command.ClientOperationId, "Patrol request belongs to another employee.");
        }

        if (patrolRequest.Assignment is not null)
        {
            if (!boundEmployeeIds.Contains(patrolRequest.Assignment.EmployeeId))
            {
                return Conflict(command.ClientOperationId, "Patrol request is already assigned to another employee.");
            }

            if (patrolRequest.Assignment.Status == AssignmentStatusValues.Cancelled || patrolRequest.Assignment.Status == AssignmentStatusValues.Completed)
            {
                return Conflict(command.ClientOperationId, "Patrol request is already closed.");
            }

            patrolRequest.Assignment.Status = AssignmentStatusValues.Accepted;
            patrolRequest.Assignment.LockVersion += 1;
            patrolRequest.Status = AssignmentStatusValues.Accepted;
            return new MobileOutboxResponseDto(
                command.ClientOperationId,
                "accepted",
                patrolRequest.Assignment.Id.ToString(),
                patrolRequest.Assignment.LockVersion,
                "Request accepted.",
                null,
                null);
        }

        if (dbContext.Assignments.Any(item => item.Id == clientAssignmentId))
        {
            return Conflict(command.ClientOperationId, "Client assignment id is already used.");
        }

        var employeeId = patrolRequest.EmployeeId ?? boundEmployeeIds.First();
        var employee = dbContext.Employees.FirstOrDefault(item => item.Id == employeeId);
        var route = dbContext.Routes.FirstOrDefault(item => item.Id == routeId.Value && !item.IsArchived);
        if (employee is null || route is null)
        {
            return Conflict(command.ClientOperationId, "Employee or route is no longer available.");
        }

        var routeRevision = GetOrCreateCurrentRouteRevision(route);

        var assignment = new AssignmentEntity
        {
            Id = clientAssignmentId,
            PatrolRequestId = patrolRequest.Id,
            EmployeeId = employee.Id,
            RouteId = route.Id,
            RouteVersionNo = route.VersionNo,
            RouteRevisionId = routeRevision.Id,
            RouteRevision = routeRevision,
            Shift = string.IsNullOrWhiteSpace(employee.Shift) ? "-" : employee.Shift,
            Status = AssignmentStatusValues.Accepted,
            PlannedAt = BuildPlannedStartAt(patrolRequest.ScheduledDate, patrolRequest.ScheduledTime),
            StartedAt = null,
            ProgressPercent = 0,
            LockVersion = 1,
        };

        patrolRequest.EmployeeId ??= employee.Id;
        patrolRequest.EmployeeName = employee.FullName;
        patrolRequest.RouteId = route.Id;
        patrolRequest.RouteName = route.Name;
        patrolRequest.Status = AssignmentStatusValues.Accepted;
        dbContext.Assignments.Add(assignment);

        return new MobileOutboxResponseDto(
            command.ClientOperationId,
            "accepted",
            assignment.Id.ToString(),
            assignment.LockVersion,
            "Request accepted.",
            null,
            null);
    }

    private MobileOutboxResponseDto ProcessReleasePatrolRequest(MobileAccountEntity account, MobileOutboxCommandDto command)
    {
        var assignment = FindMobileAssignment(account, command, includeRequest: true);
        if (assignment is null)
        {
            return Conflict(command.ClientOperationId, "Assignment is not available.");
        }

        if (assignment.Status != AssignmentStatusValues.Accepted && assignment.Status != AssignmentStatusValues.Assigned && assignment.Status != AssignmentStatusValues.Waiting)
        {
            return Rejected(command.ClientOperationId, "Only accepted patrol request can be returned before start.");
        }

        var hasResults = dbContext.PatrolResults.Any(result => result.AssignmentId == assignment.Id);
        if (hasResults || assignment.StartedAt is not null)
        {
            return Conflict(command.ClientOperationId, "Started patrol request cannot be returned.");
        }

        var patrolRequest = assignment.PatrolRequest;
        if (patrolRequest is not null)
        {
            patrolRequest.Status = patrolRequest.EmployeeId is null ? AssignmentStatusValues.Waiting : AssignmentStatusValues.Assigned;
        }

        dbContext.Assignments.Remove(assignment);
        return new MobileOutboxResponseDto(command.ClientOperationId, "accepted", null, null, "Request returned.", null, null);
    }

    private MobileOutboxResponseDto ProcessStartPatrolAssignment(MobileAccountEntity account, MobileOutboxCommandDto command)
    {
        var assignment = FindMobileAssignment(account, command, includeRequest: true);
        if (assignment is null)
        {
            return Conflict(command.ClientOperationId, "Assignment is not available.");
        }

        if (assignment.Status == AssignmentStatusValues.Cancelled || assignment.Status == AssignmentStatusValues.Completed)
        {
            return assignment.Status == AssignmentStatusValues.Cancelled
                ? Conflict(command.ClientOperationId, "Closed patrol assignment cannot be started.", "assignmentCancelled")
                : Conflict(command.ClientOperationId, "Closed patrol assignment cannot be started.");
        }

        if (dbContext.Database.IsNpgsql())
        {
            var employeeStartLock = $"patrol-start:{assignment.EmployeeId:N}";
            dbContext.Database.ExecuteSqlInterpolated(
                $"SELECT pg_advisory_xact_lock(hashtextextended({employeeStartLock}, 0))");
        }

        if (dbContext.Assignments.Any(item =>
            item.EmployeeId == assignment.EmployeeId
            && item.Id != assignment.Id
            && (item.Status == AssignmentStatusValues.InProgress
                || item.Status == AssignmentStatusValues.Paused)))
        {
            return Conflict(command.ClientOperationId, "Employee already has another started or paused patrol.");
        }

        var startedAt = ReadDateTimeOffset(command.Payload, "startedAtLocal") ?? DateTimeOffset.UtcNow;
        assignment.Status = AssignmentStatusValues.InProgress;
        assignment.StartedAt ??= startedAt.ToUniversalTime();
        assignment.ProgressPercent = Math.Max(assignment.ProgressPercent, 1);
        assignment.LockVersion += 1;
        if (assignment.PatrolRequest is not null)
        {
            assignment.PatrolRequest.Status = AssignmentStatusValues.InProgress;
        }

        return new MobileOutboxResponseDto(command.ClientOperationId, "accepted", assignment.Id.ToString(), assignment.LockVersion, "Patrol assignment started.", null, null);
    }

    private MobileOutboxResponseDto ProcessPausePatrolAssignment(MobileAccountEntity account, MobileOutboxCommandDto command)
    {
        var assignment = FindMobileAssignment(account, command, includeRequest: true);
        if (assignment is null)
        {
            return Conflict(command.ClientOperationId, "Assignment is not available.");
        }

        if (assignment.Status != AssignmentStatusValues.InProgress)
        {
            return Rejected(command.ClientOperationId, "Only patrol in progress can be paused.");
        }

        assignment.Status = AssignmentStatusValues.Paused;
        assignment.LockVersion += 1;
        if (assignment.PatrolRequest is not null)
        {
            assignment.PatrolRequest.Status = AssignmentStatusValues.Paused;
        }

        return new MobileOutboxResponseDto(command.ClientOperationId, "accepted", assignment.Id.ToString(), assignment.LockVersion, "Patrol assignment paused.", null, null);
    }

    private MobileOutboxResponseDto ProcessResumePatrolAssignment(MobileAccountEntity account, MobileOutboxCommandDto command)
    {
        var assignment = FindMobileAssignment(account, command, includeRequest: true);
        if (assignment is null)
        {
            return Conflict(command.ClientOperationId, "Assignment is not available.");
        }

        if (assignment.Status != AssignmentStatusValues.Paused)
        {
            return Rejected(command.ClientOperationId, "Only paused patrol can be resumed.");
        }

        if (dbContext.Assignments.Any(item =>
            item.EmployeeId == assignment.EmployeeId
            && item.Id != assignment.Id
            && item.Status == AssignmentStatusValues.InProgress))
        {
            return Conflict(command.ClientOperationId, "Employee already has another patrol in progress.");
        }

        assignment.Status = AssignmentStatusValues.InProgress;
        assignment.LockVersion += 1;
        if (assignment.PatrolRequest is not null)
        {
            assignment.PatrolRequest.Status = AssignmentStatusValues.InProgress;
        }

        return new MobileOutboxResponseDto(command.ClientOperationId, "accepted", assignment.Id.ToString(), assignment.LockVersion, "Patrol assignment resumed.", null, null);
    }

    private MobileOutboxResponseDto ProcessHandoffPatrolAssignment(MobileAccountEntity account, MobileOutboxCommandDto command)
    {
        var assignment = FindMobileAssignment(account, command, includeRequest: true);
        if (assignment is null)
        {
            return Conflict(command.ClientOperationId, "Assignment is not available.");
        }

        if (assignment.Status == AssignmentStatusValues.Completed || assignment.Status == AssignmentStatusValues.Cancelled)
        {
            return Conflict(command.ClientOperationId, "Closed patrol assignment cannot be handed off.");
        }

        assignment.Status = AssignmentStatusValues.NeedsDispatcherDecision;
        assignment.LockVersion += 1;
        if (assignment.PatrolRequest is not null)
        {
            assignment.PatrolRequest.Status = AssignmentStatusValues.NeedsDispatcherDecision;
        }

        return new MobileOutboxResponseDto(command.ClientOperationId, "accepted", assignment.Id.ToString(), assignment.LockVersion, "Patrol assignment sent to dispatcher.", null, null);
    }
}
