using Microsoft.AspNetCore.Mvc;
using Patrol360.Api.Authorization;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Api.Controllers;

[ApiController]
[Route("api/v1/mobile-accounts")]
[RequireAnyPermission("mobile_accounts.read", "mobile_accounts.write")]
public sealed class MobileAccountsController(
    IMobileAccountService mobileAccountService,
    IEmployeeDirectoryQuery employeeDirectoryQuery) : ControllerBase
{
    [HttpGet]
    public ActionResult<IReadOnlyList<MobileAccountDto>> List() => Ok(mobileAccountService.GetAccounts());

    [HttpGet("{id:guid}")]
    public ActionResult<MobileAccountDto> Get(Guid id)
    {
        var account = mobileAccountService.GetAccount(id);
        return account is null ? NotFound() : Ok(account);
    }

    [HttpPost]
    [RequirePermission("mobile_accounts.write")]
    public ActionResult<MobileAccountCreatedDto> Create(CreateMobileAccountDto request)
    {
        var result = mobileAccountService.CreateAccount(request);
        if (!result.Succeeded)
        {
            return MobileAccountValidationProblem(result.Errors);
        }

        return CreatedAtAction(
            nameof(Get),
            new { id = result.Account!.Id },
            new MobileAccountCreatedDto(result.Account, result.TemporaryPassword));
    }

    [HttpPost("{id:guid}/employees")]
    [RequirePermission("mobile_accounts.write")]
    public ActionResult<MobileAccountDto> AttachEmployee(Guid id, AttachMobileAccountEmployeeDto request)
    {
        var result = mobileAccountService.AttachEmployee(id, request);
        if (!result.Succeeded)
        {
            if (result.Errors.ContainsKey("account"))
            {
                return NotFound();
            }

            return MobileAccountValidationProblem(result.Errors);
        }

        return Ok(result.Account);
    }

    [HttpPut("{id:guid}")]
    [RequirePermission("mobile_accounts.write")]
    public ActionResult<MobileAccountDto> Update(Guid id, UpdateMobileAccountDto request)
    {
        var result = mobileAccountService.UpdateAccount(id, request);
        if (!result.Succeeded)
        {
            if (result.Errors.ContainsKey("account"))
            {
                return NotFound();
            }

            return MobileAccountValidationProblem(result.Errors);
        }

        return Ok(result.Account);
    }

    [HttpPost("{id:guid}/block")]
    [RequirePermission("mobile_accounts.write")]
    public ActionResult<MobileAccountDto> Block(Guid id)
    {
        var result = mobileAccountService.BlockAccount(id);
        if (!result.Succeeded)
        {
            return NotFound();
        }

        return Ok(result.Account);
    }

    [HttpPost("{id:guid}/unblock")]
    [RequirePermission("mobile_accounts.write")]
    public ActionResult<MobileAccountDto> Unblock(Guid id)
    {
        var result = mobileAccountService.UnblockAccount(id);
        if (!result.Succeeded)
        {
            return NotFound();
        }

        return Ok(result.Account);
    }

    [HttpDelete("{id:guid}/employees/{employeeId:guid}")]
    [RequirePermission("mobile_accounts.write")]
    public ActionResult<MobileAccountDto> DetachEmployee(Guid id, Guid employeeId)
    {
        var result = mobileAccountService.DetachEmployee(id, employeeId);
        if (!result.Succeeded)
        {
            if (result.Errors.ContainsKey("account"))
            {
                return NotFound();
            }

            return MobileAccountValidationProblem(result.Errors);
        }

        return Ok(result.Account);
    }

    [HttpGet("{id}/sessions")]
    public ActionResult<IReadOnlyList<MobileAccountSessionDto>> Sessions(string id) =>
        Guid.TryParse(id, out var accountId)
            ? Ok(mobileAccountService.GetSessions(accountId))
            : Ok(Array.Empty<MobileAccountSessionDto>());

    [HttpGet("{id}/security-events")]
    public ActionResult<IReadOnlyList<MobileAccountSecurityEventDto>> SecurityEvents(string id) =>
        Guid.TryParse(id, out var accountId)
            ? Ok(mobileAccountService.GetSecurityEvents(accountId))
            : Ok(Array.Empty<MobileAccountSecurityEventDto>());

    [HttpGet("{id:guid}/binding")]
    public ActionResult<EmployeeBindingDataDto> Binding(Guid id)
    {
        var account = mobileAccountService.GetAccount(id);
        if (account is null)
        {
            return NotFound();
        }

        var linkedEmployees = GetLinkedEmployees(account);
        var availableEmployees = GetAvailableEmployees(account, null, null, null);

        return Ok(new EmployeeBindingDataDto(
            new AccountBindingInfoDto(
                account.Id,
                account.Login,
                account.Login,
                account.Device == "-" ? account.Version : account.Device,
                account.Status),
            linkedEmployees,
            availableEmployees));
    }

    [HttpGet("{id:guid}/available-employees")]
    public ActionResult<IReadOnlyList<AvailableEmployeeDto>> AvailableEmployees(
        Guid id,
        [FromQuery] string? search,
        [FromQuery] string? areaId,
        [FromQuery] string? roleId)
    {
        var account = mobileAccountService.GetAccount(id);
        if (account is null)
        {
            return NotFound();
        }

        return Ok(GetAvailableEmployees(account, search, areaId, roleId));
    }

    [HttpPut("{id:guid}/employees/bind")]
    [RequirePermission("mobile_accounts.write")]
    public ActionResult<MobileAccountDto> BindEmployees(Guid id, BindMobileAccountEmployeesDto request)
    {
        var account = mobileAccountService.GetAccount(id);
        if (account is null)
        {
            return NotFound();
        }

        var employeeIds = request.EmployeeIds.Distinct().ToArray();
        if (request.EmployeeIds.Count == 0)
        {
            return MobileAccountValidationProblem(new Dictionary<string, string[]>
            {
                ["employeeIds"] = ["Нужно выбрать хотя бы одного сотрудника."]
            });
        }

        if (employeeIds.Length != request.EmployeeIds.Count)
        {
            return MobileAccountValidationProblem(new Dictionary<string, string[]>
            {
                ["employeeIds"] = ["Список сотрудников содержит дубли."]
            });
        }

        if (employeeIds.Length > 5)
        {
            return MobileAccountValidationProblem(new Dictionary<string, string[]>
            {
                ["employeeIds"] = ["К одному мобильному аккаунту можно привязать не более 5 сотрудников."]
            });
        }

        var employeesById = employeeDirectoryQuery.GetEmployees().ToDictionary(employee => employee.Id);
        var missingEmployees = employeeIds.Where(employeeId => !employeesById.ContainsKey(employeeId)).ToArray();
        if (missingEmployees.Length > 0)
        {
            return MobileAccountValidationProblem(new Dictionary<string, string[]>
            {
                ["employeeIds"] = ["Один или несколько сотрудников не найдены."]
            });
        }

        foreach (var employeeId in account.BoundEmployeeIds.Where(employeeId => !employeeIds.Contains(employeeId)).ToArray())
        {
            var detachResult = mobileAccountService.DetachEmployee(id, employeeId);
            if (!detachResult.Succeeded)
            {
                return MobileAccountValidationProblem(detachResult.Errors);
            }
        }

        foreach (var employeeId in employeeIds.Where(employeeId => !account.BoundEmployeeIds.Contains(employeeId)))
        {
            var employee = employeesById[employeeId];
            var attachResult = mobileAccountService.AttachEmployee(
                id,
                new AttachMobileAccountEmployeeDto(employee.Id, employee.FullName));

            if (!attachResult.Succeeded)
            {
                return MobileAccountValidationProblem(attachResult.Errors);
            }
        }

        return Ok(mobileAccountService.GetAccount(id));
    }

    [HttpPost("{id:guid}/reset-password")]
    [RequirePermission("mobile_accounts.write")]
    public ActionResult<ResetMobileAccountPasswordDto> ResetPassword(Guid id)
    {
        var result = mobileAccountService.ResetPassword(id);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpDelete("{id:guid}")]
    [RequirePermission("mobile_accounts.write")]
    public IActionResult Delete(Guid id) =>
        mobileAccountService.DeleteAccount(id) ? NoContent() : NotFound();

    private IReadOnlyList<LinkedEmployeeDto> GetLinkedEmployees(MobileAccountDto account)
    {
        var employeesById = employeeDirectoryQuery.GetEmployees().ToDictionary(employee => employee.Id);
        return account.BoundEmployeeIds
            .Select((employeeId, index) =>
            {
                employeesById.TryGetValue(employeeId, out var employee);
                var fallbackName = account.BoundEmployees.ElementAtOrDefault(index) ?? "Сотрудник";

                return new LinkedEmployeeDto(
                    employeeId,
                    employee?.FullName ?? fallbackName,
                    employee?.Position ?? account.Role,
                    null);
            })
            .ToArray();
    }

    private IReadOnlyList<AvailableEmployeeDto> GetAvailableEmployees(
        MobileAccountDto account,
        string? search,
        string? areaId,
        string? roleId)
    {
        var normalizedSearch = search?.Trim();
        var normalizedArea = areaId?.Trim();
        var normalizedRole = roleId?.Trim();
        var boundIds = account.BoundEmployeeIds.ToHashSet();

        return employeeDirectoryQuery.GetEmployees()
            .Where(employee => !boundIds.Contains(employee.Id))
            .Where(employee => string.IsNullOrWhiteSpace(normalizedRole)
                || employee.Position.Contains(normalizedRole, StringComparison.OrdinalIgnoreCase))
            .Where(employee => string.IsNullOrWhiteSpace(normalizedArea)
                || employee.Department.Contains(normalizedArea, StringComparison.OrdinalIgnoreCase)
                || employee.Shift.Contains(normalizedArea, StringComparison.OrdinalIgnoreCase))
            .Where(employee => string.IsNullOrWhiteSpace(normalizedSearch)
                || employee.FullName.Contains(normalizedSearch, StringComparison.OrdinalIgnoreCase)
                || employee.Position.Contains(normalizedSearch, StringComparison.OrdinalIgnoreCase)
                || employee.Department.Contains(normalizedSearch, StringComparison.OrdinalIgnoreCase)
                || employee.Shift.Contains(normalizedSearch, StringComparison.OrdinalIgnoreCase))
            .Select(employee => new AvailableEmployeeDto(
                employee.Id,
                employee.FullName,
                employee.Position,
                employee.Department,
                employee.Shift,
                null))
            .ToArray();
    }

    private ActionResult MobileAccountValidationProblem(IReadOnlyDictionary<string, string[]> errors) =>
        ValidationProblem(new ValidationProblemDetails(errors.ToDictionary(item => item.Key, item => item.Value))
        {
            Title = "Мобильный аккаунт не сохранен",
            Detail = "Проверьте логин, область доступа и привязку сотрудников.",
            Status = StatusCodes.Status400BadRequest
        });
}
