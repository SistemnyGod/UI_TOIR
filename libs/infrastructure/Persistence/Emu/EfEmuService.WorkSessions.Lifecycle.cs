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
    public EmuCommandResult<EmuWorkSessionDto> CreateWorkSession(EmuCreateWorkSessionDto request, Guid? actorUserId, string actorName, bool canOverridePlanApproval = false)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);
        if (request.SectionId == Guid.Empty || !dbContext.EmuWorkSections.Any(row => row.Id == request.SectionId && row.IsActive))
        {
            errors["sectionId"] = ["Выберите участок"];
        }

        var employeeIds = request.EmployeeIds.Distinct().ToArray();
        if (employeeIds.Length == 0)
        {
            errors["employeeIds"] = ["Выберите сотрудников"];
        }

        var task = NormalizeRequired(request.TaskDescription);
        if (task.Length == 0)
        {
            errors["taskDescription"] = ["Заполните задачу"];
        }

        var employees = dbContext.Employees.Where(row => employeeIds.Contains(row.Id)).ToList();
        if (employees.Count != employeeIds.Length)
        {
            errors["employeeIds"] = ["Один или несколько сотрудников не найдены"];
        }

        var conflicts = FindWorkingConflicts(employeeIds);
        if (conflicts.Count > 0)
        {
            errors["employeeIds"] = [$"Сотрудник уже работает в другой карточке: {string.Join(", ", conflicts)}"];
        }

        EmuWorkPlanTaskEntity? planTask = null;
        if (request.PlanTaskId is not null)
        {
            planTask = dbContext.EmuWorkPlanTasks.FirstOrDefault(row => row.Id == request.PlanTaskId);
            if (planTask is null)
            {
                errors["planTaskId"] = ["Плановая задача не найдена"];
            }
            else if (planTask.ApprovalStatus != "Согласовано" && !canOverridePlanApproval)
            {
                errors["planTaskId"] = ["Плановая задача должна быть согласована перед отправкой в работу"];
            }
        }

        if (planTask is not null && dbContext.EmuWorkSessions.Any(row => row.PlanTaskId == planTask.Id && row.DeletedAt == null))
        {
            errors["planTaskId"] = ["Плановая задача уже отправлена в работу"];
        }

        if (request.ClientWorkSessionId is not null
            && dbContext.EmuWorkSessions.Any(row => row.Id == request.ClientWorkSessionId.Value))
        {
            errors["clientWorkSessionId"] = ["Работа с таким ID уже существует"];
        }

        if (errors.Count > 0)
        {
            return new EmuCommandResult<EmuWorkSessionDto>(null, errors);
        }

        using var transaction = dbContext.Database.BeginTransaction();
        dbContext.Database.ExecuteSqlRaw("SELECT pg_advisory_xact_lock({0})", WorkNumberLockKey);

        var now = DateTimeOffset.UtcNow;
        var arrivedAt = (request.ArrivedAt ?? now).ToUniversalTime();
        var participants = employees.Select(employee => new EmuWorkSessionEmployeeEntity
        {
            Id = Guid.NewGuid(),
            EmployeeId = employee.Id,
            FullNameSnapshot = employee.FullName,
            PositionSnapshot = employee.Position,
            Status = EmployeeWorking,
            ArrivedAt = arrivedAt
        }).ToList();

        var entity = new EmuWorkSessionEntity
        {
            Id = request.ClientWorkSessionId ?? Guid.NewGuid(),
            WorkNumber = GenerateWorkNumber(request.WorkDate),
            WorkDate = request.WorkDate,
            SectionId = request.SectionId,
            PlanTaskId = request.PlanTaskId,
            TaskDescription = task,
            ArrivedAt = arrivedAt,
            CreatedAt = now,
            UpdatedAt = now,
            CreatedByUserId = actorUserId,
            Employees = participants
        };
        dbContext.EmuWorkSessions.Add(entity);
        AddAudit(entity.Id, null, "created", string.Empty, StatusInWork, "Работа создана", actorUserId, actorName, now);

        if (planTask is not null)
        {
            planTask.Status = "В работе";
            planTask.RowVersion++;
            planTask.UpdatedAt = now;
            AddAudit(null, planTask.Id, canOverridePlanApproval && planTask.ApprovalStatus != "Согласовано" ? "plan_started_override" : "plan_started", planTask.ApprovalStatus, planTask.Status, "Плановая задача отправлена в работу", actorUserId, actorName, now);
        }

        RecalculateSession(entity, now);
        dbContext.SaveChanges();
        foreach (var participant in participants)
        {
            InsertParticipationInterval(entity.Id, participant.Id, participant.EmployeeId, EmployeeWorking, arrivedAt, string.Empty, actorUserId, actorName, now);
        }

        transaction.Commit();
        return Success(MapWorkSession(LoadSession(entity.Id)!));
    }

    public EmuCommandResult<EmuWorkSessionDto> UpdateWorkSession(Guid id, EmuUpdateWorkSessionDto request, Guid? actorUserId, string actorName)
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
            return Failure<EmuWorkSessionDto>("id", "Завершенную работу нельзя изменить");
        }

        if (!dbContext.EmuWorkSections.Any(row => row.Id == request.SectionId && row.IsActive))
        {
            return Failure<EmuWorkSessionDto>("sectionId", "Участок не найден");
        }

        var task = NormalizeRequired(request.TaskDescription);
        if (task.Length == 0)
        {
            return Failure<EmuWorkSessionDto>("taskDescription", "Заполните задачу");
        }

        var requestedEmployeeIds = request.EmployeeIds?.Distinct().ToArray();
        var requestedEmployees = new List<EmployeeEntity>();
        var addedParticipants = new List<EmuWorkSessionEmployeeEntity>();
        if (requestedEmployeeIds is not null)
        {
            if (requestedEmployeeIds.Length == 0)
            {
                return Failure<EmuWorkSessionDto>("employeeIds", "Выберите сотрудников");
            }

            if (entity.Employees.Any(row => row.FinishedAt is not null))
            {
                return Failure<EmuWorkSessionDto>("employeeIds", "Нельзя менять сотрудников после частичного завершения работы");
            }

            requestedEmployees = dbContext.Employees.Where(row => requestedEmployeeIds.Contains(row.Id)).ToList();
            if (requestedEmployees.Count != requestedEmployeeIds.Length)
            {
                return Failure<EmuWorkSessionDto>("employeeIds", "Один или несколько сотрудников не найдены");
            }

            var conflicts = FindWorkingConflicts(requestedEmployeeIds, entity.Id);
            if (conflicts.Count > 0)
            {
                return Failure<EmuWorkSessionDto>("employeeIds", $"Сотрудник уже работает в другой карточке: {string.Join(", ", conflicts)}");
            }
        }

        var now = DateTimeOffset.UtcNow;
        var oldSectionId = entity.SectionId;
        var oldTask = entity.TaskDescription;
        var oldWorkDate = entity.WorkDate;
        var oldArrivedAt = entity.ArrivedAt;
        var oldEmployeeNames = string.Join(", ", entity.Employees.OrderBy(row => row.FullNameSnapshot).Select(row => row.FullNameSnapshot));
        var comment = NormalizeOptional(request.Comment);
        var workDateChanged = request.WorkDate is not null && request.WorkDate.Value != oldWorkDate;
        var requestedArrivedAt = request.ArrivedAt?.ToUniversalTime();
        var arrivedAtChanged = requestedArrivedAt is not null && requestedArrivedAt.Value != oldArrivedAt;
        if ((workDateChanged || arrivedAtChanged) && comment.Length == 0)
        {
            return Failure<EmuWorkSessionDto>("comment", "Укажите комментарий для ручной корректировки даты или времени");
        }

        entity.WorkDate = request.WorkDate ?? entity.WorkDate;
        entity.SectionId = request.SectionId;
        entity.ArrivedAt = requestedArrivedAt ?? entity.ArrivedAt;
        entity.TaskDescription = task;

        if (requestedArrivedAt is not null && requestedArrivedAt.Value != oldArrivedAt)
        {
            foreach (var participant in entity.Employees.Where(row => row.FinishedAt is null))
            {
                participant.ArrivedAt = requestedArrivedAt.Value;
            }
        }

        if (requestedEmployeeIds is not null)
        {
            var requestedSet = requestedEmployeeIds.ToHashSet();
            var removed = entity.Employees.Where(row => !requestedSet.Contains(row.EmployeeId)).ToList();
            dbContext.EmuWorkSessionEmployees.RemoveRange(removed);

            var existingIds = entity.Employees.Select(row => row.EmployeeId).ToHashSet();
            foreach (var employee in requestedEmployees.Where(employee => !existingIds.Contains(employee.Id)))
            {
                var participant = new EmuWorkSessionEmployeeEntity
                {
                    Id = Guid.NewGuid(),
                    WorkSessionId = entity.Id,
                    EmployeeId = employee.Id,
                    FullNameSnapshot = employee.FullName,
                    PositionSnapshot = employee.Position,
                    Status = EmployeeWorking,
                    ArrivedAt = entity.ArrivedAt
                };
                entity.Employees.Add(participant);
                dbContext.Entry(participant).State = EntityState.Added;
                addedParticipants.Add(participant);
            }

            var newEmployeeNames = string.Join(", ", requestedEmployees.OrderBy(row => row.FullName).Select(row => row.FullName));
            if (!string.Equals(oldEmployeeNames, newEmployeeNames, StringComparison.Ordinal))
            {
                AddAudit(entity.Id, null, "employees_changed", oldEmployeeNames, newEmployeeNames, comment, actorUserId, actorName, now);
            }
        }

        Touch(entity, now);
        if (oldSectionId != entity.SectionId)
        {
            AddAudit(entity.Id, null, "section_changed", oldSectionId.ToString(), entity.SectionId.ToString(), comment, actorUserId, actorName, now);
        }

        if (!string.Equals(oldTask, entity.TaskDescription, StringComparison.Ordinal))
        {
            AddAudit(entity.Id, null, "task_changed", oldTask, entity.TaskDescription, comment, actorUserId, actorName, now);
        }

        if (workDateChanged)
        {
            AddAudit(entity.Id, null, "work_date_changed", oldWorkDate.ToString("yyyy-MM-dd"), entity.WorkDate.ToString("yyyy-MM-dd"), BuildManualDateComment("рабочей даты", entity.WorkDate, comment, now), actorUserId, actorName, now);
        }

        if (arrivedAtChanged)
        {
            AddAudit(entity.Id, null, "arrived_at_changed", oldArrivedAt.ToString("O"), entity.ArrivedAt.ToString("O"), BuildManualTimeComment("времени прихода", entity.ArrivedAt, comment, now), actorUserId, actorName, now);
        }

        AddAudit(entity.Id, null, "updated", entity.Status, entity.Status, comment, actorUserId, actorName, now);
        RecalculateSession(entity, now);
        dbContext.SaveChanges();
        foreach (var participant in addedParticipants)
        {
            InsertParticipationInterval(entity.Id, participant.Id, participant.EmployeeId, EmployeeWorking, entity.ArrivedAt, comment, actorUserId, actorName, now);
        }

        return Success(MapWorkSession(LoadSession(entity.Id)!));
    }
}
