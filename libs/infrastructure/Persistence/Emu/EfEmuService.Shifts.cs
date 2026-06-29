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
    public IReadOnlyList<EmuShiftTemplateDto> GetShiftTemplates() =>
        dbContext.EmuShiftTemplates
            .AsNoTracking()
            .OrderBy(row => row.SortOrder)
            .ThenBy(row => row.Name)
            .Select(MapShiftTemplate)
            .ToList();

    public IReadOnlyList<EmuEmployeeShiftDto> GetEmployeeShifts(DateOnly date, Guid? employeeId = null, IReadOnlyList<Guid>? allowedSectionIds = null)
    {
        var employeesQuery = dbContext.Employees.AsNoTracking().AsQueryable();
        employeesQuery = employeeId is null
            ? employeesQuery.Where(employee => dbContext.EmuFavoriteEmployees.Any(favorite => favorite.EmployeeId == employee.Id && favorite.IsActive))
            : employeesQuery.Where(employee => employee.Id == employeeId.Value);

        var visibleEmployeeIds = GetVisibleEmuEmployeeIds(date, allowedSectionIds);
        if (visibleEmployeeIds is not null)
        {
            employeesQuery = employeesQuery.Where(employee => visibleEmployeeIds.Contains(employee.Id));
        }

        var employees = employeesQuery.OrderBy(employee => employee.FullName).ToList();
        var employeeIds = employees.Select(employee => employee.Id).ToList();
        var stored = dbContext.EmuEmployeeShifts
            .AsNoTracking()
            .Include(row => row.Employee)
            .Include(row => row.Template)
            .Where(row => row.ShiftDate == date && employeeIds.Contains(row.EmployeeId))
            .ToDictionary(row => row.EmployeeId);

        return employees
            .Select(employee => stored.TryGetValue(employee.Id, out var shift)
                ? MapEmployeeShift(ApplyPercoPresenceToShift(shift))
                : MapEmployeeShift(ApplyPercoPresenceToShift(BuildDefaultShift(employee, date))))
            .ToList();
    }

    public EmuCommandResult<EmuEmployeeShiftDto> UpdateEmployeeShift(Guid id, EmuUpdateEmployeeShiftDto request, Guid? actorUserId, string actorName)
    {
        var reason = NormalizeRequired(request.Reason);
        if (reason.Length == 0)
        {
            return Failure<EmuEmployeeShiftDto>("reason", "Укажите причину корректировки смены");
        }

        var employee = dbContext.Employees.FirstOrDefault(row => row.Id == request.EmployeeId);
        if (employee is null)
        {
            return Failure<EmuEmployeeShiftDto>("employeeId", "Сотрудник не найден");
        }

        var template = ResolveShiftTemplate(request.ShiftType, employee);
        var baseline = BuildDefaultShift(employee, request.ShiftDate, template, id);
        var entity = dbContext.EmuEmployeeShifts
            .Include(row => row.Employee)
            .Include(row => row.Template)
            .FirstOrDefault(row => row.Id == id || (row.EmployeeId == request.EmployeeId && row.ShiftDate == request.ShiftDate));

        if (entity is not null && request.RowVersion != entity.RowVersion)
        {
            return Failure<EmuEmployeeShiftDto>("rowVersion", "Смена была изменена другим пользователем");
        }

        var before = entity is null ? MapEmployeeShift(baseline) : MapEmployeeShift(entity);
        var now = DateTimeOffset.UtcNow;
        entity ??= new EmuEmployeeShiftEntity
        {
            Id = id,
            EmployeeId = request.EmployeeId,
            Employee = employee,
            ShiftDate = request.ShiftDate,
            RowVersion = 0
        };

        entity.TemplateId = template.Id;
        entity.Template = template;
        entity.ShiftType = template.ShiftType;
        entity.PlannedStartAt = baseline.PlannedStartAt;
        entity.PlannedEndAt = baseline.PlannedEndAt;
        entity.ActualStartAt = (request.ActualStartAt ?? baseline.ActualStartAt).ToUniversalTime();
        entity.ActualEndAt = (request.ActualEndAt ?? baseline.ActualEndAt).ToUniversalTime();
        entity.LunchStartAt = (request.LunchStartAt ?? baseline.LunchStartAt).ToUniversalTime();
        entity.LunchEndAt = (request.LunchEndAt ?? baseline.LunchEndAt).ToUniversalTime();
        entity.LunchTaken = request.LunchTaken;
        entity.LunchOverridden = request.LunchOverridden;
        entity.Source = "manual";
        entity.Comment = NormalizeOptional(request.Comment);
        entity.Reason = reason;
        entity.AdjustedByUserId = actorUserId;
        entity.AdjustedByName = string.IsNullOrWhiteSpace(actorName) ? "system" : actorName;
        entity.AdjustedAt = now;
        entity.RowVersion++;

        if (entity.ActualEndAt < entity.ActualStartAt)
        {
            return Failure<EmuEmployeeShiftDto>("actualEndAt", "Окончание смены не может быть раньше начала");
        }

        if (dbContext.Entry(entity).State == EntityState.Detached)
        {
            dbContext.EmuEmployeeShifts.Add(entity);
        }

        var after = MapEmployeeShift(entity);
        AddAudit(null, null, "shift_adjusted", before.ShiftType, after.ShiftType, BuildShiftAuditComment(before, after, reason), actorUserId, actorName, now);
        dbContext.SaveChanges();
        return Success(MapEmployeeShift(dbContext.EmuEmployeeShifts.AsNoTracking().Include(row => row.Employee).Include(row => row.Template).Single(row => row.Id == entity.Id)));
    }
}
