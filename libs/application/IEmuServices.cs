using Patrol360.Contracts;

namespace Patrol360.Application;

public interface IEmuCatalogService
{
    EmuSettingsDto GetSettings();

    EmuCommandResult<EmuReferenceDto> CreateSection(EmuCreateReferenceDto request);

    EmuCommandResult<EmuReferenceDto> UpdateSection(Guid id, EmuUpdateReferenceDto request);

    EmuCommandResult<EmuReferenceDto> CreateWaitReason(EmuCreateReferenceDto request);

    EmuCommandResult<EmuReferenceDto> UpdateWaitReason(Guid id, EmuUpdateReferenceDto request);

    EmuCommandResult<EmuReferenceDto> CreateNotCompletedReason(EmuCreateReferenceDto request);

    EmuCommandResult<EmuReferenceDto> UpdateNotCompletedReason(Guid id, EmuUpdateReferenceDto request);

    EmuCommandResult<EmuWorkTemplateDto> CreateWorkTemplate(EmuCreateWorkTemplateDto request);

    EmuCommandResult<EmuWorkTemplateDto> UpdateWorkTemplate(Guid id, EmuUpdateWorkTemplateDto request);

    IReadOnlyList<EmuFavoriteEmployeeDto> GetFavoriteEmployees();

    EmuCommandResult<EmuFavoriteEmployeeDto> AddFavoriteEmployee(EmuAddFavoriteEmployeeDto request);

    EmuCommandResult<EmuFavoriteEmployeeDto> RemoveFavoriteEmployee(Guid employeeId);
}

public interface IEmuWorkService
{
    EmuDashboardDto GetDashboard(IReadOnlyList<Guid>? allowedSectionIds = null, Guid? createdByUserId = null);

    EmuListResponseDto<EmuWorkSessionDto> GetWorkSessions(EmuWorkSessionQueryDto query);

    EmuWorkHistoryReportDto GetWorkHistoryReport(EmuWorkSessionQueryDto query);

    EmuCommandResult<EmuEmployeeWorkHistoryReportDto> GetEmployeeWorkHistoryReport(Guid employeeId, EmuWorkSessionQueryDto query);

    EmuWorkSessionChangesDto GetWorkSessionChanges(DateTimeOffset since, IReadOnlyList<Guid>? allowedSectionIds = null, Guid? createdByUserId = null);

    EmuCommandResult<EmuWorkSessionDto> GetWorkSession(Guid id);

    EmuCommandResult<EmuWorkSessionDto> CreateWorkSession(EmuCreateWorkSessionDto request, Guid? actorUserId, string actorName, bool canOverridePlanApproval = false);

    EmuCommandResult<EmuWorkSessionDto> UpdateWorkSession(Guid id, EmuUpdateWorkSessionDto request, Guid? actorUserId, string actorName);

    EmuCommandResult<EmuWorkSessionDto> AddWorkSessionEmployee(Guid id, EmuAddWorkSessionEmployeeDto request, Guid? actorUserId, string actorName);

    EmuCommandResult<EmuWorkSessionDto> FinishWorkSessionEmployee(Guid id, Guid employeeId, EmuFinishWorkSessionEmployeeDto request, Guid? actorUserId, string actorName);

    EmuCommandResult<EmuWorkSessionDto> MarkWorkSessionEmployeeMistaken(Guid id, Guid employeeId, EmuMarkMistakenWorkSessionEmployeeDto request, Guid? actorUserId, string actorName);

    EmuCommandResult<EmuWorkSessionDto> PauseWorkSession(Guid id, EmuPauseWorkSessionDto request, Guid? actorUserId, string actorName);

    EmuCommandResult<EmuWorkSessionDto> ResumeWorkSession(Guid id, EmuResumeWorkSessionDto request, Guid? actorUserId, string actorName);

    EmuCommandResult<EmuWorkSessionDto> CompleteWorkSession(Guid id, EmuCompleteWorkSessionDto request, Guid? actorUserId, string actorName);

    EmuCommandResult<EmuWorkSessionDto> CarryOverWorkSession(Guid id, EmuCarryOverWorkSessionDto request, Guid? actorUserId, string actorName);

    EmuCommandResult<EmuWorkSessionDto> DeleteWorkSession(Guid id, EmuDeleteWorkSessionDto request, Guid? actorUserId, string actorName);

    EmuListResponseDto<EmuAuditEventDto> GetWorkSessionAudit(Guid id, int page = 1, int pageSize = 100);
}

public interface IEmuShiftService
{
    IReadOnlyList<EmuShiftTemplateDto> GetShiftTemplates();

    IReadOnlyList<EmuEmployeeShiftDto> GetEmployeeShifts(DateOnly date, Guid? employeeId = null, IReadOnlyList<Guid>? allowedSectionIds = null);

    EmuCommandResult<EmuEmployeeShiftDto> UpdateEmployeeShift(Guid id, EmuUpdateEmployeeShiftDto request, Guid? actorUserId, string actorName);

    EmuCommandResult<EmuEmployeeShiftSummaryDto> GetEmployeeShiftSummary(Guid employeeId, DateOnly date, IReadOnlyList<Guid>? allowedSectionIds = null);

    EmuCommandResult<EmuEmployeeMonthSummaryDto> GetEmployeeMonthSummary(Guid employeeId, DateOnly month, IReadOnlyList<Guid>? allowedSectionIds = null);

    IReadOnlyList<EmuDecisionDto> GetDecisions(EmuDecisionQueryDto query, IReadOnlyList<Guid>? allowedSectionIds = null);

    EmuCommandResult<EmuDecisionDto> ResolveDecision(Guid id, EmuResolveDecisionDto request, Guid? actorUserId, string actorName, IReadOnlyList<Guid>? allowedSectionIds = null);
}

public interface IEmuPlanService
{
    EmuListResponseDto<EmuPlanTaskDto> GetPlanTasks(DateOnly? weekStart = null, IReadOnlyList<Guid>? allowedSectionIds = null);

    EmuPlanTaskChangesDto GetPlanTaskChanges(DateTimeOffset since, IReadOnlyList<Guid>? allowedSectionIds = null);

    EmuCommandResult<EmuPlanTaskDto> CreatePlanTask(EmuUpsertPlanTaskDto request, Guid? actorUserId, string actorName);

    EmuCommandResult<EmuPlanTaskDto> UpdatePlanTask(Guid id, EmuUpsertPlanTaskDto request, Guid? actorUserId, string actorName, IReadOnlyList<Guid>? allowedSectionIds = null);

    EmuCommandResult<EmuPlanTaskDto> ReschedulePlanTask(Guid id, EmuReschedulePlanTaskDto request, Guid? actorUserId, string actorName, IReadOnlyList<Guid>? allowedSectionIds = null);

    EmuCommandResult<EmuPlanTaskDto> ApprovePlanTask(Guid id, EmuApprovePlanTaskDto request, Guid? actorUserId, string actorName, IReadOnlyList<Guid>? allowedSectionIds = null);

    EmuCommandResult<IReadOnlyList<EmuPlanTaskDto>> ApproveWeek(EmuApproveWeekDto request, Guid? actorUserId, string actorName, IReadOnlyList<Guid>? allowedSectionIds = null);
}

public interface IEmuMaintenanceService
{
    int CarryOverForgottenWork(DateTimeOffset now);

    int RefreshNotifications(DateTimeOffset now);
}
