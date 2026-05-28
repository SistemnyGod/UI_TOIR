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
    EmuDashboardDto GetDashboard();

    EmuListResponseDto<EmuWorkSessionDto> GetWorkSessions(EmuWorkSessionQueryDto query);

    EmuWorkSessionChangesDto GetWorkSessionChanges(DateTimeOffset since);

    EmuCommandResult<EmuWorkSessionDto> GetWorkSession(Guid id);

    EmuCommandResult<EmuWorkSessionDto> CreateWorkSession(EmuCreateWorkSessionDto request, Guid? actorUserId, string actorName, bool canOverridePlanApproval = false);

    EmuCommandResult<EmuWorkSessionDto> UpdateWorkSession(Guid id, EmuUpdateWorkSessionDto request, Guid? actorUserId, string actorName);

    EmuCommandResult<EmuWorkSessionDto> PauseWorkSession(Guid id, EmuPauseWorkSessionDto request, Guid? actorUserId, string actorName);

    EmuCommandResult<EmuWorkSessionDto> ResumeWorkSession(Guid id, EmuResumeWorkSessionDto request, Guid? actorUserId, string actorName);

    EmuCommandResult<EmuWorkSessionDto> CompleteWorkSession(Guid id, EmuCompleteWorkSessionDto request, Guid? actorUserId, string actorName);

    EmuCommandResult<EmuWorkSessionDto> DeleteWorkSession(Guid id, EmuDeleteWorkSessionDto request, Guid? actorUserId, string actorName);

    EmuListResponseDto<EmuAuditEventDto> GetWorkSessionAudit(Guid id, int page = 1, int pageSize = 100);
}

public interface IEmuPlanService
{
    EmuListResponseDto<EmuPlanTaskDto> GetPlanTasks(DateOnly? weekStart = null);

    EmuPlanTaskChangesDto GetPlanTaskChanges(DateTimeOffset since);

    EmuCommandResult<EmuPlanTaskDto> CreatePlanTask(EmuUpsertPlanTaskDto request, Guid? actorUserId, string actorName);

    EmuCommandResult<EmuPlanTaskDto> UpdatePlanTask(Guid id, EmuUpsertPlanTaskDto request, Guid? actorUserId, string actorName);

    EmuCommandResult<EmuPlanTaskDto> ApprovePlanTask(Guid id, EmuApprovePlanTaskDto request, Guid? actorUserId, string actorName);

    EmuCommandResult<IReadOnlyList<EmuPlanTaskDto>> ApproveWeek(EmuApproveWeekDto request, Guid? actorUserId, string actorName);
}

public interface IEmuMaintenanceService
{
    int CarryOverForgottenWork(DateTimeOffset now);
}
