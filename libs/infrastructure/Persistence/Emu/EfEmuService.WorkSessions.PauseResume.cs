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
    public EmuCommandResult<EmuWorkSessionDto> PauseWorkSession(Guid id, EmuPauseWorkSessionDto request, Guid? actorUserId, string actorName)
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
            return Failure<EmuWorkSessionDto>("id", "Завершенную работу нельзя поставить на паузу");
        }

        var employeeIds = request.EmployeeIds.Distinct().ToArray();
        if (employeeIds.Length == 0)
        {
            return Failure<EmuWorkSessionDto>("employeeIds", "Выберите сотрудников для паузы");
        }

        if (!dbContext.EmuWaitReasons.Any(row => row.Id == request.WaitReasonId && row.IsActive))
        {
            return Failure<EmuWorkSessionDto>("waitReasonId", "Причина ожидания не найдена");
        }

        var participants = entity.Employees.Where(row => employeeIds.Contains(row.EmployeeId) && row.FinishedAt == null).ToList();
        if (participants.Count == 0)
        {
            return Failure<EmuWorkSessionDto>("employeeIds", "В карточке нет выбранных активных сотрудников");
        }

        var now = DateTimeOffset.UtcNow;
        var startedAt = (request.StartedAt ?? now).ToUniversalTime();
        if (IsTooFarInFuture(startedAt, now))
        {
            return Failure<EmuWorkSessionDto>("startedAt", "Время паузы не может быть позже серверного времени больше чем на 2 минуты");
        }

        if (startedAt < participants.Min(row => row.ArrivedAt))
        {
            return Failure<EmuWorkSessionDto>("startedAt", "Время паузы не может быть раньше времени прихода");
        }

        if (participants.Any(row => row.Status != EmployeeWorking))
        {
            return Failure<EmuWorkSessionDto>("employeeIds", "Выбранные сотрудники уже находятся на активной паузе");
        }

        var nextEmployeeStatus = request.MarkAsOtherWork ? EmployeeOtherWork : EmployeeWaiting;
        var pausedEmployeeIds = participants.Select(row => row.EmployeeId).ToArray();
        var pauseId = Guid.NewGuid();
        var pauseComment = NormalizeOptional(request.Comment);

        var pause = new EmuWorkPauseEntity
        {
            Id = pauseId,
            WaitReasonId = request.WaitReasonId,
            StartedAt = startedAt,
            Comment = pauseComment,
            IsOtherWork = request.MarkAsOtherWork,
            Employees = participants.Select(row => new EmuWorkPauseEmployeeEntity
            {
                PauseId = pauseId,
                EmployeeId = row.EmployeeId
            }).ToList()
        };
        entity.Pauses.Add(pause);
        dbContext.Entry(pause).State = EntityState.Added;
        foreach (var pauseEmployee in pause.Employees)
        {
            dbContext.Entry(pauseEmployee).State = EntityState.Added;
        }
        var nextSessionStatus = entity.Employees.Any(row => row.FinishedAt == null && row.Status == EmployeeWorking && !pausedEmployeeIds.Contains(row.EmployeeId)) ? StatusInWork : StatusWaiting;
        foreach (var participant in participants)
        {
            participant.Status = nextEmployeeStatus;
        }

        entity.Status = nextSessionStatus;
        Touch(entity, now);
        AddAudit(entity.Id, null, request.MarkAsOtherWork ? "other_work" : "paused", StatusInWork, nextSessionStatus, request.Comment, actorUserId, actorName, now);
        dbContext.SaveChanges();
        CloseOpenParticipationIntervals(entity.Id, pausedEmployeeIds, startedAt);
        foreach (var participant in participants)
        {
            InsertParticipationInterval(entity.Id, participant.Id, participant.EmployeeId, ParticipationPaused, startedAt, pauseComment, actorUserId, actorName, now);
        }

        return Success(MapWorkSession(RecalculateSession(LoadSession(entity.Id)!, now)));
    }

    public EmuCommandResult<EmuWorkSessionDto> ResumeWorkSession(Guid id, EmuResumeWorkSessionDto request, Guid? actorUserId, string actorName)
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
            return Failure<EmuWorkSessionDto>("id", "Завершенную работу нельзя вернуть с паузы");
        }

        var employeeIds = request.EmployeeIds.Distinct().ToArray();
        if (employeeIds.Length == 0)
        {
            return Failure<EmuWorkSessionDto>("employeeIds", "Выберите сотрудников для продолжения");
        }

        var conflicts = FindWorkingConflicts(employeeIds, entity.Id);
        if (conflicts.Count > 0)
        {
            return Failure<EmuWorkSessionDto>("employeeIds", $"Сотрудник уже работает в другой карточке: {string.Join(", ", conflicts)}");
        }

        var participants = entity.Employees.Where(row => employeeIds.Contains(row.EmployeeId) && row.FinishedAt == null).ToList();
        if (participants.Count == 0)
        {
            return Failure<EmuWorkSessionDto>("employeeIds", "В карточке нет выбранных активных сотрудников");
        }

        var now = DateTimeOffset.UtcNow;
        var resumedAt = (request.ResumedAt ?? now).ToUniversalTime();
        if (IsTooFarInFuture(resumedAt, now))
        {
            return Failure<EmuWorkSessionDto>("resumedAt", "Время возврата не может быть позже серверного времени больше чем на 2 минуты");
        }

        if (resumedAt < participants.Min(row => row.ArrivedAt))
        {
            return Failure<EmuWorkSessionDto>("resumedAt", "Время возврата не может быть раньше времени прихода");
        }

        var activePauses = entity.Pauses
            .Where(row => row.EndedAt == null && row.Employees.Any(employee => employeeIds.Contains(employee.EmployeeId)))
            .ToList();
        if (activePauses.Count == 0)
        {
            return Failure<EmuWorkSessionDto>("employeeIds", "Для выбранных сотрудников нет активной паузы");
        }

        var activePausedEmployeeIds = activePauses
            .SelectMany(row => row.Employees)
            .Where(row => employeeIds.Contains(row.EmployeeId))
            .Select(row => row.EmployeeId)
            .ToHashSet();
        if (activePausedEmployeeIds.Count != employeeIds.Length)
        {
            return Failure<EmuWorkSessionDto>("employeeIds", "Для каждого выбранного сотрудника должна быть активная пауза");
        }

        if (resumedAt < activePauses.Max(row => row.StartedAt))
        {
            return Failure<EmuWorkSessionDto>("resumedAt", "Время возврата не может быть раньше начала активной паузы");
        }

        foreach (var participant in participants)
        {
            participant.Status = EmployeeWorking;
        }

        foreach (var pause in activePauses)
        {
            pause.EndedAt = resumedAt;
        }

        entity.Status = StatusInWork;
        Touch(entity, now);
        AddAudit(entity.Id, null, "resumed", StatusWaiting, StatusInWork, request.Comment, actorUserId, actorName, now);
        dbContext.SaveChanges();
        CloseOpenParticipationIntervals(entity.Id, employeeIds, resumedAt);
        foreach (var participant in participants)
        {
            InsertParticipationInterval(entity.Id, participant.Id, participant.EmployeeId, EmployeeWorking, resumedAt, request.Comment, actorUserId, actorName, now);
        }

        return Success(MapWorkSession(RecalculateSession(LoadSession(entity.Id)!, now)));
    }
}
