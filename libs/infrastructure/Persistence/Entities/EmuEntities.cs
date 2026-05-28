namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class EmuWorkSectionEntity
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

internal sealed class EmuWaitReasonEntity
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

internal sealed class EmuNotCompletedReasonEntity
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

internal sealed class EmuWorkTemplateEntity
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public Guid? SectionId { get; set; }
    public EmuWorkSectionEntity? Section { get; set; }
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

internal sealed class EmuFavoriteEmployeeEntity
{
    public Guid Id { get; set; }
    public Guid EmployeeId { get; set; }
    public EmployeeEntity Employee { get; set; } = null!;
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
}

internal sealed class EmuWorkPlanTaskEntity
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public DateOnly PlannedDate { get; set; }
    public Guid? SectionId { get; set; }
    public EmuWorkSectionEntity? Section { get; set; }
    public string Status { get; set; } = "Запланировано";
    public string ApprovalStatus { get; set; } = "Черновик";
    public string Priority { get; set; } = "Обычный";
    public bool IsRecurring { get; set; }
    public string RecurrenceRule { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public Guid? ApprovedByUserId { get; set; }
    public SiteUserEntity? ApprovedByUser { get; set; }
    public DateTimeOffset? ApprovedAt { get; set; }
    public int RowVersion { get; set; } = 1;
    public List<EmuWorkPlanTaskEmployeeEntity> Employees { get; set; } = [];
}

internal sealed class EmuWorkPlanTaskEmployeeEntity
{
    public Guid Id { get; set; }
    public Guid PlanTaskId { get; set; }
    public EmuWorkPlanTaskEntity PlanTask { get; set; } = null!;
    public Guid EmployeeId { get; set; }
    public EmployeeEntity Employee { get; set; } = null!;
}

internal sealed class EmuWorkSessionEntity
{
    public Guid Id { get; set; }
    public string WorkNumber { get; set; } = string.Empty;
    public DateOnly WorkDate { get; set; }
    public Guid SectionId { get; set; }
    public EmuWorkSectionEntity Section { get; set; } = null!;
    public Guid? PlanTaskId { get; set; }
    public EmuWorkPlanTaskEntity? PlanTask { get; set; }
    public string TaskDescription { get; set; } = string.Empty;
    public string Status { get; set; } = "В работе";
    public string ResultStatus { get; set; } = string.Empty;
    public string ResultComment { get; set; } = string.Empty;
    public Guid? NotCompletedReasonId { get; set; }
    public EmuNotCompletedReasonEntity? NotCompletedReason { get; set; }
    public DateTimeOffset ArrivedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public Guid? CreatedByUserId { get; set; }
    public SiteUserEntity? CreatedByUser { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
    public Guid? DeletedByUserId { get; set; }
    public SiteUserEntity? DeletedByUser { get; set; }
    public string DeleteReason { get; set; } = string.Empty;
    public int WorkMinutes { get; set; }
    public int WaitingMinutes { get; set; }
    public int OtherWorkMinutes { get; set; }
    public int RowVersion { get; set; } = 1;
    public bool IsCarriedOver { get; set; }
    public List<EmuWorkSessionEmployeeEntity> Employees { get; set; } = [];
    public List<EmuWorkPauseEntity> Pauses { get; set; } = [];
    public List<EmuWorkAuditEventEntity> AuditEvents { get; set; } = [];
}

internal sealed class EmuWorkSessionEmployeeEntity
{
    public Guid Id { get; set; }
    public Guid WorkSessionId { get; set; }
    public EmuWorkSessionEntity WorkSession { get; set; } = null!;
    public Guid EmployeeId { get; set; }
    public EmployeeEntity Employee { get; set; } = null!;
    public string FullNameSnapshot { get; set; } = string.Empty;
    public string PositionSnapshot { get; set; } = string.Empty;
    public string Status { get; set; } = "Работает";
    public DateTimeOffset ArrivedAt { get; set; }
    public DateTimeOffset? FinishedAt { get; set; }
    public int WorkMinutes { get; set; }
    public int WaitingMinutes { get; set; }
    public int OtherWorkMinutes { get; set; }
}

internal sealed class EmuWorkPauseEntity
{
    public Guid Id { get; set; }
    public Guid WorkSessionId { get; set; }
    public EmuWorkSessionEntity WorkSession { get; set; } = null!;
    public Guid WaitReasonId { get; set; }
    public EmuWaitReasonEntity WaitReason { get; set; } = null!;
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset? EndedAt { get; set; }
    public string Comment { get; set; } = string.Empty;
    public bool IsOtherWork { get; set; }
    public List<EmuWorkPauseEmployeeEntity> Employees { get; set; } = [];
}

internal sealed class EmuWorkPauseEmployeeEntity
{
    public Guid Id { get; set; }
    public Guid PauseId { get; set; }
    public EmuWorkPauseEntity Pause { get; set; } = null!;
    public Guid EmployeeId { get; set; }
    public EmployeeEntity Employee { get; set; } = null!;
}

internal sealed class EmuWorkSessionCarryOverEntity
{
    public Guid Id { get; set; }
    public Guid WorkSessionId { get; set; }
    public EmuWorkSessionEntity WorkSession { get; set; } = null!;
    public DateOnly FromDate { get; set; }
    public DateOnly ToDate { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

internal sealed class EmuWorkAuditEventEntity
{
    public Guid Id { get; set; }
    public Guid? WorkSessionId { get; set; }
    public EmuWorkSessionEntity? WorkSession { get; set; }
    public Guid? PlanTaskId { get; set; }
    public EmuWorkPlanTaskEntity? PlanTask { get; set; }
    public string EventType { get; set; } = string.Empty;
    public string FromStatus { get; set; } = string.Empty;
    public string ToStatus { get; set; } = string.Empty;
    public string Comment { get; set; } = string.Empty;
    public Guid? ActorUserId { get; set; }
    public SiteUserEntity? ActorUser { get; set; }
    public string Actor { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
}

internal sealed class EmuNotificationEntity
{
    public Guid Id { get; set; }
    public Guid? EmployeeId { get; set; }
    public EmployeeEntity? Employee { get; set; }
    public Guid? WorkSessionId { get; set; }
    public EmuWorkSessionEntity? WorkSession { get; set; }
    public Guid? PlanTaskId { get; set; }
    public EmuWorkPlanTaskEntity? PlanTask { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string Status { get; set; } = "new";
    public DateTimeOffset CreatedAt { get; set; }
}
