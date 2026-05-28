using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed class EfEmuService(Patrol360DbContext dbContext) :
    IEmuCatalogService,
    IEmuWorkService,
    IEmuPlanService,
    IEmuMaintenanceService
{
    private const string StatusInWork = "В работе";
    private const string StatusWaiting = "В ожидании";
    private const string StatusDone = "Завершил";
    private const string StatusDeleted = "Удалено";
    private const string EmployeeWorking = "Работает";
    private const string EmployeeWaiting = "В ожидании";
    private const string EmployeeOtherWork = "На другой работе";
    private const string EmployeeDone = "Завершил";
    private static readonly TimeZoneInfo BusinessTimeZone = ResolveBusinessTimeZone();

    public EmuSettingsDto GetSettings() =>
        new(
            dbContext.EmuWorkSections.AsNoTracking().OrderBy(row => row.SortOrder).ThenBy(row => row.Name).Select(MapReference).ToList(),
            dbContext.EmuWaitReasons.AsNoTracking().OrderBy(row => row.SortOrder).ThenBy(row => row.Name).Select(MapReference).ToList(),
            dbContext.EmuNotCompletedReasons.AsNoTracking().OrderBy(row => row.SortOrder).ThenBy(row => row.Name).Select(MapReference).ToList(),
            dbContext.EmuWorkTemplates.AsNoTracking().Include(row => row.Section).OrderBy(row => row.SortOrder).ThenBy(row => row.Name).Select(MapWorkTemplate).ToList(),
            GetFavoriteEmployees());

    public EmuCommandResult<EmuReferenceDto> CreateSection(EmuCreateReferenceDto request) =>
        CreateReference(dbContext.EmuWorkSections, request, (name, code, sortOrder, now) => new EmuWorkSectionEntity
        {
            Id = Guid.NewGuid(),
            Name = name,
            Code = code,
            Description = string.Empty,
            SortOrder = sortOrder,
            CreatedAt = now
        }, MapReference);

    public EmuCommandResult<EmuReferenceDto> UpdateSection(Guid id, EmuUpdateReferenceDto request)
    {
        var entity = dbContext.EmuWorkSections.FirstOrDefault(row => row.Id == id);
        if (entity is null)
        {
            return Failure<EmuReferenceDto>("id", "Запись справочника не найдена");
        }

        if (entity.Code == "prochee" && !request.IsActive)
        {
            return Failure<EmuReferenceDto>("isActive", "Системный участок «Прочее» нельзя скрыть");
        }

        var name = NormalizeRequired(request.Name);
        if (name.Length == 0)
        {
            return Failure<EmuReferenceDto>("name", "Укажите название");
        }

        entity.Name = name;
        entity.IsActive = request.IsActive;
        entity.SortOrder = request.SortOrder;
        dbContext.SaveChanges();
        return Success(MapReference(entity));
    }

    public EmuCommandResult<EmuReferenceDto> CreateWaitReason(EmuCreateReferenceDto request) =>
        CreateReference(dbContext.EmuWaitReasons, request, (name, code, sortOrder, now) => new EmuWaitReasonEntity
        {
            Id = Guid.NewGuid(),
            Name = name,
            Code = code,
            SortOrder = sortOrder,
            CreatedAt = now
        }, MapReference);

    public EmuCommandResult<EmuReferenceDto> UpdateWaitReason(Guid id, EmuUpdateReferenceDto request) =>
        UpdateReference(dbContext.EmuWaitReasons, id, request, MapReference);

    public EmuCommandResult<EmuReferenceDto> CreateNotCompletedReason(EmuCreateReferenceDto request) =>
        CreateReference(dbContext.EmuNotCompletedReasons, request, (name, code, sortOrder, now) => new EmuNotCompletedReasonEntity
        {
            Id = Guid.NewGuid(),
            Name = name,
            Code = code,
            SortOrder = sortOrder,
            CreatedAt = now
        }, MapReference);

    public EmuCommandResult<EmuReferenceDto> UpdateNotCompletedReason(Guid id, EmuUpdateReferenceDto request) =>
        UpdateReference(dbContext.EmuNotCompletedReasons, id, request, MapReference);

    public EmuCommandResult<EmuWorkTemplateDto> CreateWorkTemplate(EmuCreateWorkTemplateDto request)
    {
        var name = NormalizeRequired(request.Name);
        if (name.Length == 0)
        {
            return Failure<EmuWorkTemplateDto>("name", "Укажите название типовой работы");
        }

        if (request.SectionId is not null && !dbContext.EmuWorkSections.Any(row => row.Id == request.SectionId && row.IsActive))
        {
            return Failure<EmuWorkTemplateDto>("sectionId", "Участок не найден");
        }

        var entity = new EmuWorkTemplateEntity
        {
            Id = Guid.NewGuid(),
            Name = name,
            Description = NormalizeOptional(request.Description),
            SectionId = request.SectionId,
            SortOrder = request.SortOrder,
            CreatedAt = DateTimeOffset.UtcNow
        };
        dbContext.EmuWorkTemplates.Add(entity);
        dbContext.SaveChanges();

        return Success(MapWorkTemplate(dbContext.EmuWorkTemplates.AsNoTracking().Include(row => row.Section).Single(row => row.Id == entity.Id)));
    }

    public EmuCommandResult<EmuWorkTemplateDto> UpdateWorkTemplate(Guid id, EmuUpdateWorkTemplateDto request)
    {
        var entity = dbContext.EmuWorkTemplates.FirstOrDefault(row => row.Id == id);
        if (entity is null)
        {
            return Failure<EmuWorkTemplateDto>("id", "Типовая работа не найдена");
        }

        var name = NormalizeRequired(request.Name);
        if (name.Length == 0)
        {
            return Failure<EmuWorkTemplateDto>("name", "Укажите название типовой работы");
        }

        if (request.SectionId is not null && !dbContext.EmuWorkSections.Any(row => row.Id == request.SectionId && row.IsActive))
        {
            return Failure<EmuWorkTemplateDto>("sectionId", "Участок не найден");
        }

        entity.Name = name;
        entity.Description = NormalizeOptional(request.Description);
        entity.SectionId = request.SectionId;
        entity.IsActive = request.IsActive;
        entity.SortOrder = request.SortOrder;
        dbContext.SaveChanges();

        return Success(MapWorkTemplate(dbContext.EmuWorkTemplates.AsNoTracking().Include(row => row.Section).Single(row => row.Id == entity.Id)));
    }

    public IReadOnlyList<EmuFavoriteEmployeeDto> GetFavoriteEmployees() =>
        dbContext.EmuFavoriteEmployees
            .AsNoTracking()
            .Include(row => row.Employee)
            .OrderBy(row => row.Employee.FullName)
            .Select(MapFavoriteEmployee)
            .ToList();

    public EmuCommandResult<EmuFavoriteEmployeeDto> AddFavoriteEmployee(EmuAddFavoriteEmployeeDto request)
    {
        var employee = dbContext.Employees.FirstOrDefault(row => row.Id == request.EmployeeId);
        if (employee is null)
        {
            return Failure<EmuFavoriteEmployeeDto>("employeeId", "Сотрудник не найден");
        }

        var existing = dbContext.EmuFavoriteEmployees.Include(row => row.Employee).FirstOrDefault(row => row.EmployeeId == request.EmployeeId);
        if (existing is not null)
        {
            existing.IsActive = true;
            dbContext.SaveChanges();
            return Success(MapFavoriteEmployee(existing));
        }

        var entity = new EmuFavoriteEmployeeEntity
        {
            Id = Guid.NewGuid(),
            EmployeeId = request.EmployeeId,
            CreatedAt = DateTimeOffset.UtcNow
        };
        dbContext.EmuFavoriteEmployees.Add(entity);
        dbContext.SaveChanges();

        return Success(MapFavoriteEmployee(dbContext.EmuFavoriteEmployees.AsNoTracking().Include(row => row.Employee).Single(row => row.Id == entity.Id)));
    }

    public EmuCommandResult<EmuFavoriteEmployeeDto> RemoveFavoriteEmployee(Guid employeeId)
    {
        var entity = dbContext.EmuFavoriteEmployees.Include(row => row.Employee).FirstOrDefault(row => row.EmployeeId == employeeId);
        if (entity is null)
        {
            return Failure<EmuFavoriteEmployeeDto>("employeeId", "Сотрудник не найден в избранных ЭМУ");
        }

        entity.IsActive = false;
        dbContext.SaveChanges();
        return Success(MapFavoriteEmployee(entity));
    }

    public EmuDashboardDto GetDashboard()
    {
        var today = GetBusinessDate(DateTimeOffset.UtcNow);
        var active = LoadSessions()
            .Where(row => row.DeletedAt == null && row.CompletedAt == null)
            .OrderBy(row => row.CreatedAt)
            .Take(20)
            .ToList();
        var completedToday = dbContext.EmuWorkSessions
            .AsNoTracking()
            .Where(row => row.DeletedAt == null && row.CompletedAt != null)
            .AsEnumerable()
            .Count(row => GetBusinessDate(row.CompletedAt!.Value) == today);
        var waiting = active.Count(row => row.Employees.Any(employee => employee.Status == EmployeeWaiting || employee.Status == EmployeeOtherWork));
        var forgotten = active.Where(row => row.IsCarriedOver || row.WorkDate < today).ToList();
        var recentEvents = dbContext.EmuWorkAuditEvents.AsNoTracking()
            .OrderByDescending(row => row.CreatedAt)
            .Take(10)
            .Select(MapAuditEvent)
            .ToList();
        var weekStart = today.AddDays(-(((int)today.DayOfWeek + 6) % 7));
        var weekEnd = weekStart.AddDays(7);
        var weekPlan = dbContext.EmuWorkPlanTasks.AsNoTracking()
            .Include(row => row.Section)
            .Include(row => row.Employees)
            .Where(row => row.PlannedDate >= weekStart && row.PlannedDate < weekEnd)
            .OrderBy(row => row.CreatedAt)
            .Take(12)
            .Select(MapPlanTask)
            .ToList();

        return new EmuDashboardDto(
            [
                new("Активные работы", active.Count.ToString(), "сейчас", "blue", "play"),
                new("На паузе", waiting.ToString(), "ожидание", "orange", "pause"),
                new("Завершено сегодня", completedToday.ToString(), "за день", "green", "check"),
                new("Забытые работы", forgotten.Count.ToString(), "перенос", "red", "alert")
            ],
            active.Select(MapWorkSession).ToList(),
            forgotten.Select(MapWorkSession).ToList(),
            recentEvents,
            weekPlan);
    }

    public EmuListResponseDto<EmuWorkSessionDto> GetWorkSessions(EmuWorkSessionQueryDto query)
    {
        var paging = NormalizePaging(query.Page, query.PageSize);
        var rowsQuery = LoadSessions().AsQueryable();

        if (!query.IncludeDeleted)
        {
            rowsQuery = rowsQuery.Where(row => row.DeletedAt == null);
        }

        if (query.DateFrom is not null)
        {
            rowsQuery = rowsQuery.Where(row => row.WorkDate >= query.DateFrom);
        }

        if (query.DateTo is not null)
        {
            rowsQuery = rowsQuery.Where(row => row.WorkDate <= query.DateTo);
        }

        if (query.SectionId is not null)
        {
            rowsQuery = rowsQuery.Where(row => row.SectionId == query.SectionId);
        }

        if (!string.IsNullOrWhiteSpace(query.Status))
        {
            rowsQuery = rowsQuery.Where(row => row.Status == query.Status);
        }

        if (query.EmployeeId is not null)
        {
            rowsQuery = rowsQuery.Where(row => row.Employees.Any(employee => employee.EmployeeId == query.EmployeeId));
        }

        var total = rowsQuery.Count();
        var rows = rowsQuery
            .OrderBy(row => row.CreatedAt)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .ToList();
        RecalculateSessions(rows, DateTimeOffset.UtcNow, save: false);

        return ToList(rows.Select(MapWorkSession).ToList(), total, paging);
    }

    public EmuWorkSessionChangesDto GetWorkSessionChanges(DateTimeOffset since)
    {
        var now = DateTimeOffset.UtcNow;
        var rows = LoadSessions()
            .Where(row => row.UpdatedAt > since.ToUniversalTime())
            .OrderBy(row => row.UpdatedAt)
            .ToList();
        var deletedIds = rows
            .Where(row => row.DeletedAt is not null)
            .Select(row => row.Id)
            .ToList();
        var changedRows = rows
            .Where(row => row.DeletedAt is null)
            .ToList();
        RecalculateSessions(changedRows, now, save: false);

        return new EmuWorkSessionChangesDto(
            now,
            changedRows.Select(MapWorkSession).ToList(),
            deletedIds);
    }

    public EmuCommandResult<EmuWorkSessionDto> GetWorkSession(Guid id)
    {
        var entity = LoadSession(id);
        return entity is null
            ? Failure<EmuWorkSessionDto>("id", "Работа не найдена")
            : Success(MapWorkSession(RecalculateSession(entity, DateTimeOffset.UtcNow)));
    }

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

        if (errors.Count > 0)
        {
            return new EmuCommandResult<EmuWorkSessionDto>(null, errors);
        }

        var now = DateTimeOffset.UtcNow;
        var arrivedAt = (request.ArrivedAt ?? now).ToUniversalTime();
        var entity = new EmuWorkSessionEntity
        {
            Id = Guid.NewGuid(),
            WorkNumber = GenerateWorkNumber(request.WorkDate),
            WorkDate = request.WorkDate,
            SectionId = request.SectionId,
            PlanTaskId = request.PlanTaskId,
            TaskDescription = task,
            ArrivedAt = arrivedAt,
            CreatedAt = now,
            UpdatedAt = now,
            CreatedByUserId = actorUserId,
            Employees = employees.Select(employee => new EmuWorkSessionEmployeeEntity
            {
                Id = Guid.NewGuid(),
                EmployeeId = employee.Id,
                FullNameSnapshot = employee.FullName,
                PositionSnapshot = employee.Position,
                Status = EmployeeWorking,
                ArrivedAt = arrivedAt
            }).ToList()
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
        return Success(MapWorkSession(LoadSession(entity.Id)!));
    }

    public EmuCommandResult<EmuWorkSessionDto> UpdateWorkSession(Guid id, EmuUpdateWorkSessionDto request, Guid? actorUserId, string actorName)
    {
        var entity = LoadSession(id);
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
                entity.Employees.Add(new EmuWorkSessionEmployeeEntity
                {
                    Id = Guid.NewGuid(),
                    WorkSessionId = entity.Id,
                    EmployeeId = employee.Id,
                    FullNameSnapshot = employee.FullName,
                    PositionSnapshot = employee.Position,
                    Status = EmployeeWorking,
                    ArrivedAt = entity.ArrivedAt
                });
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

        return Success(MapWorkSession(LoadSession(entity.Id)!));
    }

    public EmuCommandResult<EmuWorkSessionDto> PauseWorkSession(Guid id, EmuPauseWorkSessionDto request, Guid? actorUserId, string actorName)
    {
        var entity = LoadSession(id);
        if (entity is null || entity.DeletedAt is not null)
        {
            return Failure<EmuWorkSessionDto>("id", "Работа не найдена");
        }

        if (entity.RowVersion != request.RowVersion)
        {
            return Failure<EmuWorkSessionDto>("rowVersion", "Карточка была изменена другим пользователем");
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
        var nextEmployeeStatus = request.MarkAsOtherWork ? EmployeeOtherWork : EmployeeWaiting;
        var pausedEmployeeIds = participants.Select(row => row.EmployeeId).ToArray();
        var pauseId = Guid.NewGuid();

        var pause = new EmuWorkPauseEntity
        {
            Id = pauseId,
            WaitReasonId = request.WaitReasonId,
            StartedAt = startedAt,
            Comment = NormalizeOptional(request.Comment),
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
        AddAudit(entity.Id, null, request.MarkAsOtherWork ? "other_work" : "paused", StatusInWork, nextSessionStatus, request.Comment, actorUserId, actorName, now);
        dbContext.SaveChanges();
        dbContext.EmuWorkSessions
            .Where(row => row.Id == entity.Id)
            .ExecuteUpdate(setters => setters
                .SetProperty(row => row.Status, nextSessionStatus)
                .SetProperty(row => row.UpdatedAt, now)
                .SetProperty(row => row.RowVersion, row => row.RowVersion + 1));
        dbContext.EmuWorkSessionEmployees
            .Where(row => row.WorkSessionId == entity.Id && pausedEmployeeIds.Contains(row.EmployeeId) && row.FinishedAt == null)
            .ExecuteUpdate(setters => setters.SetProperty(row => row.Status, nextEmployeeStatus));
        dbContext.ChangeTracker.Clear();

        return Success(MapWorkSession(RecalculateSession(LoadSession(entity.Id)!, now)));
    }

    public EmuCommandResult<EmuWorkSessionDto> ResumeWorkSession(Guid id, EmuResumeWorkSessionDto request, Guid? actorUserId, string actorName)
    {
        var entity = LoadSession(id);
        if (entity is null || entity.DeletedAt is not null)
        {
            return Failure<EmuWorkSessionDto>("id", "Работа не найдена");
        }

        if (entity.RowVersion != request.RowVersion)
        {
            return Failure<EmuWorkSessionDto>("rowVersion", "Карточка была изменена другим пользователем");
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
        foreach (var participant in participants)
        {
            participant.Status = EmployeeWorking;
        }

        foreach (var pause in entity.Pauses.Where(row => row.EndedAt == null && row.Employees.Any(employee => employeeIds.Contains(employee.EmployeeId))))
        {
            pause.EndedAt = resumedAt;
        }

        entity.Status = StatusInWork;
        Touch(entity, now);
        AddAudit(entity.Id, null, "resumed", StatusWaiting, StatusInWork, request.Comment, actorUserId, actorName, now);
        dbContext.SaveChanges();

        return Success(MapWorkSession(RecalculateSession(LoadSession(entity.Id)!, now)));
    }

    public EmuCommandResult<EmuWorkSessionDto> CompleteWorkSession(Guid id, EmuCompleteWorkSessionDto request, Guid? actorUserId, string actorName)
    {
        var entity = LoadSession(id);
        if (entity is null || entity.DeletedAt is not null)
        {
            return Failure<EmuWorkSessionDto>("id", "Работа не найдена");
        }

        if (entity.RowVersion != request.RowVersion)
        {
            return Failure<EmuWorkSessionDto>("rowVersion", "Карточка была изменена другим пользователем");
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
        if (completedAt < participants.Min(row => row.ArrivedAt))
        {
            return Failure<EmuWorkSessionDto>("completedAt", "Время окончания не может быть раньше времени прихода");
        }

        foreach (var participant in participants)
        {
            participant.Status = EmployeeDone;
            participant.FinishedAt = completedAt;
        }

        foreach (var pause in entity.Pauses.Where(row => row.EndedAt == null && row.Employees.Any(employee => employeeIds.Contains(employee.EmployeeId))))
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
                task.Status = resultStatus;
                task.UpdatedAt = now;
                task.RowVersion++;
            }
        }

        dbContext.SaveChanges();
        return Success(MapWorkSession(LoadSession(entity.Id)!));
    }

    public EmuCommandResult<EmuWorkSessionDto> DeleteWorkSession(Guid id, EmuDeleteWorkSessionDto request, Guid? actorUserId, string actorName)
    {
        var entity = LoadSession(id);
        if (entity is null || entity.DeletedAt is not null)
        {
            return Failure<EmuWorkSessionDto>("id", "Работа не найдена");
        }

        if (entity.RowVersion != request.RowVersion)
        {
            return Failure<EmuWorkSessionDto>("rowVersion", "Карточка была изменена другим пользователем");
        }

        var reason = NormalizeRequired(request.Reason);
        if (reason.Length == 0)
        {
            return Failure<EmuWorkSessionDto>("reason", "Укажите причину удаления");
        }

        var now = DateTimeOffset.UtcNow;
        entity.DeletedAt = now;
        entity.DeletedByUserId = actorUserId;
        entity.DeleteReason = reason;
        entity.Status = StatusDeleted;
        Touch(entity, now);
        AddAudit(entity.Id, null, "deleted", string.Empty, StatusDeleted, reason, actorUserId, actorName, now);
        dbContext.SaveChanges();

        return Success(MapWorkSession(LoadSession(entity.Id)!));
    }

    public EmuListResponseDto<EmuAuditEventDto> GetWorkSessionAudit(Guid id, int page = 1, int pageSize = 100)
    {
        var paging = NormalizePaging(page, pageSize);
        var query = dbContext.EmuWorkAuditEvents.AsNoTracking()
            .Where(row => row.WorkSessionId == id)
            .OrderByDescending(row => row.CreatedAt);
        var total = query.Count();
        var rows = query.Skip((paging.Page - 1) * paging.PageSize).Take(paging.PageSize).Select(MapAuditEvent).ToList();
        return ToList(rows, total, paging);
    }

    public EmuListResponseDto<EmuPlanTaskDto> GetPlanTasks(DateOnly? weekStart = null)
    {
        var query = dbContext.EmuWorkPlanTasks.AsNoTracking().Include(row => row.Section).Include(row => row.Employees).AsQueryable();
        if (weekStart is not null)
        {
            var weekEnd = weekStart.Value.AddDays(7);
            query = query.Where(row => row.PlannedDate >= weekStart && row.PlannedDate < weekEnd);
        }

        var rows = query.OrderBy(row => row.CreatedAt).Select(MapPlanTask).ToList();
        return ToList(rows, rows.Count, new Paging(1, Math.Max(1, rows.Count)));
    }

    public EmuPlanTaskChangesDto GetPlanTaskChanges(DateTimeOffset since)
    {
        var now = DateTimeOffset.UtcNow;
        var rows = dbContext.EmuWorkPlanTasks.AsNoTracking()
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

    public EmuCommandResult<EmuPlanTaskDto> UpdatePlanTask(Guid id, EmuUpsertPlanTaskDto request, Guid? actorUserId, string actorName)
    {
        var entity = dbContext.EmuWorkPlanTasks.Include(row => row.Employees).FirstOrDefault(row => row.Id == id);
        if (entity is null)
        {
            return Failure<EmuPlanTaskDto>("id", "Задача плана не найдена");
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

    public EmuCommandResult<EmuPlanTaskDto> ApprovePlanTask(Guid id, EmuApprovePlanTaskDto request, Guid? actorUserId, string actorName)
    {
        var entity = dbContext.EmuWorkPlanTasks.FirstOrDefault(row => row.Id == id);
        if (entity is null)
        {
            return Failure<EmuPlanTaskDto>("id", "Задача плана не найдена");
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

    public EmuCommandResult<IReadOnlyList<EmuPlanTaskDto>> ApproveWeek(EmuApproveWeekDto request, Guid? actorUserId, string actorName)
    {
        var comment = NormalizeRequired(request.Comment);
        if (comment.Length == 0)
        {
            return Failure<IReadOnlyList<EmuPlanTaskDto>>("comment", "Укажите комментарий для согласования недели");
        }

        var weekEnd = request.WeekStart.AddDays(7);
        var tasks = dbContext.EmuWorkPlanTasks
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

    public int CarryOverForgottenWork(DateTimeOffset now)
    {
        var today = GetBusinessDate(now);
        var operationAt = now.ToUniversalTime();
        var forgotten = dbContext.EmuWorkSessions
            .Where(row => row.DeletedAt == null && row.CompletedAt == null && row.WorkDate < today)
            .ToList();

        foreach (var session in forgotten)
        {
            if (dbContext.EmuWorkSessionCarryOvers.Any(row => row.WorkSessionId == session.Id && row.ToDate == today))
            {
                continue;
            }

            var previousDate = session.WorkDate;
            session.WorkDate = today;
            session.IsCarriedOver = true;
            session.UpdatedAt = operationAt;
            session.RowVersion++;
            dbContext.EmuWorkSessionCarryOvers.Add(new EmuWorkSessionCarryOverEntity
            {
                Id = Guid.NewGuid(),
                WorkSessionId = session.Id,
                FromDate = previousDate,
                ToDate = today,
                CreatedAt = operationAt
            });
            AddAudit(session.Id, null, "carried_over", previousDate.ToString("yyyy-MM-dd"), today.ToString("yyyy-MM-dd"), "Перенос на следующие сутки", null, "system", operationAt);
        }

        dbContext.SaveChanges();
        return forgotten.Count(row => row.WorkDate == today);
    }

    private IQueryable<EmuWorkSessionEntity> LoadSessions() =>
        dbContext.EmuWorkSessions
            .Include(row => row.Section)
            .Include(row => row.Employees)
            .Include(row => row.Pauses)
                .ThenInclude(row => row.Employees);

    private EmuWorkSessionEntity? LoadSession(Guid id) =>
        LoadSessions().FirstOrDefault(row => row.Id == id);

    private EmuWorkPlanTaskEntity? LoadPlanTask(Guid id) =>
        dbContext.EmuWorkPlanTasks.AsNoTracking().Include(row => row.Section).Include(row => row.Employees).FirstOrDefault(row => row.Id == id);

    private List<string> FindWorkingConflicts(IEnumerable<Guid> employeeIds, Guid? excludeSessionId = null)
    {
        var ids = employeeIds.ToHashSet();
        return dbContext.EmuWorkSessionEmployees
            .AsNoTracking()
            .Include(row => row.WorkSession)
            .Where(row =>
                ids.Contains(row.EmployeeId)
                && row.Status == EmployeeWorking
                && row.FinishedAt == null
                && row.WorkSession.DeletedAt == null
                && row.WorkSession.CompletedAt == null
                && (excludeSessionId == null || row.WorkSessionId != excludeSessionId))
            .Select(row => row.FullNameSnapshot)
            .Distinct()
            .ToList();
    }

    private void RecalculateSessions(IEnumerable<EmuWorkSessionEntity> sessions, DateTimeOffset now, bool save)
    {
        foreach (var session in sessions)
        {
            RecalculateSession(session, now);
        }

        if (save)
        {
            dbContext.SaveChanges();
        }
    }

    private static EmuWorkSessionEntity RecalculateSession(EmuWorkSessionEntity session, DateTimeOffset now)
    {
        foreach (var participant in session.Employees)
        {
            var end = participant.FinishedAt ?? session.CompletedAt ?? now;
            var total = Math.Max(0, (int)Math.Round((end - participant.ArrivedAt).TotalMinutes));
            var pauses = session.Pauses
                .Where(pause => pause.Employees.Any(employee => employee.EmployeeId == participant.EmployeeId))
                .ToList();
            var waiting = 0;
            var other = 0;
            foreach (var pause in pauses)
            {
                var pauseEnd = pause.EndedAt ?? end;
                var minutes = Math.Max(0, (int)Math.Round((pauseEnd - pause.StartedAt).TotalMinutes));
                if (pause.IsOtherWork)
                {
                    other += minutes;
                }
                else
                {
                    waiting += minutes;
                }
            }

            participant.WaitingMinutes = waiting;
            participant.OtherWorkMinutes = other;
            participant.WorkMinutes = Math.Max(0, total - waiting - other);
        }

        session.WaitingMinutes = session.Employees.Sum(row => row.WaitingMinutes);
        session.OtherWorkMinutes = session.Employees.Sum(row => row.OtherWorkMinutes);
        session.WorkMinutes = session.Employees.Sum(row => row.WorkMinutes);
        return session;
    }

    private static void Touch(EmuWorkSessionEntity entity, DateTimeOffset now)
    {
        entity.UpdatedAt = now;
        entity.RowVersion++;
    }

    private void AddAudit(Guid? workSessionId, Guid? planTaskId, string eventType, string fromStatus, string toStatus, string? comment, Guid? actorUserId, string actorName, DateTimeOffset now)
    {
        dbContext.EmuWorkAuditEvents.Add(new EmuWorkAuditEventEntity
        {
            Id = Guid.NewGuid(),
            WorkSessionId = workSessionId,
            PlanTaskId = planTaskId,
            EventType = eventType,
            FromStatus = NormalizeOptional(fromStatus),
            ToStatus = NormalizeOptional(toStatus),
            Comment = NormalizeOptional(comment),
            ActorUserId = actorUserId,
            Actor = string.IsNullOrWhiteSpace(actorName) ? "system" : actorName,
            CreatedAt = now
        });
    }

    private Guid? ResolvePlanSectionId(Guid? sectionId) =>
        sectionId ?? dbContext.EmuWorkSections
            .AsNoTracking()
            .Where(row => row.Code == "prochee" && row.IsActive)
            .Select(row => (Guid?)row.Id)
            .FirstOrDefault();

    private static string BuildManualTimeComment(string fieldName, DateTimeOffset enteredValue, string comment, DateTimeOffset now) =>
        $"Ручная корректировка {fieldName}. Серверное время операции: {now:O}; введенное время: {enteredValue:O}; комментарий: {comment}";

    private static string BuildManualDateComment(string fieldName, DateOnly enteredValue, string comment, DateTimeOffset now) =>
        $"Ручная корректировка {fieldName}. Серверное время операции: {now:O}; введенная дата: {enteredValue:yyyy-MM-dd}; комментарий: {comment}";

    private string GenerateWorkNumber(DateOnly workDate)
    {
        var count = dbContext.EmuWorkSessions.Count(row => row.WorkDate.Year == workDate.Year);
        return $"ЭМУ-{workDate:yyyy}-{count + 1:000000}";
    }

    private static EmuWorkSessionDto MapWorkSession(EmuWorkSessionEntity row) =>
        new(
            row.Id,
            row.WorkNumber,
            row.WorkDate,
            row.SectionId,
            row.Section?.Name ?? "Прочее",
            row.TaskDescription,
            row.Status,
            row.ResultStatus,
            row.ResultComment,
            row.ArrivedAt,
            row.CompletedAt,
            row.CreatedAt,
            row.UpdatedAt,
            row.DeletedAt,
            row.DeleteReason,
            row.WorkMinutes,
            row.WaitingMinutes,
            row.OtherWorkMinutes,
            row.RowVersion,
            row.IsCarriedOver,
            row.Employees.OrderBy(employee => employee.FullNameSnapshot).Select(MapParticipant).ToList());

    private static EmuWorkSessionEmployeeDto MapParticipant(EmuWorkSessionEmployeeEntity row) =>
        new(row.Id, row.EmployeeId, row.FullNameSnapshot, row.PositionSnapshot, row.Status, row.ArrivedAt, row.FinishedAt, row.WorkMinutes, row.WaitingMinutes, row.OtherWorkMinutes);

    private static EmuAuditEventDto MapAuditEvent(EmuWorkAuditEventEntity row) =>
        new(row.Id, row.WorkSessionId, row.PlanTaskId, row.EventType, row.FromStatus, row.ToStatus, row.Comment, row.Actor, row.CreatedAt);

    private static EmuPlanTaskDto MapPlanTask(EmuWorkPlanTaskEntity row) =>
        new(
            row.Id,
            row.Title,
            row.Description,
            row.PlannedDate,
            row.SectionId,
            row.Section?.Name ?? string.Empty,
            row.Status,
            row.ApprovalStatus,
            row.Priority,
            row.IsRecurring,
            row.RecurrenceRule,
            row.CreatedAt,
            row.UpdatedAt,
            row.RowVersion,
            row.Employees.Select(employee => employee.EmployeeId).ToList());

    private static EmuReferenceDto MapReference(EmuWorkSectionEntity row) =>
        new(row.Id, row.Name, row.Code, row.IsActive, row.SortOrder);

    private static EmuReferenceDto MapReference(EmuWaitReasonEntity row) =>
        new(row.Id, row.Name, row.Code, row.IsActive, row.SortOrder);

    private static EmuReferenceDto MapReference(EmuNotCompletedReasonEntity row) =>
        new(row.Id, row.Name, row.Code, row.IsActive, row.SortOrder);

    private static EmuWorkTemplateDto MapWorkTemplate(EmuWorkTemplateEntity row) =>
        new(row.Id, row.Name, row.Description, row.SectionId, row.Section?.Name ?? string.Empty, row.IsActive, row.SortOrder);

    private static EmuFavoriteEmployeeDto MapFavoriteEmployee(EmuFavoriteEmployeeEntity row) =>
        new(row.Id, row.EmployeeId, row.Employee.FullName, row.Employee.PersonnelNo, row.Employee.Position, row.Employee.Department, row.Employee.Status, row.IsActive, row.CreatedAt);

    private static IReadOnlyDictionary<string, string[]> ValidatePlanTask(EmuUpsertPlanTaskDto request)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);
        if (NormalizeRequired(request.Title).Length == 0)
        {
            errors["title"] = ["Укажите название задачи"];
        }

        if (request.EmployeeIds.Count == 0)
        {
            errors["employeeIds"] = ["Выберите сотрудников"];
        }

        return errors;
    }

    private EmuCommandResult<TDto> CreateReference<TEntity, TDto>(
        DbSet<TEntity> dbSet,
        EmuCreateReferenceDto request,
        Func<string, string, int, DateTimeOffset, TEntity> factory,
        Func<TEntity, TDto> mapper)
        where TEntity : class
    {
        var name = NormalizeRequired(request.Name);
        if (name.Length == 0)
        {
            return Failure<TDto>("name", "Укажите название");
        }

        var now = DateTimeOffset.UtcNow;
        var entity = factory(name, GenerateCode(name), request.SortOrder, now);
        dbSet.Add(entity);
        dbContext.SaveChanges();
        return Success(mapper(entity));
    }

    private EmuCommandResult<TDto> UpdateReference<TEntity, TDto>(
        DbSet<TEntity> dbSet,
        Guid id,
        EmuUpdateReferenceDto request,
        Func<TEntity, TDto> mapper)
        where TEntity : class
    {
        var entity = dbSet.Find(id);
        if (entity is null)
        {
            return Failure<TDto>("id", "Запись справочника не найдена");
        }

        var name = NormalizeRequired(request.Name);
        if (name.Length == 0)
        {
            return Failure<TDto>("name", "Укажите название");
        }

        SetProperty(entity, "Name", name);
        SetProperty(entity, "IsActive", request.IsActive);
        SetProperty(entity, "SortOrder", request.SortOrder);
        dbContext.SaveChanges();
        return Success(mapper(entity));
    }

    private static string NormalizeResultStatus(string value)
    {
        var normalized = NormalizeRequired(value);
        return normalized is "Выполнено" or "Частично выполнено" or "Не выполнено" ? normalized : string.Empty;
    }

    private static string NormalizePriority(string value)
    {
        var normalized = NormalizeOptional(value);
        return normalized is "Низкий" or "Высокий" or "Срочно" ? normalized : "Обычный";
    }

    private static string NormalizeRequired(string? value) => (value ?? string.Empty).Trim();

    private static string NormalizeOptional(string? value) => (value ?? string.Empty).Trim();

    private static string GenerateCode(string name) =>
        string.Join("-", name.Trim().ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));

    private static DateOnly GetBusinessDate(DateTimeOffset value) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(value, BusinessTimeZone).DateTime);

    private static TimeZoneInfo ResolveBusinessTimeZone()
    {
        foreach (var id in new[] { "Asia/Yekaterinburg", "Ekaterinburg Standard Time" })
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(id);
            }
            catch (TimeZoneNotFoundException)
            {
            }
            catch (InvalidTimeZoneException)
            {
            }
        }

        return TimeZoneInfo.Local;
    }

    private static void SetProperty<TValue>(object target, string propertyName, TValue value)
    {
        var property = target.GetType().GetProperty(propertyName);
        property?.SetValue(target, value);
    }

    private static EmuCommandResult<T> Success<T>(T value) =>
        new(value, new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase));

    private static EmuCommandResult<T> Failure<T>(string key, string message) =>
        new(default, new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase) { [key] = [message] });

    private static Paging NormalizePaging(int page, int pageSize) =>
        new(Math.Max(1, page), Math.Clamp(pageSize, 1, 500));

    private static EmuListResponseDto<T> ToList<T>(IReadOnlyList<T> rows, int total, Paging paging) =>
        new(rows, total, paging.Page, paging.PageSize, Math.Max(1, (int)Math.Ceiling(total / (double)paging.PageSize)));

    private sealed record Paging(int Page, int PageSize);
}
