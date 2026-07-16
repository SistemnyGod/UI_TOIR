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
    Guid? CreatedByUserId,
    string CreatedByName,
    Guid? PlanTaskId,
    string TaskDescription,
    string Status,
    string OperationalStatus,
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
    string Source,
    IReadOnlyList<EmuWorkSessionEmployeeDto> Employees)
{
    public IReadOnlyList<EmuWorkAttachmentDto> Attachments { get; init; } = [];
}

public sealed record EmuWorkAttachmentDto(
    Guid FileId,
    string FileName,
    string ContentType,
    long SizeBytes,
    DateTimeOffset UploadedAt,
    string DownloadUrl);

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
    int OtherWorkMinutes,
    string ParticipationStatus,
    DateTimeOffset? ActiveIntervalStartedAt,
    int PersonalWorkMinutes,
    int PersonalPauseMinutes,
    string CurrentPauseReason,
    IReadOnlyList<EmuWorkParticipationIntervalDto> Intervals);

public sealed record EmuWorkParticipationIntervalDto(
    Guid Id,
    Guid WorkSessionId,
    Guid WorkSessionEmployeeId,
    Guid EmployeeId,
    DateTimeOffset StartedAt,
    DateTimeOffset? EndedAt,
    string Status,
    string Reason,
    string CreatedByName,
    DateTimeOffset CreatedAt);

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

public sealed record EmuShiftTemplateDto(
    Guid Id,
    string Code,
    string Name,
    string ShiftType,
    TimeOnly StartTime,
    TimeOnly EndTime,
    TimeOnly LunchStartTime,
    TimeOnly LunchEndTime,
    bool CrossesMidnight,
    bool IsActive,
    int SortOrder);

public sealed record EmuEmployeeShiftDto(
    Guid Id,
    Guid EmployeeId,
    string EmployeeName,
    DateOnly ShiftDate,
    Guid? TemplateId,
    string ShiftType,
    string ShiftName,
    DateTimeOffset PlannedStartAt,
    DateTimeOffset PlannedEndAt,
    DateTimeOffset ActualStartAt,
    DateTimeOffset ActualEndAt,
    DateTimeOffset LunchStartAt,
    DateTimeOffset LunchEndAt,
    bool LunchTaken,
    bool LunchOverridden,
    string Source,
    string Comment,
    string Reason,
    Guid? AdjustedByUserId,
    string AdjustedByName,
    DateTimeOffset? AdjustedAt,
    int RowVersion);

public sealed record EmuEmployeeShiftIntervalDto(
    string Type,
    DateTimeOffset StartedAt,
    DateTimeOffset EndedAt,
    int Minutes,
    string Label,
    Guid? WorkSessionId,
    string WorkNumber,
    string Reason);

public sealed record EmuEmployeeShiftSummaryDto(
    EmuEmployeeShiftDto Shift,
    int WorkMinutes,
    int PauseMinutes,
    int FreeMinutes,
    int BeforeShiftWorkMinutes,
    int OvertimeMinutes,
    int QuestionableOvertimeMinutes,
    IReadOnlyList<EmuEmployeeShiftIntervalDto> Intervals,
    IReadOnlyList<EmuDecisionDto> Decisions);

public sealed record EmuEmployeeMonthSummaryDto(
    Guid EmployeeId,
    string EmployeeName,
    string Month,
    int ShiftCount,
    int PlannedMinutes,
    int PresenceMinutes,
    int WorkMinutes,
    int PauseMinutes,
    int FreeMinutes,
    int BeforeShiftWorkMinutes,
    int OvertimeMinutes,
    int QuestionableOvertimeMinutes,
    int UndertimeMinutes,
    IReadOnlyList<EmuEmployeeShiftSummaryDto> Shifts);

public sealed record EmuDecisionDto(
    Guid Id,
    string DecisionType,
    string Severity,
    string Status,
    Guid EmployeeId,
    string EmployeeName,
    Guid? WorkSessionId,
    string WorkNumber,
    string SectionName,
    DateOnly ShiftDate,
    DateTimeOffset DetectedAt,
    DateTimeOffset? ResolvedAt,
    Guid? ResolvedByUserId,
    string ResolvedByName,
    string DedupeKey,
    string Resolution,
    string Comment,
    int RowVersion,
    int OverlapMinutes,
    DateTimeOffset? LunchStartAt,
    DateTimeOffset? LunchEndAt);

public sealed record EmuDecisionQueryDto(
    string? Status,
    DateOnly? Date,
    Guid? EmployeeId);

public sealed record EmuResolveDecisionDto(
    string Resolution,
    string Comment,
    int RowVersion);

