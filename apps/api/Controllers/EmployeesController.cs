using Microsoft.AspNetCore.Mvc;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Api.Controllers;

[ApiController]
[Route("api/v1/employees")]
public sealed class EmployeesController(
    IEmployeeDirectoryQuery employeeDirectoryQuery,
    IEmployeeDirectoryService employeeDirectoryService) : ControllerBase
{
    [HttpGet]
    public ActionResult<IReadOnlyList<EmployeeDto>> List() => Ok(employeeDirectoryQuery.GetEmployees());

    [HttpGet("{id:guid}")]
    public ActionResult<EmployeeDto> Get(Guid id)
    {
        var employee = employeeDirectoryQuery.GetEmployee(id);
        return employee is null ? NotFound() : Ok(employee);
    }

    [HttpPost]
    public ActionResult<EmployeeDto> Create(CreateEmployeeDto request)
    {
        var result = employeeDirectoryService.CreateEmployee(request);
        if (!result.Succeeded)
        {
            return EmployeeValidationProblem(result.Errors);
        }

        return CreatedAtAction(nameof(Get), new { id = result.Employee!.Id }, result.Employee);
    }

    [HttpPut("{id:guid}")]
    public ActionResult<EmployeeDto> Update(Guid id, UpdateEmployeeDto request)
    {
        var result = employeeDirectoryService.UpdateEmployee(id, request);
        if (!result.Succeeded)
        {
            if (result.Errors.ContainsKey("employee"))
            {
                return NotFound();
            }

            return EmployeeValidationProblem(result.Errors);
        }

        return Ok(result.Employee);
    }

    [HttpDelete("{id:guid}")]
    public IActionResult Delete(Guid id)
    {
        return employeeDirectoryService.DeleteEmployee(id) ? NoContent() : NotFound();
    }

    private ActionResult EmployeeValidationProblem(IReadOnlyDictionary<string, string[]> errors) =>
        ValidationProblem(new ValidationProblemDetails(errors.ToDictionary(item => item.Key, item => item.Value))
        {
            Title = "Сотрудник не сохранен",
            Detail = "Проверьте обязательные поля сотрудника.",
            Status = StatusCodes.Status400BadRequest
        });
}
