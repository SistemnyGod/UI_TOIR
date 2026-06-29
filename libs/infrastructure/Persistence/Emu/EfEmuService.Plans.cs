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
    public EmuListResponseDto<EmuPlanTaskDto> GetPlanTasks(DateOnly? weekStart = null, IReadOnlyList<Guid>? allowedSectionIds = null)
    {
        var query = ApplyPlanSectionScope(dbContext.EmuWorkPlanTasks.AsNoTracking(), allowedSectionIds)
            .Include(row => row.Section)
            .Include(row => row.Employees)
            .AsQueryable();
        if (weekStart is not null)
        {
            var weekEnd = weekStart.Value.AddDays(7);
            query = query.Where(row => row.PlannedDate >= weekStart && row.PlannedDate < weekEnd);
        }

        var rows = query.OrderBy(row => row.CreatedAt).Select(MapPlanTask).ToList();
        return ToList(rows, rows.Count, new Paging(1, Math.Max(1, rows.Count)));
    }

    public EmuPlanTaskChangesDto GetPlanTaskChanges(DateTimeOffset since, IReadOnlyList<Guid>? allowedSectionIds = null)
    {
        var now = DateTimeOffset.UtcNow;
        var rows = ApplyPlanSectionScope(dbContext.EmuWorkPlanTasks.AsNoTracking(), allowedSectionIds)
            .Include(row => row.Section)
            .Include(row => row.Employees)
            .Where(row => row.UpdatedAt > since.ToUniversalTime())
            .OrderBy(row => row.UpdatedAt)
            .Select(MapPlanTask)
            .ToList();

        return new EmuPlanTaskChangesDto(now, rows, []);
    }

    public EmuCommandResult<EmuPlanTaskDto> CreatePlanTask(EmuUpsertPlanTaskDto request, Guid? actorUserId, string actorName)
    {
        var sectionId = ResolvePlanSectionId(request.SectionId);
        if (sectionId is not null && !dbContext.EmuWorkSections.Any(row => row.Id == sectionId && row.IsActive))
        {
            return Failure<EmuPlanTaskDto>("sectionId", "Участок не найден");
        }

        var validation = ValidatePlanTask(request);
        if (validation.Count > 0)
        {
            return new EmuCommandResult<EmuPlanTaskDto>(null, validation);
        }

        var now = DateTimeOffset.UtcNow;
        var entity = new EmuWorkPlanTaskEntity
        {
            Id = Guid.NewGuid(),
            Title = NormalizeRequired(request.Title),
            Description = NormalizeOptional(request.Description),
            PlannedDate = request.PlannedDate,
            SectionId = sectionId,
            Priority = NormalizePriority(request.Priority),
            IsRecurring = request.IsRecurring,
            RecurrenceRule = NormalizeOptional(request.RecurrenceRule),
            CreatedAt = now,
            UpdatedAt = now,
            Employees = request.EmployeeIds.Distinct().Select(employeeId => new EmuWorkPlanTaskEmployeeEntity
            {
                Id = Guid.NewGuid(),
                EmployeeId = employeeId
            }).ToList()
        };
        dbContext.EmuWorkPlanTasks.Add(entity);
        AddAudit(null, entity.Id, "plan_created", string.Empty, entity.Status, "Плановая задача создана", actorUserId, actorName, now);
        dbContext.SaveChanges();
        return Success(MapPlanTask(LoadPlanTask(entity.Id)!));
    }

    public EmuCommandResult<EmuPlanTaskDto> UpdatePlanTask(Guid id, EmuUpsertPlanTaskDto request, Guid? actorUserId, string actorName, IReadOnlyList<Guid>? allowedSectionIds = null)
    {
        var entity = dbContext.EmuWorkPlanTasks.Include(row => row.Employees).FirstOrDefault(row => row.Id == id);
        if (entity is null)
        {
            return Failure<EmuPlanTaskDto>("id", "Задача плана не найдена");
        }

        if (!CanAccessPlanTask(entity, allowedSectionIds))
        {
            return Failure<EmuPlanTaskDto>("sectionId", "Задача недоступна по назначенным участкам");
        }

        if (entity.RowVersion != request.RowVersion)
        {
            return Failure<EmuPlanTaskDto>("rowVersion", "Задача была изменена другим пользователем");
        }

        var sectionId = ResolvePlanSectionId(request.SectionId);
        if (sectionId is not null && !dbContext.EmuWorkSections.Any(row => row.Id == sectionId && row.IsActive))
        {
            return Failure<EmuPlanTaskDto>("sectionId", "Участок не найден");
        }

        if (sectionId is not null && !CanAccessEmuSection(sectionId.Value, allowedSectionIds))
        {
            return Failure<EmuPlanTaskDto>("sectionId", "Участок недоступен по назначенным участкам");
        }

        var validation = ValidatePlanTask(request);
        if (validation.Count > 0)
        {
            return new EmuCommandResult<EmuPlanTaskDto>(null, validation);
        }

        var now = DateTimeOffset.UtcNow;
        entity.Title = NormalizeRequired(request.Title);
        entity.Description = NormalizeOptional(request.Description);
        entity.PlannedDate = request.PlannedDate;
        entity.SectionId = sectionId;
        entity.Priority = NormalizePriority(request.Priority);
        entity.IsRecurring = request.IsRecurring;
        entity.RecurrenceRule = NormalizeOptional(request.RecurrenceRule);
        entity.UpdatedAt = now;
        entity.RowVersion++;
        dbContext.EmuWorkPlanTaskEmployees.RemoveRange(entity.Employees);
        entity.Employees = request.EmployeeIds.Distinct().Select(employeeId => new EmuWorkPlanTaskEmployeeEntity
        {
            Id = Guid.NewGuid(),
            PlanTaskId = entity.Id,
            EmployeeId = employeeId
        }).ToList();
        AddAudit(null, entity.Id, "plan_updated", entity.Status, entity.Status, "Плановая задача изменена", actorUserId, actorName, now);
        dbContext.SaveChanges();

        return Success(MapPlanTask(LoadPlanTask(entity.Id)!));
    }

    public EmuCommandResult<EmuPlanTaskDto> ReschedulePlanTask(Guid id, EmuReschedulePlanTaskDto request, Guid? actorUserId, string actorName, IReadOnlyList<Guid>? allowedSectionIds = null)
    {
        var entity = dbContext.EmuWorkPlanTasks.FirstOrDefault(row => row.Id == id);
        if (entity is null)
        {
            return Failure<EmuPlanTaskDto>("id", "Задача плана не найдена");
        }

        if (!CanAccessPlanTask(entity, allowedSectionIds))
        {
            return Failure<EmuPlanTaskDto>("sectionId", "Задача недоступна по назначенным участкам");
        }

        if (entity.RowVersion != request.RowVersion)
        {
            return Failure<EmuPlanTaskDto>("rowVersion", "Задача была изменена другим пользователем");
        }

        var comment = NormalizeRequired(request.Comment);
        if (comment.Length == 0)
        {
            return Failure<EmuPlanTaskDto>("comment", "Укажите причину переноса плановой задачи");
        }

        if (entity.PlannedDate == request.NewPlannedDate)
        {
            return Failure<EmuPlanTaskDto>("newPlannedDate", "Новая дата должна отличаться от текущей");
        }

        if (dbContext.EmuWorkSessions.Any(row => row.PlanTaskId == entity.Id && row.DeletedAt == null))
        {
            return Failure<EmuPlanTaskDto>("id", "Нельзя переносить задачу, которая уже отправлена в работу");
        }

        var now = DateTimeOffset.UtcNow;
        var oldDate = entity.PlannedDate;
        entity.PlannedDate = request.NewPlannedDate;
        entity.UpdatedAt = now;
        entity.RowVersion++;
        AddAudit(null, entity.Id, "plan_rescheduled", oldDate.ToString("yyyy-MM-dd"), entity.PlannedDate.ToString("yyyy-MM-dd"), comment, actorUserId, actorName, now);
        dbContext.SaveChanges();

        return Success(MapPlanTask(LoadPlanTask(entity.Id)!));
    }

    public EmuCommandResult<EmuPlanTaskDto> ApprovePlanTask(Guid id, EmuApprovePlanTaskDto request, Guid? actorUserId, string actorName, IReadOnlyList<Guid>? allowedSectionIds = null)
    {
        var entity = dbContext.EmuWorkPlanTasks.FirstOrDefault(row => row.Id == id);
        if (entity is null)
        {
            return Failure<EmuPlanTaskDto>("id", "Задача плана не найдена");
        }

        if (!CanAccessPlanTask(entity, allowedSectionIds))
        {
            return Failure<EmuPlanTaskDto>("sectionId", "Задача недоступна по назначенным участкам");
        }

        if (entity.RowVersion != request.RowVersion)
        {
            return Failure<EmuPlanTaskDto>("rowVersion", "Задача была изменена другим пользователем");
        }

        var comment = NormalizeOptional(request.Comment);
        if (!request.Approved && comment.Length == 0)
        {
            return Failure<EmuPlanTaskDto>("comment", "Укажите комментарий для отклонения задачи");
        }

        var now = DateTimeOffset.UtcNow;
        entity.ApprovalStatus = request.Approved ? "Согласовано" : "Отклонено";
        entity.ApprovedAt = request.Approved ? now : null;
        entity.ApprovedByUserId = request.Approved ? actorUserId : null;
        entity.UpdatedAt = now;
        entity.RowVersion++;
        AddAudit(null, entity.Id, request.Approved ? "plan_approved" : "plan_rejected", string.Empty, entity.ApprovalStatus, comment, actorUserId, actorName, now);
        dbContext.SaveChanges();

        return Success(MapPlanTask(LoadPlanTask(entity.Id)!));
    }

    public EmuCommandResult<IReadOnlyList<EmuPlanTaskDto>> ApproveWeek(EmuApproveWeekDto request, Guid? actorUserId, string actorName, IReadOnlyList<Guid>? allowedSectionIds = null)
    {
        var comment = NormalizeRequired(request.Comment);
        if (comment.Length == 0)
        {
            return Failure<IReadOnlyList<EmuPlanTaskDto>>("comment", "Укажите комментарий для согласования недели");
        }

        var weekEnd = request.WeekStart.AddDays(7);
        var tasks = ApplyPlanSectionScope(dbContext.EmuWorkPlanTasks, allowedSectionIds)
            .Where(row => row.PlannedDate >= request.WeekStart && row.PlannedDate < weekEnd && row.ApprovalStatus != "Согласовано")
            .ToList();
        var now = DateTimeOffset.UtcNow;
        foreach (var task in tasks)
        {
            task.ApprovalStatus = "Согласовано";
            task.ApprovedAt = now;
            task.ApprovedByUserId = actorUserId;
            task.UpdatedAt = now;
            task.RowVersion++;
            AddAudit(null, task.Id, "week_approved", string.Empty, "Согласовано", comment, actorUserId, actorName, now);
        }

        dbContext.SaveChanges();
        var ids = tasks.Select(row => row.Id).ToHashSet();
        var rows = dbContext.EmuWorkPlanTasks.AsNoTracking().Include(row => row.Section).Include(row => row.Employees)
            .Where(row => ids.Contains(row.Id))
            .OrderBy(row => row.CreatedAt)
            .Select(MapPlanTask)
            .ToList();
        return Success<IReadOnlyList<EmuPlanTaskDto>>(rows);
    }
}
