namespace Patrol360.Infrastructure.Persistence.Entities;

// One accepted handover of an unfinished patrol to another employee of the
// shift. The row is written by the transferPatrolAssignment outbox command and
// is never updated afterwards: it is the audit record the dispatcher sees and
// the source of point attribution when the report is completed.
internal sealed class PatrolAssignmentTransferEntity
{
    public Guid Id { get; set; }

    public Guid AssignmentId { get; set; }

    public Guid PatrolRequestId { get; set; }

    public Guid FromEmployeeId { get; set; }

    public string FromEmployeeName { get; set; } = string.Empty;

    public Guid ToEmployeeId { get; set; }

    public string ToEmployeeName { get; set; } = string.Empty;

    // Account of the phone that sent the handover.
    public Guid FromMobileAccountId { get; set; }

    // "sameDevice" when the colleague is bound to the same account (shared
    // shift phone), "otherDevice" when the patrol moves to another account.
    public string Mode { get; set; } = string.Empty;

    public string Reason { get; set; } = string.Empty;

    public string ClientOperationId { get; set; } = string.Empty;

    public string StatusBefore { get; set; } = string.Empty;

    public string StatusAfter { get; set; } = string.Empty;

    // Point results filled by the previous performer, in the same JSON shape as
    // completePatrolAssignment.pointResults.
    public string CarriedPointResultsJson { get; set; } = "[]";

    public int CarriedPointCount { get; set; }

    public DateTimeOffset TransferredAtLocal { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public AssignmentEntity? Assignment { get; set; }

    public MobileAccountEntity? FromMobileAccount { get; set; }
}
