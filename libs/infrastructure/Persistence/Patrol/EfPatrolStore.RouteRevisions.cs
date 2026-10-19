using Microsoft.EntityFrameworkCore;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfPatrolStore
{
    private RouteRevisionEntity GetOrCreateCurrentRouteRevision(RouteEntity route) =>
        PatrolRouteRevisionStore.GetOrCreate(dbContext, route);

    private static IReadOnlyList<RoutePointEntity> GetCompletionRoutePoints(AssignmentEntity assignment)
    {
        if (assignment.RouteRevision is not null)
        {
            return assignment.RouteRevision.Points
                .Select(point => new RoutePointEntity
                {
                    Id = point.SourceRoutePointId,
                    RouteId = assignment.RouteId,
                    SequenceNo = point.SequenceNo,
                    Name = point.Name,
                    Zone = point.Zone,
                    Type = point.Type,
                    Tag = point.Tag,
                    Description = point.Description,
                    Instruction = point.Instruction,
                    NfcCode = point.NfcCode,
                    IsRequired = point.IsRequired,
                    RequiresPhoto = point.RequiresPhoto,
                    Status = point.Status
                })
                .ToList();
        }

        return assignment.Route?.Points ?? [];
    }
}
