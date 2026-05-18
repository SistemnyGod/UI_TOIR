namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class RoutePointEntity
{
    public Guid Id { get; set; }

    public Guid RouteId { get; set; }

    public int SequenceNo { get; set; }

    public string Name { get; set; } = string.Empty;

    public string Zone { get; set; } = string.Empty;

    public string Type { get; set; } = string.Empty;

    public string Tag { get; set; } = string.Empty;

    public string Interval { get; set; } = string.Empty;

    public string ExpectedTime { get; set; } = string.Empty;

    public string Status { get; set; } = string.Empty;

    public string? NfcCode { get; set; }

    public bool IsRequired { get; set; }

    public bool RequiresPhoto { get; set; }

    public RouteEntity? Route { get; set; }
}