public sealed record EmuUpdateEmployeeShiftDto(
    Guid EmployeeId,
    DateOnly ShiftDate,
    string ShiftType,
    DateTimeOffset? ActualStartAt,
    DateTimeOffset? ActualEndAt,
    DateTimeOffset? LunchStartAt,
    DateTimeOffset? LunchEndAt,
    bool LunchTaken,
    bool LunchOverridden,
    string Comment,
    string Reason,
    int RowVersion);

public sealed record EmuCreateWorkSessionDto(
    DateOnly WorkDate,
    Guid SectionId,
    DateTimeOffset? ArrivedAt,
    IReadOnlyList<Guid> EmployeeIds,
    string TaskDescription,
    Guid? PlanTaskId = null,
    Guid? ClientWorkSessionId = null);

public sealed record EmuUpdateWorkSessionDto(
    Guid SectionId,
    string TaskDescription,
    int RowVersion,
    string Comment,
    DateOnly? WorkDate = null,
    DateTimeOffset? ArrivedAt = null,
    IReadOnlyList<Guid>? EmployeeIds = null);

public sealed record EmuAddWorkSessionEmployeeDto(
    Guid EmployeeId,
    DateTimeOffset? StartedAt,
    string Comment,
    int RowVersion);

public sealed record EmuFinishWorkSessionEmployeeDto(
    DateTimeOffset? FinishedAt,
    string ParticipationStatus,
    string Comment,
    int RowVersion);

public sealed record EmuMarkMistakenWorkSessionEmployeeDto(
    string Comment,
    int RowVersion);

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

public sealed record EmuCarryOverWorkSessionDto(
    DateOnly ToDate,
    string Comment,
    int RowVersion);

public sealed record EmuWorkSessionQueryDto(
    DateOnly? DateFrom = null,
    DateOnly? DateTo = null,
    Guid? EmployeeId = null,
    Guid? SectionId = null,
    Guid? WaitReasonId = null,
    Guid? NotCompletedReasonId = null,
    string? OperationalStatus = null,
    string? ResultStatus = null,
    string? Status = null,
    bool ProblemOnly = false,
    bool ManualCorrectionsOnly = false,
    bool IncludeDeleted = false,
    int Page = 1,
    int PageSize = 100,
    string? SortBy = null,
    string? ShiftType = null,
    string? EmployeeSearch = null,
    IReadOnlyList<Guid>? AllowedSectionIds = null,
    Guid? CreatedByUserId = null);

public sealed record EmuWorkHistoryReportDto(
    EmuWorkSessionQueryDto AppliedQuery,
    DateTimeOffset GeneratedAt,
    EmuWorkHistoryTotalsDto Totals,
    IReadOnlyList<EmuEmployeeWorkReportDto> Employees,
    IReadOnlyList<EmuSectionWorkReportDto> Sections,
    IReadOnlyList<EmuWorkHistoryExceptionDto> Exceptions);

public sealed record EmuEmployeeWorkHistoryReportDto(
    EmuWorkSessionQueryDto AppliedQuery,
    DateTimeOffset GeneratedAt,
    EmuEmployeeWorkReportDto Employee,
    IReadOnlyList<EmuSectionWorkReportDto> Sections,
    EmuListResponseDto<EmuWorkSessionDto> Works);

public sealed record EmuWorkHistoryTotalsDto(
    int TotalWorks,
    int CompletedWorks,
    int ProblemWorks,
    int DeletedWorks,
    int EmployeeCount,
    int SectionCount,
    int WorkMinutes,
    int WaitingMinutes,
    int OtherWorkMinutes,
    int TotalMinutes,
    int AverageWorkMinutes);

public sealed record EmuEmployeeWorkReportDto(
    Guid EmployeeId,
    string EmployeeName,
    string PersonnelNo,
    string Position,
    string Department,
    int WorkCount,
    int WorkMinutes,
    int WaitingMinutes,
    int OtherWorkMinutes,
    int TotalMinutes,
    int SectionCount);

public sealed record EmuSectionWorkReportDto(
    Guid SectionId,
    string SectionName,
    int WorkCount,
    int EmployeeCount,
    int WorkMinutes,
    int WaitingMinutes,
    int OtherWorkMinutes,
    int TotalMinutes,
    int ProblemWorks);

public sealed record EmuWorkHistoryExceptionDto(
    Guid WorkSessionId,
    string WorkNumber,
    DateOnly WorkDate,
    Guid SectionId,
    string SectionName,
    string Reason,
    string Severity,
    int WorkMinutes,
    int WaitingMinutes,
    int OtherWorkMinutes);

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

public sealed record EmuReschedulePlanTaskDto(
    DateOnly NewPlannedDate,
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
