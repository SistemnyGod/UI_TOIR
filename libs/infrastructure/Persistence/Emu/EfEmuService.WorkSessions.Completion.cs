using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfEmuService
{
    public EmuCommandResult<EmuWorkSessionDto> CompleteWorkSession(Guid id, EmuCompleteWorkSessionDto request, Guid? actorUserId, string actorName)
    {
        var entity = LoadSessionForUpdate(id);
        if (entity is null || entity.DeletedAt is not null)
        {
            return Failure<EmuWorkSessionDto>("id", "Работа не найдена");
        }

        if (entity.RowVersion != request.RowVersion)
        {
            return Failure<EmuWorkSessionDto>("rowVersion", "Карточка была изменена другим пользователем");
        }

        if (entity.CompletedAt is not null)
        {
            return Failure<EmuWorkSessionDto>("id", "Работа уже завершена");
        }

        var result = NormalizeRequired(request.ResultComment);
        if (result.Length == 0)
        {
            return Failure<EmuWorkSessionDto>("resultComment", "Заполните результат работы");
        }

        var resultStatus = NormalizeResultStatus(request.ResultStatus);
        if (resultStatus.Length == 0)
        {
            return Failure<EmuWorkSessionDto>("resultStatus", "Выберите итоговый статус");
        }

        if (resultStatus == "Не выполнено" && request.NotCompletedReasonId is null)
        {
            return Failure<EmuWorkSessionDto>("notCompletedReasonId", "Выберите причину невыполнения");
        }

        var employeeIds = request.EmployeeIds is { Count: > 0 }
            ? request.EmployeeIds.Distinct().ToArray()
            : entity.Employees.Where(row => row.FinishedAt == null).Select(row => row.EmployeeId).ToArray();
        var participants = entity.Employees.Where(row => employeeIds.Contains(row.EmployeeId) && row.FinishedAt == null).ToList();
        if (participants.Count == 0)
        {
            return Failure<EmuWorkSessionDto>("employeeIds", "Нет активных сотрудников для завершения");
        }

        var now = DateTimeOffset.UtcNow;
        var completedAt = (request.CompletedAt ?? now).ToUniversalTime();
        var completedAtWasManual = request.CompletedAt is not null;
        if (IsTooFarInFuture(completedAt, now))
        {
            return Failure<EmuWorkSessionDto>("completedAt", "Время окончания не может быть позже серверного времени больше чем на 2 минуты");
        }

        if (completedAt < participants.Min(row => row.ArrivedAt))
        {
            return Failure<EmuWorkSessionDto>("completedAt", "Время окончания не может быть раньше времени прихода");
        }

        var activePauses = entity.Pauses
            .Where(row => row.EndedAt == null && row.Employees.Any(employee => employeeIds.Contains(employee.EmployeeId)))
            .ToList();
        if (activePauses.Count > 0 && completedAt < activePauses.Max(row => row.StartedAt))
        {
            return Failure<EmuWorkSessionDto>("completedAt", "Время окончания не может быть раньше начала активной паузы");
        }

        if (activePauses.Count > 0)
        {
            return Failure<EmuWorkSessionDto>("employeeIds", "Перед завершением работы верните сотрудников из активной паузы");
        }

        foreach (var participant in participants)
        {
            participant.Status = EmployeeDone;
            participant.FinishedAt = completedAt;
        }

        foreach (var pause in activePauses)
        {
            pause.EndedAt = completedAt;
        }

        entity.ResultStatus = resultStatus;
        entity.ResultComment = result;
        entity.NotCompletedReasonId = request.NotCompletedReasonId;
        if (entity.Employees.All(row => row.FinishedAt != null))
        {
            entity.Status = resultStatus;
            entity.CompletedAt = completedAt;
        }

        Touch(entity, now);
        RecalculateSession(entity, now);
        AddAudit(entity.Id, null, "completed", StatusInWork, entity.Status, result, actorUserId, actorName, now);
        if (completedAtWasManual)
        {
            AddAudit(entity.Id, null, "completed_at_changed", string.Empty, completedAt.ToString("O"), BuildManualTimeComment("времени окончания", completedAt, result, now), actorUserId, actorName, now);
        }

        if (entity.PlanTaskId is not null && entity.CompletedAt is not null)
        {
            var task = dbContext.EmuWorkPlanTasks.FirstOrDefault(row => row.Id == entity.PlanTaskId);
            if (task is not null)
            {
                var oldPlanStatus = task.Status;
                task.Status = resultStatus;
                task.UpdatedAt = now;
                task.RowVersion++;
                AddAudit(null, task.Id, "plan_completed_from_work", oldPlanStatus, task.Status, result, actorUserId, actorName, now);
            }
        }

        dbContext.SaveChanges();
        CloseOpenParticipationIntervals(entity.Id, employeeIds, completedAt);
        return Success(MapWorkSession(LoadSession(entity.Id)!));
    }
}
