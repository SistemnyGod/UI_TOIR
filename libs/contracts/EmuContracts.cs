namespace Patrol360.Contracts;

public sealed record EmuListResponseDto<T>(
    IReadOnlyList<T> Rows,
    int Total,
    int Page,
    int PageSize,
    int PageCount);

public sealed record EmuCommandResult<T>(
    T? Value,
    IReadOnlyDictionary<string, string[]> Errors)
{
    public bool Succeeded => Value is not null && Errors.Count == 0;
}

public sealed record EmuReferenceDto(
    Guid Id,
    string Name,
    string Code,
    bool IsActive,
    int SortOrder);

public sealed record EmuSettingsDto(
    IReadOnlyList<EmuReferenceDto> Sections,
    IReadOnlyList<EmuReferenceDto> WaitReasons,
    IReadOnlyList<EmuReferenceDto> NotCompletedReasons,
    IReadOnlyList<EmuWorkTemplateDto> WorkTemplates,
    IReadOnlyList<EmuFavoriteEmployeeDto> FavoriteEmployees);

public sealed record EmuWorkTemplateDto(
    Guid Id,
    string Name,
    string Description,
    Guid? SectionId,
    string SectionName,
    bool IsActive,
    int SortOrder);

public sealed record EmuFavoriteEmployeeDto(
    Guid Id,
    Guid EmployeeId,
    string FullName,
    string PersonnelNo,
    string Position,
    string Department,
    string Status,
    bool IsActive,
    DateTimeOffset CreatedAt);

public sealed record EmuMetricDto(
    string Label,
    string Value,
    string Delta,
    string Tone,
    string Icon);

public sealed record EmuDashboardDto(
    IReadOnlyList<EmuMetricDto> Metrics,
    IReadOnlyList<EmuWorkSessionDto> ActiveWork,
    IReadOnlyList<EmuWorkSessionDto> ForgottenWork,
    IReadOnlyList<EmuAuditEventDto> RecentEvents,
    IReadOnlyList<EmuPlanTaskDto> WeekPlan);

public sealed record EmuWorkSessionDto(
    Guid Id,
    string WorkNumber,
    DateOnly WorkDate,
    Guid SectionId,
    string SectionName,
    string TaskDescription,
    string Status,
    string ResultStatus,
    string ResultComment,
    DateTimeOffset ArrivedAt,
    DateTimeOffset? CompletedAt,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    DateTimeOffset? DeletedAt,
    string DeleteReason,
    int WorkMinutes,
    int WaitingMinutes,
    int OtherWorkMinutes,
    int RowVersion,
    bool IsCarriedOver,
    IReadOnlyList<EmuWorkSessionEmployeeDto> Employees);

public sealed record EmuWorkSessionChangesDto(
    DateTimeOffset ServerTime,
    IReadOnlyList<EmuWorkSessionDto> ChangedSessions,
    IReadOnlyList<Guid> DeletedSessionIds);

public sealed record EmuWorkSessionEmployeeDto(
    Guid Id,
    Guid EmployeeId,
    string FullNameSnapshot,
    string PositionSnapshot,
    string Status,
    DateTimeOffset ArrivedAt,
    DateTimeOffset? FinishedAt,
    int WorkMinutes,
    int WaitingMinutes,
    int OtherWorkMinutes);

public sealed record EmuAuditEventDto(
    Guid Id,
    Guid? WorkSessionId,
    Guid? PlanTaskId,
    string EventType,
    string FromStatus,
    string ToStatus,
    string Comment,
    string Actor,
    DateTimeOffset CreatedAt);

public sealed record EmuCreateWorkSessionDto(
    DateOnly WorkDate,
    Guid SectionId,
    DateTimeOffset? ArrivedAt,
    IReadOnlyList<Guid> EmployeeIds,
    string TaskDescription,
    Guid? PlanTaskId = null);

public sealed record EmuUpdateWorkSessionDto(
    Guid SectionId,
    string TaskDescription,
    int RowVersion,
    string Comment,
    DateOnly? WorkDate = null,
    DateTimeOffset? ArrivedAt = null,
    IReadOnlyList<Guid>? EmployeeIds = null);

public sealed record EmuPauseWorkSessionDto(
    IReadOnlyList<Guid> EmployeeIds,
    Guid WaitReasonId,
    DateTimeOffset? StartedAt,
    string Comment,
    bool MarkAsOtherWork = false,
    int RowVersion = 0);

public sealed record EmuResumeWorkSessionDto(
    IReadOnlyList<Guid> EmployeeIds,
    DateTimeOffset? ResumedAt,
    string Comment,
    int RowVersion = 0);

public sealed record EmuCompleteWorkSessionDto(
    IReadOnlyList<Guid>? EmployeeIds,
    DateTimeOffset? CompletedAt,
    string ResultStatus,
    string ResultComment,
    Guid? NotCompletedReasonId,
    int RowVersion);

public sealed record EmuDeleteWorkSessionDto(
    string Reason,
    int RowVersion);

public sealed record EmuWorkSessionQueryDto(
    DateOnly? DateFrom = null,
    DateOnly? DateTo = null,
    Guid? EmployeeId = null,
    Guid? SectionId = null,
    string? Status = null,
    bool IncludeDeleted = false,
    int Page = 1,
    int PageSize = 100);

public sealed record EmuPlanTaskDto(
    Guid Id,
    string Title,
    string Description,
    DateOnly PlannedDate,
    Guid? SectionId,
    string SectionName,
    string Status,
    string ApprovalStatus,
    string Priority,
    bool IsRecurring,
    string RecurrenceRule,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    int RowVersion,
    IReadOnlyList<Guid> EmployeeIds);

public sealed record EmuPlanTaskChangesDto(
    DateTimeOffset ServerTime,
    IReadOnlyList<EmuPlanTaskDto> ChangedTasks,
    IReadOnlyList<Guid> DeletedTaskIds);

public sealed record EmuUpsertPlanTaskDto(
    string Title,
    string Description,
    DateOnly PlannedDate,
    Guid? SectionId,
    IReadOnlyList<Guid> EmployeeIds,
    string Priority,
    bool IsRecurring,
    string RecurrenceRule,
    int RowVersion = 0);

public sealed record EmuApprovePlanTaskDto(
    bool Approved,
    string Comment,
    int RowVersion);

public sealed record EmuApproveWeekDto(
    DateOnly WeekStart,
    string Comment);

public sealed record EmuCreateReferenceDto(
    string Name,
    int SortOrder = 0);

public sealed record EmuUpdateReferenceDto(
    string Name,
    bool IsActive = true,
    int SortOrder = 0);

public sealed record EmuCreateWorkTemplateDto(
    string Name,
    string Description,
    Guid? SectionId = null,
    int SortOrder = 0);

public sealed record EmuUpdateWorkTemplateDto(
    string Name,
    string Description,
    Guid? SectionId = null,
    bool IsActive = true,
    int SortOrder = 0);

public sealed record EmuAddFavoriteEmployeeDto(
    Guid EmployeeId);
