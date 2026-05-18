namespace Patrol360.Domain;

public sealed record PatrolRoute(
    Guid Id,
    string Name,
    string Description,
    int VersionNo,
    IReadOnlyList<RoutePoint> Points);

public sealed record RoutePoint(
    Guid Id,
    int SequenceNo,
    string Name,
    string? NfcCode,
    bool IsRequired);
