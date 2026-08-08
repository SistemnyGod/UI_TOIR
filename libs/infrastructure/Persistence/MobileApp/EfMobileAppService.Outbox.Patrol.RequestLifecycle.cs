using Microsoft.EntityFrameworkCore;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;
namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfMobileAppService
{
    private MobileOutboxResponseDto BuildPatrolTransitionResponse(
        MobileOutboxCommandDto command,
        AssignmentEntity assignment,
        PatrolTransitionDecision decision)
    {
        return decision.Kind switch
        {
            PatrolTransitionKind.Duplicate => new MobileOutboxResponseDto(
                command.ClientOperationId,
                "duplicate",
                assignment.Id.ToString(),
                assignment.LockVersion,
                decision.Message,
                null,
                null),
            PatrolTransitionKind.Conflict => Conflict(command.ClientOperationId, decision.Message),
            _ => Rejected(command.ClientOperationId, decision.Message),
        };
    }

    private MobileOutboxResponseDto RejectLegacyTakePatrolRequest(MobileOutboxCommandDto command) =>
        Rejected(command.ClientOperationId, "Manual acceptance is required. Legacy takePatrolRequest is disabled.");


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

        if (patrolRequest.Status == AssignmentStatusValues.Cancelled)
        {
            return Conflict(command.ClientOperationId, "Patrol request was cancelled by dispatcher.", "assignmentCancelled");
        }

        if (patrolRequest.Status == AssignmentStatusValues.Completed)
        {
            return Conflict(command.ClientOperationId, "Patrol request is already completed.");
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

            if (patrolRequest.Assignment.Status == AssignmentStatusValues.Cancelled)
            {
                return Conflict(command.ClientOperationId, "Patrol request was cancelled by dispatcher.", "assignmentCancelled");
            }

            if (patrolRequest.Assignment.Status == AssignmentStatusValues.Completed)
            {
                return Conflict(command.ClientOperationId, "Patrol request is already completed.");
            }

            var acceptTransition = PatrolAssignmentStateMachine.Evaluate(
                "acceptPatrolRequest",
                patrolRequest.Assignment.Status);
            if (acceptTransition.Kind != PatrolTransitionKind.Allowed)
            {
                return BuildPatrolTransitionResponse(command, patrolRequest.Assignment, acceptTransition);
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

        var requestTransition = PatrolAssignmentStateMachine.Evaluate(
            "acceptPatrolRequest",
            patrolRequest.Status);
        if (requestTransition.Kind != PatrolTransitionKind.Allowed)
        {
            return requestTransition.Kind == PatrolTransitionKind.Conflict
                ? Conflict(command.ClientOperationId, requestTransition.Message)
                : Rejected(command.ClientOperationId, requestTransition.Message);
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

        if (assignment.PatrolRequest?.Status == AssignmentStatusValues.Cancelled)
        {
            return Conflict(command.ClientOperationId, "Patrol request was cancelled by dispatcher.", "assignmentCancelled");
        }

        if (assignment.PatrolRequest?.Status == AssignmentStatusValues.Completed)
        {
            return Conflict(command.ClientOperationId, "Patrol request is already completed.");
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

    private MobileOutboxResponseDto ProcessStartPatrolAssignment(
        MobileAccountEntity account,
        MobileOutboxCommandDto command)
    {
        var assignment = FindMobileAssignment(account, command, includeRequest: true);
        if (assignment is null)
        {
            return Conflict(command.ClientOperationId, "Assignment is not available.");
        }

        if (assignment.PatrolRequest?.Status == AssignmentStatusValues.Cancelled)
        {
            return Conflict(command.ClientOperationId, "Patrol request was cancelled by dispatcher.", "assignmentCancelled");
        }

        if (assignment.PatrolRequest?.Status == AssignmentStatusValues.Completed)
        {
            return Conflict(command.ClientOperationId, "Patrol request is already completed.");
        }

        if (assignment.Status == AssignmentStatusValues.Cancelled)
        {
            return Conflict(command.ClientOperationId, "Closed patrol assignment cannot be started.", "assignmentCancelled");
        }

        if (assignment.Status == AssignmentStatusValues.Completed)
        {
            return Conflict(command.ClientOperationId, "Closed patrol assignment cannot be started.");
        }

        var startTransition = PatrolAssignmentStateMachine.Evaluate(
            "startPatrolAssignment",
            assignment.Status);
        if (startTransition.Kind != PatrolTransitionKind.Allowed)
        {
            return BuildPatrolTransitionResponse(command, assignment, startTransition);
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

        if (assignment.PatrolRequest?.Status == AssignmentStatusValues.Cancelled)
        {
            return Conflict(command.ClientOperationId, "Patrol request was cancelled by dispatcher.", "assignmentCancelled");
        }

        if (assignment.PatrolRequest?.Status == AssignmentStatusValues.Completed)
        {
            return Conflict(command.ClientOperationId, "Patrol request is already completed.");
        }

        var pauseTransition = PatrolAssignmentStateMachine.Evaluate(
            "pausePatrolAssignment",
            assignment.Status);
        if (pauseTransition.Kind != PatrolTransitionKind.Allowed)
        {
            return BuildPatrolTransitionResponse(command, assignment, pauseTransition);
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

        if (assignment.PatrolRequest?.Status == AssignmentStatusValues.Cancelled)
        {
            return Conflict(command.ClientOperationId, "Patrol request was cancelled by dispatcher.", "assignmentCancelled");
        }

        if (assignment.PatrolRequest?.Status == AssignmentStatusValues.Completed)
        {
            return Conflict(command.ClientOperationId, "Patrol request is already completed.");
        }

        var resumeTransition = PatrolAssignmentStateMachine.Evaluate(
            "resumePatrolAssignment",
            assignment.Status);
        if (resumeTransition.Kind != PatrolTransitionKind.Allowed)
        {
            return BuildPatrolTransitionResponse(command, assignment, resumeTransition);
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

        if (assignment.PatrolRequest?.Status == AssignmentStatusValues.Cancelled)
        {
            return Conflict(command.ClientOperationId, "Patrol request was cancelled by dispatcher.", "assignmentCancelled");
        }

        if (assignment.PatrolRequest?.Status == AssignmentStatusValues.Completed)
        {
            return Conflict(command.ClientOperationId, "Patrol request is already completed.");
        }

        var handoffTransition = PatrolAssignmentStateMachine.Evaluate(
            "handoffPatrolAssignment",
            assignment.Status);
        if (handoffTransition.Kind != PatrolTransitionKind.Allowed)
        {
            return BuildPatrolTransitionResponse(command, assignment, handoffTransition);
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
