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
    public EmuCommandResult<EmuWorkSessionDto> AddWorkSessionEmployee(Guid id, EmuAddWorkSessionEmployeeDto request, Guid? actorUserId, string actorName)
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
            return Failure<EmuWorkSessionDto>("id", "В завершенную работу нельзя добавить сотрудника");
        }

        if (request.EmployeeId == Guid.Empty)
        {
            return Failure<EmuWorkSessionDto>("employeeId", "Выберите сотрудника");
        }

        if (entity.Employees.Any(row => row.EmployeeId == request.EmployeeId && row.FinishedAt is null))
        {
            return Failure<EmuWorkSessionDto>("employeeId", "Сотрудник уже есть в активном составе работы");
        }

        var employee = dbContext.Employees.FirstOrDefault(row => row.Id == request.EmployeeId);
        if (employee is null)
        {
            return Failure<EmuWorkSessionDto>("employeeId", "Сотрудник не найден");
        }

        var conflicts = FindWorkingConflicts([request.EmployeeId], entity.Id);
        if (conflicts.Count > 0)
        {
            return Failure<EmuWorkSessionDto>("employeeId", $"Сотрудник уже работает в другой карточке: {string.Join(", ", conflicts)}");
        }

        var now = DateTimeOffset.UtcNow;
        var startedAt = (request.StartedAt ?? now).ToUniversalTime();
        if (IsTooFarInFuture(startedAt, now))
        {
            return Failure<EmuWorkSessionDto>("startedAt", "Время начала участия не может быть позже серверного времени больше чем на 2 минуты");
        }

        if (startedAt < entity.ArrivedAt)
        {
            return Failure<EmuWorkSessionDto>("startedAt", "Время начала участия не может быть раньше времени прихода по работе");
        }

        var comment = NormalizeOptional(request.Comment);
        var participant = new EmuWorkSessionEmployeeEntity
        {
            Id = Guid.NewGuid(),
            WorkSessionId = entity.Id,
            EmployeeId = employee.Id,
            FullNameSnapshot = employee.FullName,
            PositionSnapshot = employee.Position,
            Status = EmployeeWorking,
            ArrivedAt = startedAt
        };
        entity.Employees.Add(participant);
        dbContext.Entry(participant).State = EntityState.Added;
        entity.Status = StatusInWork;
        Touch(entity, now);
        AddAudit(entity.Id, null, "employee_added", string.Empty, employee.FullName, comment, actorUserId, actorName, now);
        RecalculateSession(entity, now);
        dbContext.SaveChanges();
        InsertParticipationInterval(entity.Id, participant.Id, participant.EmployeeId, EmployeeWorking, startedAt, comment, actorUserId, actorName, now);

        return Success(MapWorkSession(LoadSession(entity.Id)!));
    }

    public EmuCommandResult<EmuWorkSessionDto> FinishWorkSessionEmployee(Guid id, Guid employeeId, EmuFinishWorkSessionEmployeeDto request, Guid? actorUserId, string actorName)
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

        var participant = entity.Employees.FirstOrDefault(row => row.EmployeeId == employeeId && row.FinishedAt is null);
        if (participant is null)
        {
            return Failure<EmuWorkSessionDto>("employeeId", "Активный сотрудник в карточке не найден");
        }

        var comment = NormalizeRequired(request.Comment);
        if (comment.Length == 0)
        {
            return Failure<EmuWorkSessionDto>("comment", "Укажите причину завершения участия");
        }

        var participationStatus = NormalizeFinishParticipationStatus(request.ParticipationStatus);
        if (participationStatus.Length == 0)
        {
            return Failure<EmuWorkSessionDto>("participationStatus", "Выберите статус участия сотрудника");
        }

        var now = DateTimeOffset.UtcNow;
        var finishedAt = (request.FinishedAt ?? now).ToUniversalTime();
        if (IsTooFarInFuture(finishedAt, now))
        {
            return Failure<EmuWorkSessionDto>("finishedAt", "Время завершения участия не может быть позже серверного времени больше чем на 2 минуты");
        }

        if (finishedAt < participant.ArrivedAt)
        {
            return Failure<EmuWorkSessionDto>("finishedAt", "Время завершения участия не может быть раньше времени начала участия");
        }

        var oldStatus = participant.Status;
        participant.Status = participationStatus;
        participant.FinishedAt = finishedAt;

        var activePauses = entity.Pauses
            .Where(row => row.EndedAt == null && row.Employees.Any(employee => employee.EmployeeId == employeeId))
            .ToList();
        foreach (var pause in activePauses)
        {
            pause.EndedAt = finishedAt < pause.StartedAt ? pause.StartedAt : finishedAt;
        }

        entity.Status = entity.Employees.Any(row => row.FinishedAt == null && row.Status == EmployeeWorking) ? StatusInWork : StatusWaiting;
        Touch(entity, now);
        RecalculateSession(entity, now);
        AddAudit(entity.Id, null, "employee_finished", oldStatus, participationStatus, comment, actorUserId, actorName, now);
        dbContext.SaveChanges();
        CloseOpenParticipationIntervals(entity.Id, [employeeId], finishedAt);

        return Success(MapWorkSession(LoadSession(entity.Id)!));
    }

    public EmuCommandResult<EmuWorkSessionDto> MarkWorkSessionEmployeeMistaken(Guid id, Guid employeeId, EmuMarkMistakenWorkSessionEmployeeDto request, Guid? actorUserId, string actorName)
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
            return Failure<EmuWorkSessionDto>("id", "В завершенной работе нельзя изменить участие сотрудника");
        }

        var participant = entity.Employees.FirstOrDefault(row => row.EmployeeId == employeeId);
        if (participant is null)
        {
            return Failure<EmuWorkSessionDto>("employeeId", "Сотрудник в карточке не найден");
        }

        var comment = NormalizeRequired(request.Comment);
        if (comment.Length == 0)
        {
            return Failure<EmuWorkSessionDto>("comment", "Укажите причину отметки ошибочного добавления");
        }

        var now = DateTimeOffset.UtcNow;
        var oldStatus = participant.Status;
        participant.Status = EmployeeMistaken;
        participant.FinishedAt ??= now;
        participant.WorkMinutes = 0;
        participant.WaitingMinutes = 0;
        participant.OtherWorkMinutes = 0;

        var activePauses = entity.Pauses
            .Where(row => row.EndedAt == null && row.Employees.Any(employee => employee.EmployeeId == employeeId))
            .ToList();
        foreach (var pause in activePauses)
        {
            pause.EndedAt = now < pause.StartedAt ? pause.StartedAt : now;
        }

        entity.Status = entity.Employees.Any(row => row.FinishedAt == null && row.Status == EmployeeWorking) ? StatusInWork : StatusWaiting;
        Touch(entity, now);
        RecalculateSession(entity, now);
        AddAudit(entity.Id, null, "employee_marked_mistaken", oldStatus, EmployeeMistaken, comment, actorUserId, actorName, now);
        dbContext.SaveChanges();
        CloseOpenParticipationIntervals(entity.Id, [employeeId], now);

        return Success(MapWorkSession(LoadSession(entity.Id)!));
    }
}
