namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class RouteRevisionPointEntity
{
    public Guid Id { get; set; }
    public Guid RouteRevisionId { get; set; }
    public Guid SourceRoutePointId { get; set; }
    public int SequenceNo { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Zone { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string Tag { get; set; } = string.Empty;
    public string? NfcCode { get; set; }
    public bool IsRequired { get; set; }
    public bool RequiresPhoto { get; set; }
    public string Status { get; set; } = string.Empty;
    public RouteRevisionEntity? RouteRevision { get; set; }
}
