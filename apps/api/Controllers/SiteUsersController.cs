using Microsoft.AspNetCore.Mvc;
using Patrol360.Api.Authorization;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Api.Controllers;

[ApiController]
[Route("api/v1/site-users")]
[RequirePermission("site_users.write")]
public sealed class SiteUsersController(ISiteUserAdminService siteUserAdminService) : ControllerBase
{
    [HttpGet]
    public ActionResult<IReadOnlyList<SiteUserDto>> List() => Ok(siteUserAdminService.GetUsers());

    [HttpGet("{id:guid}")]
    public ActionResult<SiteUserDto> Get(Guid id)
    {
        var user = siteUserAdminService.GetUser(id);
        return user is null ? NotFound() : Ok(user);
    }

    [HttpGet("{id:guid}/access")]
    public ActionResult<SiteUserAccessDto> GetAccess(Guid id)
    {
        var access = siteUserAdminService.GetUserAccess(id);
        return access is null ? NotFound() : Ok(access);
    }

    [HttpGet("roles")]
    public ActionResult<IReadOnlyList<RoleDto>> Roles() => Ok(siteUserAdminService.GetRoles());

    [HttpPost]
    public ActionResult<SiteUserCreatedDto> Create(CreateSiteUserDto request)
    {
        var result = siteUserAdminService.CreateUser(request);
        if (!result.Succeeded)
        {
            return SiteUserValidationProblem(result.Errors);
        }

        return CreatedAtAction(nameof(Get), new { id = result.Created!.User.Id }, result.Created);
    }

    [HttpPut("{id:guid}")]
    public ActionResult<SiteUserDto> Update(Guid id, UpdateSiteUserDto request)
    {
        var result = siteUserAdminService.UpdateUser(id, request);
        if (!result.Succeeded)
        {
            return result.Errors.ContainsKey("user")
                ? NotFound()
                : SiteUserValidationProblem(result.Errors);
        }

        return Ok(result.User);
    }

    [HttpPut("{id:guid}/permissions")]
    public ActionResult<SiteUserDto> UpdatePermissions(Guid id, UpdateSiteUserPermissionsDto request)
    {
        var result = siteUserAdminService.UpdateUserPermissions(id, request);
        if (!result.Succeeded)
        {
            return result.Errors.ContainsKey("user")
                ? NotFound()
                : SiteUserValidationProblem(result.Errors);
        }

        return Ok(result.User);
    }

    [HttpPut("{id:guid}/scopes")]
    public ActionResult<SiteUserAccessDto> UpdateScopes(Guid id, UpdateSiteUserScopesDto request)
    {
        var result = siteUserAdminService.UpdateUserScopes(id, request);
        if (!result.Succeeded)
        {
            return result.Errors.ContainsKey("user")
                ? NotFound()
                : SiteUserValidationProblem(result.Errors);
        }

        return Ok(result.Access);
    }

    [HttpPost("{id:guid}/block")]
    public ActionResult<SiteUserDto> Block(Guid id)
    {
        var result = siteUserAdminService.BlockUser(id);
        return result.Succeeded ? Ok(result.User) : NotFound();
    }

    [HttpPost("{id:guid}/unblock")]
    public ActionResult<SiteUserDto> Unblock(Guid id)
    {
        var result = siteUserAdminService.UnblockUser(id);
        return result.Succeeded ? Ok(result.User) : NotFound();
    }

    [HttpPost("{id:guid}/reset-password")]
    public ActionResult<ResetSiteUserPasswordDto> ResetPassword(Guid id)
    {
        var result = siteUserAdminService.ResetPassword(id);
        return result is null ? NotFound() : Ok(result);
    }

    private ActionResult SiteUserValidationProblem(IReadOnlyDictionary<string, string[]> errors) =>
        ValidationProblem(new ValidationProblemDetails(errors.ToDictionary(item => item.Key, item => item.Value))
        {
            Title = "Пользователь сайта не сохранен",
            Detail = "Проверьте логин, имя, роль и статус пользователя.",
            Status = StatusCodes.Status400BadRequest
        });
}
