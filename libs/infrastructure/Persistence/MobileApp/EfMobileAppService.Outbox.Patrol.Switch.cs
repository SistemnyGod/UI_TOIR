using Microsoft.EntityFrameworkCore;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfMobileAppService
{
    private MobileOutboxResponseDto ProcessSwitchPatrolAssignment(MobileAccountEntity account, MobileOutboxCommandDto command)
    {
        var sourceId = ReadGuid(command.Payload, "sourceAssignmentId");
        var targetId = ReadGuid(command.Payload, "assignmentId");
        var sourceRevision = ReadLong(command.Payload, "sourceRevision");
        var targetRevision = ReadLong(command.Payload, "targetRevision");
        if (sourceId is null || targetId is null || sourceId == targetId || sourceRevision is null || targetRevision is null)
            return Rejected(command.ClientOperationId, "Switch requires two assignments and their versions.");

        var allowedEmployees = GetBoundEmployeeIds(account);
        var assignments = dbContext.Assignments.Include(item => item.PatrolRequest)
            .Where(item => (item.Id == sourceId || item.Id == targetId) && allowedEmployees.Contains(item.EmployeeId)).ToArray();
        if (assignments.Length != 2) return Conflict(command.ClientOperationId, "Assignments are not available to this account.");

        // Start/resume use the same employee lock. Always acquire in a stable order.
        if (dbContext.Database.IsNpgsql())
            foreach (var employeeId in assignments.Select(item => item.EmployeeId).Distinct().OrderBy(id => id))
            {
                var key = $"patrol-start:{employeeId:N}";
                dbContext.Database.ExecuteSqlInterpolated($"SELECT pg_advisory_xact_lock(hashtextextended({key}, 0))");
            }
        foreach (var assignment in assignments)
        {
            dbContext.Entry(assignment).Reload();
            if (assignment.PatrolRequest is not null) dbContext.Entry(assignment.PatrolRequest).Reload();
        }
        var source = assignments.Single(item => item.Id == sourceId);
        var target = assignments.Single(item => item.Id == targetId);
        if (source.EmployeeId != target.EmployeeId)
            return Conflict(command.ClientOperationId, "Switch patrols only for the same employee.");
        if (source.LockVersion != sourceRevision || target.LockVersion != targetRevision)
            return Conflict(command.ClientOperationId, "Patrol changed on another device. Refresh before switching.");
        if (source.Status != AssignmentStatusValues.InProgress && source.Status != AssignmentStatusValues.Paused)
            return Conflict(command.ClientOperationId, "Current patrol cannot be paused.");
        if (target.Status != AssignmentStatusValues.Accepted && target.Status != AssignmentStatusValues.Paused)
            return Conflict(command.ClientOperationId, "Choose an accepted or paused patrol.");
        if (assignments.Any(item => item.PatrolRequest?.Status == AssignmentStatusValues.Cancelled
            || item.PatrolRequest?.Status == AssignmentStatusValues.Completed))
            return Conflict(command.ClientOperationId, "Patrol request has been closed by dispatcher.");
        if (dbContext.Assignments.Any(item => item.EmployeeId == target.EmployeeId && item.Id != source.Id
            && item.Id != target.Id && item.Status == AssignmentStatusValues.InProgress))
            return Conflict(command.ClientOperationId, "Employee already has another patrol in progress.");

        source.Status = AssignmentStatusValues.Paused;
        source.LockVersion++;
        if (source.PatrolRequest is not null) source.PatrolRequest.Status = source.Status;
        dbContext.SaveChanges(); // Release the unique active-employee slot inside the command transaction.
        target.Status = AssignmentStatusValues.InProgress;
        target.StartedAt ??= (ReadDateTimeOffset(command.Payload, "switchedAtLocal") ?? DateTimeOffset.UtcNow).ToUniversalTime();
        target.LockVersion++;
        if (target.PatrolRequest is not null) target.PatrolRequest.Status = target.Status;
        return new MobileOutboxResponseDto(command.ClientOperationId, "accepted", target.Id.ToString(), target.LockVersion, "Patrol switched.", null, null);
    }
}
