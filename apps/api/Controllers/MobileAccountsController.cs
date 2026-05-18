using Microsoft.AspNetCore.Mvc;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Api.Controllers;

[ApiController]
[Route("api/v1/mobile-accounts")]
public sealed class MobileAccountsController(IMobileAccountService mobileAccountService) : ControllerBase
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

    [HttpGet("{id:guid}/sessions")]
    public ActionResult<IReadOnlyList<MobileAccountSessionDto>> Sessions(Guid id) =>
        Ok(mobileAccountService.GetSessions(id));

    [HttpGet("{id:guid}/security-events")]
    public ActionResult<IReadOnlyList<MobileAccountSecurityEventDto>> SecurityEvents(Guid id) =>
        Ok(mobileAccountService.GetSecurityEvents(id));

    [HttpPost("{id:guid}/reset-password")]
    public ActionResult<ResetMobileAccountPasswordDto> ResetPassword(Guid id)
    {
        var result = mobileAccountService.ResetPassword(id);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpDelete("{id:guid}")]
    public IActionResult Delete(Guid id) =>
        mobileAccountService.DeleteAccount(id) ? NoContent() : NotFound();

    private ActionResult MobileAccountValidationProblem(IReadOnlyDictionary<string, string[]> errors) =>
        ValidationProblem(new ValidationProblemDetails(errors.ToDictionary(item => item.Key, item => item.Value))
        {
            Title = "Мобильный аккаунт не сохранен",
            Detail = "Проверьте логин, область доступа и привязку сотрудников.",
            Status = StatusCodes.Status400BadRequest
        });
}
