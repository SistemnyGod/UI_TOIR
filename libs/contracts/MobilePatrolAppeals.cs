namespace Patrol360.Contracts;

public sealed record MobilePatrolAppealDto(Guid Id, Guid AssignmentId, string RouteName, string EmployeeName,
    string DeviceId, string Kind, string Message, string Status, string Reply, DateTimeOffset CreatedAt,
    DateTimeOffset? ResolvedAt, long Version, long AssignmentVersion);
public sealed record MobilePatrolAppealPageDto(IReadOnlyList<MobilePatrolAppealDto> Items, string? NextCursor);
public sealed record ResolveMobilePatrolAppealDto(string Decision, string Reply, long ExpectedVersion, long ExpectedAssignmentVersion);
