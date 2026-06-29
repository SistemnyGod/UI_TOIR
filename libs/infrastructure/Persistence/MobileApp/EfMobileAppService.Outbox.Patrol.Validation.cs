using Microsoft.EntityFrameworkCore;
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
            .FirstOrDefault(item => item.Id == assignmentId);

        if (assignment is null || assignment.Route is null)
        {
            return AssignmentPointValidation.Fail(Conflict(clientOperationId, "Assignment is not available."));
        }

        if (!boundEmployeeIds.Contains(assignment.EmployeeId))
        {
            return AssignmentPointValidation.Fail(Conflict(clientOperationId, "Assignment belongs to another employee."));
        }

        var point = assignment.Route.Points.FirstOrDefault(item => item.Id == pointId);
        if (point is null)
        {
            return AssignmentPointValidation.Fail(Conflict(clientOperationId, "Patrol point is not part of assignment route."));
        }

        return new AssignmentPointValidation(true, assignment, point, null);
    }
}
