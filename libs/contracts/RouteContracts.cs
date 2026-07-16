namespace Patrol360.Contracts;

public sealed record RouteDto(
    Guid Id,
    string Name,
    string Description,
    string Territory,
    string Status,
    string Duration,
    string Distance,
    string Periodicity,
    int VersionNo,
    IReadOnlyList<RoutePointDto> Points);

public sealed record RoutePointDto(
    Guid Id,
    int SequenceNo,
    string Name,
    string Zone,
    string Type,
    string Tag,
    string Interval,
    string ExpectedTime,
    string Status,
    string? NfcCode,
    bool IsRequired,
    bool RequiresPhoto);

public sealed record CreateRouteDto(
    string Name,
    string? Description,
    string? Territory,
    string? Status,
    string? Duration,
    string? Distance,
    string? Periodicity);

public sealed record CreateRouteWithPointsDto(
    CreateRouteDto Route,
    IReadOnlyList<CreateRoutePointDto> Points);

public sealed record UpdateRouteDto(
    string Name,
    string? Description,
    string? Territory,
    string? Status,
    string? Duration,
    string? Distance,
    string? Periodicity,
    int? ExpectedVersionNo = null);

public sealed record CreateRoutePointDto(
    string Name,
    string? Zone,
    string? Type,
    string? Tag,
    string? Interval,
    string? ExpectedTime,
    string? Status,
    bool RequiresPhoto);

public sealed record UpdateRoutePointDto(
    string Name,
    string? Zone,
    string? Type,
    string? Tag,
    string? Interval,
    string? ExpectedTime,
    string? Status,
    bool RequiresPhoto);

public sealed record ReorderRoutePointDto(
    int SequenceNo,
    int? ExpectedVersionNo = null);
