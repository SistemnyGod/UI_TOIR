namespace Patrol360.Contracts;

// Dispatcher journal row: one handover of an unfinished patrol from one
// employee of the shift to another.
public sealed record PatrolAssignmentTransferDto(
    Guid Id,
    Guid AssignmentId,
    Guid PatrolRequestId,
    string RequestNumber,
    string RouteName,
    Guid FromEmployeeId,
    string FromEmployeeName,
    Guid ToEmployeeId,
    string ToEmployeeName,
    string Mode,
    string Reason,
    string AccountLogin,
    string StatusBefore,
    string StatusAfter,
    int CarriedPointCount,
    string CurrentAssignmentStatus,
    DateTimeOffset TransferredAtLocal,
    DateTimeOffset ReceivedAt);
