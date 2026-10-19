using Microsoft.EntityFrameworkCore;
using Patrol360.Contracts;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfEmuService
{
    // All work/plan mutations share one transaction protocol, including callers
    // inside the mobile outbox transaction. Failure rolls back to its savepoint.
    private EmuCommandResult<T> ExecuteMutation<T>(Func<EmuCommandResult<T>> operation)
    {
        using var mutation = BeginActiveParticipationMutation();
        try
        {
            var result = operation();
            if (result.Succeeded) mutation.Commit();
            else { mutation.Rollback(); dbContext.ChangeTracker.Clear(); }
            return result;
        }
        catch (DbUpdateConcurrencyException)
        {
            mutation.Rollback();
            dbContext.ChangeTracker.Clear();
            return Failure<T>("rowVersion", "Данные изменены другим пользователем. Обновите карточку и повторите действие.");
        }
    }

    public EmuCommandResult<EmuWorkSessionDto> CreateWorkSession(EmuCreateWorkSessionDto request, Guid? actorUserId, string actorName, bool canOverridePlanApproval = false) =>
        ExecuteMutation(() => CreateWorkSessionCore(request, actorUserId, actorName, canOverridePlanApproval));

    public EmuCommandResult<EmuWorkSessionDto> UpdateWorkSession(Guid id, EmuUpdateWorkSessionDto request, Guid? actorUserId, string actorName) =>
        ExecuteMutation(() => UpdateWorkSessionCore(id, request, actorUserId, actorName));

    public EmuCommandResult<EmuWorkSessionDto> AddWorkSessionEmployee(Guid id, EmuAddWorkSessionEmployeeDto request, Guid? actorUserId, string actorName) =>
        ExecuteMutation(() => AddWorkSessionEmployeeCore(id, request, actorUserId, actorName));

    public EmuCommandResult<EmuWorkSessionDto> FinishWorkSessionEmployee(Guid id, Guid employeeId, EmuFinishWorkSessionEmployeeDto request, Guid? actorUserId, string actorName) =>
        ExecuteMutation(() => FinishWorkSessionEmployeeCore(id, employeeId, request, actorUserId, actorName));

    public EmuCommandResult<EmuWorkSessionDto> MarkWorkSessionEmployeeMistaken(Guid id, Guid employeeId, EmuMarkMistakenWorkSessionEmployeeDto request, Guid? actorUserId, string actorName) =>
        ExecuteMutation(() => MarkWorkSessionEmployeeMistakenCore(id, employeeId, request, actorUserId, actorName));

    public EmuCommandResult<EmuWorkSessionDto> PauseWorkSession(Guid id, EmuPauseWorkSessionDto request, Guid? actorUserId, string actorName) =>
        ExecuteMutation(() => PauseWorkSessionCore(id, request, actorUserId, actorName));

    public EmuCommandResult<EmuWorkSessionDto> ResumeWorkSession(Guid id, EmuResumeWorkSessionDto request, Guid? actorUserId, string actorName) =>
        ExecuteMutation(() => ResumeWorkSessionCore(id, request, actorUserId, actorName));

    public EmuCommandResult<EmuWorkSessionDto> CompleteWorkSession(Guid id, EmuCompleteWorkSessionDto request, Guid? actorUserId, string actorName) =>
        ExecuteMutation(() => CompleteWorkSessionCore(id, request, actorUserId, actorName));

    public EmuCommandResult<EmuWorkSessionDto> DeleteWorkSession(Guid id, EmuDeleteWorkSessionDto request, Guid? actorUserId, string actorName) =>
        ExecuteMutation(() => DeleteWorkSessionCore(id, request, actorUserId, actorName));

    public EmuCommandResult<EmuWorkSessionDto> CarryOverWorkSession(Guid id, EmuCarryOverWorkSessionDto request, Guid? actorUserId, string actorName) =>
        ExecuteMutation(() => CarryOverWorkSessionCore(id, request, actorUserId, actorName));

    public EmuCommandResult<EmuPlanTaskDto> CreatePlanTask(EmuUpsertPlanTaskDto request, Guid? actorUserId, string actorName) =>
        ExecuteMutation(() => CreatePlanTaskCore(request, actorUserId, actorName));

    public EmuCommandResult<EmuPlanTaskDto> UpdatePlanTask(Guid id, EmuUpsertPlanTaskDto request, Guid? actorUserId, string actorName, IReadOnlyList<Guid>? allowedSectionIds = null) =>
        ExecuteMutation(() => UpdatePlanTaskCore(id, request, actorUserId, actorName, allowedSectionIds));

    public EmuCommandResult<EmuPlanTaskDto> ReschedulePlanTask(Guid id, EmuReschedulePlanTaskDto request, Guid? actorUserId, string actorName, IReadOnlyList<Guid>? allowedSectionIds = null) =>
        ExecuteMutation(() => ReschedulePlanTaskCore(id, request, actorUserId, actorName, allowedSectionIds));

    public EmuCommandResult<EmuPlanTaskDto> ApprovePlanTask(Guid id, EmuApprovePlanTaskDto request, Guid? actorUserId, string actorName, IReadOnlyList<Guid>? allowedSectionIds = null) =>
        ExecuteMutation(() => ApprovePlanTaskCore(id, request, actorUserId, actorName, allowedSectionIds));

    public EmuCommandResult<IReadOnlyList<EmuPlanTaskDto>> ApproveWeek(EmuApproveWeekDto request, Guid? actorUserId, string actorName, IReadOnlyList<Guid>? allowedSectionIds = null) =>
        ExecuteMutation(() => ApproveWeekCore(request, actorUserId, actorName, allowedSectionIds));
}
