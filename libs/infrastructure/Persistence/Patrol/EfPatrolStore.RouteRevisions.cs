using Microsoft.EntityFrameworkCore;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfPatrolStore
{
    private RouteRevisionEntity GetOrCreateCurrentRouteRevision(RouteEntity route)
    {
        var tracked = dbContext.RouteRevisions.Local
            .FirstOrDefault(item => item.RouteId == route.Id && item.VersionNo == route.VersionNo);
        var existing = tracked ?? dbContext.RouteRevisions
            .Include(item => item.Points)
            .FirstOrDefault(item => item.RouteId == route.Id && item.VersionNo == route.VersionNo);
        if (existing is not null)
        {
            return existing;
        }

        var points = dbContext.RoutePoints
            .Where(point => point.RouteId == route.Id)
            .OrderBy(point => point.SequenceNo)
            .ToList();
        var revision = new RouteRevisionEntity
        {
            Id = Guid.NewGuid(),
            RouteId = route.Id,
            VersionNo = route.VersionNo,
            Name = route.Name,
            Territory = route.Territory,
            CreatedAt = DateTimeOffset.UtcNow,
            Points = points.Select(point => new RouteRevisionPointEntity
            {
                Id = Guid.NewGuid(),
                SourceRoutePointId = point.Id,
                SequenceNo = point.SequenceNo,
                Name = point.Name,
                Zone = point.Zone,
                Type = point.Type,
                Tag = point.Tag,
                NfcCode = point.NfcCode,
                IsRequired = point.IsRequired,
                RequiresPhoto = point.RequiresPhoto,
                Status = point.Status
            }).ToList()
        };
        dbContext.RouteRevisions.Add(revision);
        return revision;
    }

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
