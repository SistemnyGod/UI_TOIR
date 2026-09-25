using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;
namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfMobileAppService
{
    private AssignmentEntity? FindMobileAssignment(
        MobileAccountEntity account,
        MobileOutboxCommandDto command,
        bool includeRequest = false)
    {
        var assignmentId = ReadGuid(command.Payload, "assignmentId");
        if (assignmentId is null && Guid.TryParse(command.EntityLocalId, out var entityLocalId))
        {
            assignmentId = entityLocalId;
        }

        if (assignmentId is null)
        {
            return null;
        }

        var boundEmployeeIds = GetBoundEmployeeIds(account);
        var query = dbContext.Assignments
            .Include(item => item.Employee)
            .Include(item => item.Route)
            .AsQueryable();
        if (includeRequest)
        {
            query = query.Include(item => item.PatrolRequest);
        }

        var assignment = query.FirstOrDefault(item => item.Id == assignmentId.Value);
        if (assignment is null || !boundEmployeeIds.Contains(assignment.EmployeeId))
        {
            return null;
        }

        return assignment;
    }


    private AssignmentPointValidation ValidateAssignmentPoint(MobileAccountEntity account, string clientOperationId, Guid assignmentId, Guid pointId)
    {
        var boundEmployeeIds = GetBoundEmployeeIds(account);
        var assignment = dbContext.Assignments
            .Include(item => item.Route)
                .ThenInclude(route => route!.Points)
            .Include(item => item.RouteRevision)
                .ThenInclude(revision => revision!.Points)
            .Include(item => item.PatrolRequest)
            .FirstOrDefault(item => item.Id == assignmentId);

        if (assignment is null || assignment.Route is null)
        {
            return AssignmentPointValidation.Fail(Conflict(clientOperationId, "Assignment is not available."));
        }

        if (!boundEmployeeIds.Contains(assignment.EmployeeId))
        {
            return AssignmentPointValidation.Fail(Conflict(clientOperationId, "Assignment belongs to another employee."));
        }

        var assignmentCancelled = assignment.Status == AssignmentStatusValues.Cancelled
            || assignment.PatrolRequest?.Status == AssignmentStatusValues.Cancelled;
        var assignmentCompleted = assignment.Status == AssignmentStatusValues.Completed
            || assignment.PatrolRequest?.Status == AssignmentStatusValues.Completed;

        if (assignmentCancelled || assignmentCompleted)
        {
            return AssignmentPointValidation.Fail(
                assignmentCancelled
                    ? Conflict(clientOperationId, "Patrol assignment is already closed.", "assignmentCancelled")
                    : Conflict(clientOperationId, "Patrol assignment is already closed."));
        }

        if (assignment.Status != AssignmentStatusValues.InProgress)
        {
            return AssignmentPointValidation.Fail(Rejected(clientOperationId, "Patrol point actions are allowed only while patrol is in progress."));
        }

        var point = GetAssignedRoutePoints(assignment).FirstOrDefault(item => item.Id == pointId);
        if (point is null)
        {
            return AssignmentPointValidation.Fail(Conflict(clientOperationId, "Patrol point is not part of assignment route."));
        }

        if (!IsMobileRoutePointVisible(point))
        {
            return AssignmentPointValidation.Fail(Conflict(clientOperationId, "Patrol point is not active for mobile assignments."));
        }

        if (!(assignment.RouteRevision?.AllowFreeOrder ?? assignment.Route.AllowFreeOrder))
        {
            var earlierRequiredPointIds = GetAssignedRoutePoints(assignment)
                .Where(item => item.IsRequired && item.SequenceNo < point.SequenceNo)
                .Select(item => item.Id)
                .ToArray();
            if (earlierRequiredPointIds.Length > 0)
            {
                var completedEarlierPointIds = dbContext.PatrolResults
                    .AsNoTracking()
                    .Where(result => result.AssignmentId == assignmentId
                        && result.RoutePointId.HasValue
                        && earlierRequiredPointIds.Contains(result.RoutePointId.Value)
                        && (result.Status == "ok" || result.Status == "issue" || result.Status == "skipped"))
                    .Select(result => result.RoutePointId!.Value)
                    .ToHashSet();
                completedEarlierPointIds.UnionWith(GetConfirmedMobilePointResultIds(account.Id, assignmentId, earlierRequiredPointIds));
                if (earlierRequiredPointIds.Any(id => !completedEarlierPointIds.Contains(id)))
                {
                    return AssignmentPointValidation.Fail(
                        Rejected(clientOperationId, "Сначала завершите обязательные точки по порядку маршрута."));
                }
            }
        }
        return new AssignmentPointValidation(true, assignment, point, null);
    }

    // Point actions are acknowledged before the final report is submitted.
    // PatrolResults is intentionally written only by completion, therefore it
    // cannot be the sole source of truth for a route which requires ordering.
    private HashSet<Guid> GetConfirmedMobilePointResultIds(Guid mobileAccountId, Guid assignmentId, IReadOnlyCollection<Guid> candidatePointIds)
    {
        var candidateIds = candidatePointIds.Select(id => id.ToString()).ToArray();
        if (candidateIds.Length == 0) return [];
        var payloads = dbContext.MobileOutboxOperations
            .AsNoTracking()
            .Where(operation => operation.MobileAccountId == mobileAccountId
                && operation.EntityLocalId != null
                && candidateIds.Contains(operation.EntityLocalId)
                && (operation.Status == "accepted" || operation.Status == "duplicate")
                && (operation.CommandType == "markPatrolPointOk" || operation.CommandType == "markPatrolPointIssue"))
            .Select(operation => operation.PayloadJson)
            .ToArray();
        var pointIds = new HashSet<Guid>();
        foreach (var payload in payloads)
        {
            try
            {
                using var document = JsonDocument.Parse(payload);
                var root = document.RootElement;
                if (!root.TryGetProperty("assignmentId", out var operationAssignment)
                    || !Guid.TryParse(operationAssignment.GetString(), out var operationAssignmentId)
                    || operationAssignmentId != assignmentId
                    || !root.TryGetProperty("pointId", out var point)
                    || !Guid.TryParse(point.GetString(), out var pointId))
                {
                    continue;
                }
                var status = root.TryGetProperty("pointResultStatus", out var statusValue)
                    ? statusValue.GetString()
                    : "ok";
                if (status is "ok" or "issue" or "skipped") pointIds.Add(pointId);
            }
            catch (JsonException)
            {
                // A malformed historical receipt is never evidence that a
                // route point was completed.
            }
        }
        return pointIds;
    }
}
