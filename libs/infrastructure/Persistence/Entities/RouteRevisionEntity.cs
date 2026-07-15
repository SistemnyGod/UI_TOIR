namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class RouteRevisionEntity
{
    public Guid Id { get; set; }
    public Guid RouteId { get; set; }
    public int VersionNo { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Territory { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    public RouteEntity? Route { get; set; }
    public List<RouteRevisionPointEntity> Points { get; set; } = [];
}
