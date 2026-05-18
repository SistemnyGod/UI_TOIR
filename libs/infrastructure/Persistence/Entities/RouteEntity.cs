namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class RouteEntity
{
    public Guid Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public string Territory { get; set; } = string.Empty;

    public string Status { get; set; } = string.Empty;

    public string Duration { get; set; } = string.Empty;

    public string Distance { get; set; } = string.Empty;

    public string Periodicity { get; set; } = string.Empty;

    public int VersionNo { get; set; }

    public bool IsArchived { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public List<RoutePointEntity> Points { get; set; } = [];
}
