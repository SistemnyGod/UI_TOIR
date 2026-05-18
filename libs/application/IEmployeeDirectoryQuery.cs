using Patrol360.Contracts;

namespace Patrol360.Application;

public interface IEmployeeDirectoryQuery
{
    IReadOnlyList<EmployeeDto> GetEmployees();

    EmployeeDto? GetEmployee(Guid id);
}

public interface IEmployeeDirectoryService
{
    CreateEmployeeResult CreateEmployee(CreateEmployeeDto request);

    UpdateEmployeeResult UpdateEmployee(Guid id, UpdateEmployeeDto request);

    bool DeleteEmployee(Guid id);
}

public sealed record CreateEmployeeResult(
    EmployeeDto? Employee,
    IReadOnlyDictionary<string, string[]> Errors)
{
    public bool Succeeded => Employee is not null && Errors.Count == 0;
}

public sealed record UpdateEmployeeResult(
    EmployeeDto? Employee,
    IReadOnlyDictionary<string, string[]> Errors)
{
    public bool Succeeded => Employee is not null && Errors.Count == 0;
}
