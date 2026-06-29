using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Caching.Memory;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfPatrolStore
{
    public IReadOnlyList<EmployeeDto> GetEmployees() =>
        dbContext.Employees
            .AsNoTracking()
            .OrderBy(employee => employee.FullName)
            .AsEnumerable()
            .Select(employee => MapEmployee(employee))
            .ToList();

    public EmployeeDto? GetEmployee(Guid id)
    {
        var employee = dbContext.Employees.AsNoTracking().FirstOrDefault(item => item.Id == id);
        return employee is null ? null : MapEmployee(employee);
    }

    public CreateEmployeeResult CreateEmployee(CreateEmployeeDto request)
    {
        var personnelNo = NormalizeEmployeePersonnelNo(request.PersonnelNo);
        var errors = ValidateEmployee(request.FullName);
        AddPersonnelNoUniquenessError(errors, personnelNo);
        if (errors.Count > 0)
        {
            return new CreateEmployeeResult(null, errors);
        }

        var employee = new EmployeeEntity
        {
            Id = Guid.NewGuid(),
            FullName = request.FullName.Trim(),
            PersonnelNo = personnelNo,
            Position = NormalizeOptionalText(request.Position, "Сотрудник"),
            Department = NormalizeOptionalText(request.Department, "Не указано"),
            EmployeeGroup = NormalizeOptionalText(request.EmployeeGroup),
            HiredAt = request.HiredAt,
            BirthDate = request.BirthDate,
            Status = NormalizeOptionalText(request.Status, "Активен"),
            Shift = NormalizeOptionalText(request.Shift, "Пятидневка"),
            HasMobileAccount = request.HasMobileAccount,
            LastSeenAt = DateTimeOffset.UtcNow
        };

        dbContext.Employees.Add(employee);
        SaveChangesAndInvalidateDashboardSummary();

        return new CreateEmployeeResult(MapEmployee(employee), new Dictionary<string, string[]>());
    }

    public UpdateEmployeeResult UpdateEmployee(Guid id, UpdateEmployeeDto request)
    {
        var employee = dbContext.Employees.FirstOrDefault(item => item.Id == id);
        if (employee is null)
        {
            return new UpdateEmployeeResult(null, new Dictionary<string, string[]> { ["employee"] = ["Сотрудник не найден."] });
        }

        var personnelNo = NormalizeEmployeePersonnelNo(request.PersonnelNo);
        var errors = ValidateEmployee(request.FullName);
        AddPersonnelNoUniquenessError(errors, personnelNo, id);
        if (errors.Count > 0)
        {
            return new UpdateEmployeeResult(null, errors);
        }

        employee.FullName = request.FullName.Trim();
        employee.PersonnelNo = personnelNo;
        employee.Position = NormalizeOptionalText(request.Position, "Сотрудник");
        employee.Department = NormalizeOptionalText(request.Department, "Не указано");
        employee.EmployeeGroup = NormalizeOptionalText(request.EmployeeGroup);
        employee.HiredAt = request.HiredAt;
        employee.BirthDate = request.BirthDate;
        employee.Status = NormalizeOptionalText(request.Status, "Активен");
        employee.Shift = NormalizeOptionalText(request.Shift, "Пятидневка");
        employee.HasMobileAccount = request.HasMobileAccount;
        employee.LastSeenAt = DateTimeOffset.UtcNow;

        SaveChangesAndInvalidateDashboardSummary();

        return new UpdateEmployeeResult(MapEmployee(employee), new Dictionary<string, string[]>());
    }

    public bool DeleteEmployee(Guid id)
    {
        var employee = dbContext.Employees.FirstOrDefault(item => item.Id == id);
        if (employee is null)
        {
            return false;
        }

        employee.Status = "Офлайн";
        employee.HasMobileAccount = false;
        employee.LastSeenAt = DateTimeOffset.UtcNow;
        SaveChangesAndInvalidateDashboardSummary();

        return true;
    }

    private static Dictionary<string, string[]> ValidateEmployee(string? fullName)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(fullName))
        {
            errors["fullName"] = ["Укажите ФИО сотрудника."];
        }

        return errors;
    }

    private void AddPersonnelNoUniquenessError(Dictionary<string, string[]> errors, string? personnelNo, Guid? employeeId = null)
    {
        if (string.IsNullOrWhiteSpace(personnelNo))
        {
            return;
        }

        var normalized = personnelNo.Trim();
        var exists = dbContext.Employees.Any(employee =>
            employee.PersonnelNo == normalized && (employeeId == null || employee.Id != employeeId.Value));
        if (exists)
        {
            errors["personnelNo"] = ["Сотрудник с таким табельным номером уже есть."];
        }
    }

    private static EmployeeDto MapEmployee(EmployeeEntity employee) =>
        new(
            employee.Id,
            employee.FullName,
            employee.PersonnelNo,
            employee.Position,
            employee.Department,
            employee.EmployeeGroup,
            employee.HiredAt,
            employee.BirthDate,
            employee.Status,
            employee.Shift,
            employee.HasMobileAccount,
            employee.LastSeenAt);

    private static string NormalizeEmployeePersonnelNo(string? value)
    {
        var normalized = NormalizeOptionalText(value);
        if (normalized.Length > 0)
        {
            return normalized;
        }

        return $"EMP-{DateTimeOffset.UtcNow:yyyyMMddHHmmss}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}";
    }
}
