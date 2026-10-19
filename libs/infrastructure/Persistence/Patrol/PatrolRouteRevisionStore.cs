using Microsoft.EntityFrameworkCore;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

// The route row is the lock shared by directory writers and assignment snapshots.
// The caller owns the transaction, including saving the assignment and revision.
internal static class PatrolRouteRevisionStore
{
    internal static RouteEntity? LoadForUpdate(Patrol360DbContext db, Guid id, bool includePoints = false)
    {
        Lock(db, id);
        // A permission check or an earlier operation in this scope may have read
        // the route before waiting for the lock. Do not reuse that stale graph.
        var route = db.Routes.SingleOrDefault(row => row.Id == id);
        if (route is null) return null;
        db.Entry(route).Reload();
        if (db.Entry(route).State == EntityState.Detached) return null;
        if (includePoints)
        {
            // Refresh in bulk while preserving tracked instances used by the
            // surrounding unit of work (and by sequential operations).
            var fresh = db.RoutePoints.AsNoTracking().Where(point => point.RouteId == id).ToList();
            var byId = fresh.ToDictionary(point => point.Id);
            foreach (var tracked in db.RoutePoints.Local.Where(point => point.RouteId == id).ToArray())
            {
                if (!byId.TryGetValue(tracked.Id, out var current)) { db.Entry(tracked).State = EntityState.Detached; continue; }
                db.Entry(tracked).CurrentValues.SetValues(current);
                db.Entry(tracked).OriginalValues.SetValues(current);
                byId[tracked.Id] = tracked;
            }
            route.Points = byId.Values.ToList();
            foreach (var point in route.Points)
            {
                point.Route = route;
                if (db.Entry(point).State == EntityState.Detached) db.RoutePoints.Attach(point);
            }
        }
        return route;
    }

    internal static RouteRevisionEntity GetOrCreate(Patrol360DbContext db, RouteEntity route)
    {
        Lock(db, route.Id);
        var existing = db.RouteRevisions.Local.FirstOrDefault(row => row.RouteId == route.Id && row.VersionNo == route.VersionNo)
            ?? db.RouteRevisions.Include(row => row.Points).SingleOrDefault(row => row.RouteId == route.Id && row.VersionNo == route.VersionNo);
        if (existing is not null) return existing;

        var points = db.RoutePoints.AsNoTracking().Where(point => point.RouteId == route.Id).OrderBy(point => point.SequenceNo).ToList();
        var revision = new RouteRevisionEntity
        {
            Id = Guid.NewGuid(), RouteId = route.Id, VersionNo = route.VersionNo,
            Name = route.Name, Territory = route.Territory, AllowFreeOrder = route.AllowFreeOrder,
            NfcEnabled = route.NfcEnabled, QrFallbackEnabled = route.QrFallbackEnabled, CreatedAt = DateTimeOffset.UtcNow,
            Points = points.Select(point => new RouteRevisionPointEntity
            {
                Id = Guid.NewGuid(), SourceRoutePointId = point.Id, SequenceNo = point.SequenceNo,
                Name = point.Name, Zone = point.Zone, Type = point.Type, Tag = point.Tag,
                Description = point.Description, Instruction = point.Instruction, NfcCode = point.NfcCode,
                IsRequired = point.IsRequired, RequiresPhoto = false, Status = point.Status
            }).ToList()
        };
        db.RouteRevisions.Add(revision);
        return revision;
    }

    private static void Lock(Patrol360DbContext db, Guid id)
    {
        if (db.Database.CurrentTransaction is null)
            throw new InvalidOperationException("Route changes and snapshots require a transaction.");
        db.Database.ExecuteSqlInterpolated($"SELECT 1 FROM routes WHERE id = {id} FOR UPDATE");
    }
}
