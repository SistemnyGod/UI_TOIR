using System.Globalization;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;
using Patrol360.Api.Authorization;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Api.Controllers;

[ApiController]
[Route("api/v1/site-users")]
[RequirePermission("site_users.write")]
public sealed class SiteUsersController(
    ISiteUserAdminService siteUserAdminService) : ControllerBase
{
    [HttpGet]
    public ActionResult<IReadOnlyList<SiteUserDto>> List() => Ok(siteUserAdminService.GetUsers());

    [HttpGet("query")]
    public ActionResult<SiteUserListResponseDto> Query(
        [FromQuery] string? search = null,
        [FromQuery] string? role = null,
        [FromQuery] string? status = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 8) =>
        Ok(siteUserAdminService.GetUsersQuery(new SiteUserQuery(search, role, status, page, pageSize)));

    [HttpGet("access-catalog")]
    public ActionResult<SiteUserAccessCatalogDto> AccessCatalog() =>
        Ok(siteUserAdminService.GetAccessCatalog());

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
        var result = siteUserAdminService.CreateUserAsActor(request, Actor());
        if (!result.Succeeded)
        {
            return SiteUserValidationProblem(result.Errors);
        }

        return CreatedAtAction(nameof(Get), new { id = result.Created!.User.Id }, result.Created);
    }

    [HttpPut("{id:guid}")]
    public ActionResult<SiteUserDto> Update(Guid id, UpdateSiteUserDto request)
    {
        var result = siteUserAdminService.UpdateUserAsActor(id, request, Actor());
        if (!result.Succeeded)
        {
            return result.Errors.ContainsKey("user")
                ? NotFound()
                : SiteUserValidationProblem(result.Errors);
        }

        return Ok(result.User);
    }

    [HttpPut("{id:guid}/permissions")]
    public ActionResult<SiteUserDto> UpdatePermissions(Guid id, UpdateSiteUserPermissionsDto request) =>
        UpdatePermissionOverrides(id, request);

    [HttpPut("{id:guid}/permission-overrides")]
    public ActionResult<SiteUserDto> UpdatePermissionOverrides(Guid id, UpdateSiteUserPermissionsDto request)
    {
        var result = siteUserAdminService.UpdateUserPermissionOverrides(id, request, Actor());
        if (!result.Succeeded)
        {
            return result.Errors.ContainsKey("user")
                ? NotFound()
                : SiteUserValidationProblem(result.Errors);
        }

        return Ok(result.User);
    }

    [HttpPut("{id:guid}/scopes")]
    public ActionResult<SiteUserAccessDto> UpdateScopes(Guid id, UpdateSiteUserScopesDto request) =>
        UpdateEmuScope(id, request);

    [HttpPut("{id:guid}/emu-scope")]
    public ActionResult<SiteUserAccessDto> UpdateEmuScope(Guid id, UpdateSiteUserScopesDto request)
    {
        var result = siteUserAdminService.UpdateUserScopesAsActor(id, request, Actor());
        if (!result.Succeeded)
        {
            return result.Errors.ContainsKey("user")
                ? NotFound()
                : SiteUserValidationProblem(result.Errors);
        }

        return Ok(result.Access);
    }

    [HttpGet("{id:guid}/audit")]
    public ActionResult<SiteUserAuditPageDto> Audit(
        Guid id,
        [FromQuery] DateTimeOffset? dateFrom = null,
        [FromQuery] DateTimeOffset? dateTo = null,
        [FromQuery] string? eventType = null,
        [FromQuery] string? moduleKey = null,
        [FromQuery] string? search = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10)
    {
        var result = siteUserAdminService.GetUserAudit(
            id,
            new SiteUserAuditQuery(dateFrom, dateTo, eventType, moduleKey, search, page, pageSize));
        return result.TotalCount == 0 && siteUserAdminService.GetUser(id) is null
            ? NotFound()
            : Ok(result);
    }

    [HttpGet("{id:guid}/audit/export")]
    public ActionResult AuditExport(Guid id)
    {
        var result = siteUserAdminService.GetUserAudit(id, new SiteUserAuditQuery(PageSize: 10000));
        if (result.TotalCount == 0 && siteUserAdminService.GetUser(id) is null)
        {
            return NotFound();
        }

        var csv = new StringBuilder();
        csv.AppendLine("CreatedAt,Actor,EventType,Module,Details,IpAddress");
        foreach (var item in result.Items)
        {
            csv.AppendLine(string.Join(",", new[]
            {
                Csv(item.CreatedAt.ToString("O", CultureInfo.InvariantCulture)),
                Csv(item.ActorName),
                Csv(item.EventType),
                Csv(item.ModuleKey),
                Csv(item.Details),
                Csv(item.IpAddress)
            }));
        }

        return File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", $"site-user-{id}-audit.csv");
    }

    [HttpGet("{id:guid}/sessions")]
    public ActionResult<SiteUserSessionsDto> Sessions(Guid id)
    {
        var result = siteUserAdminService.GetUserSessions(id, ReadBearerToken());
        return result.ActiveCount == 0 && siteUserAdminService.GetUser(id) is null
            ? NotFound()
            : Ok(result);
    }

    [HttpPost("{id:guid}/block")]
    public ActionResult<SiteUserDto> Block(Guid id)
    {
        var result = siteUserAdminService.BlockUserAsActor(id, Actor());
        return result.Succeeded
            ? Ok(result.User)
            : result.Errors.Count > 0
                ? SiteUserValidationProblem(result.Errors)
                : NotFound();
    }

    [HttpPost("{id:guid}/unblock")]
    public ActionResult<SiteUserDto> Unblock(Guid id)
    {
        var result = siteUserAdminService.UnblockUserAsActor(id, Actor());
        return result.Succeeded
            ? Ok(result.User)
            : result.Errors.Count > 0
                ? SiteUserValidationProblem(result.Errors)
                : NotFound();
    }

    [HttpPost("{id:guid}/reset-password")]
    public ActionResult<ResetSiteUserPasswordDto> ResetPassword(Guid id)
    {
        var result = siteUserAdminService.ResetPasswordAsActor(id, Actor());
        return result is null ? NotFound() : Ok(result);
    }

    private SiteUserActorContext Actor()
    {
        var httpContext = ControllerContext?.HttpContext;
        var user = httpContext?.User;
        return new(
            Guid.TryParse(user?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value, out var userId)
                ? userId
                : null,
            user?.Identity?.Name,
            httpContext?.Connection.RemoteIpAddress?.ToString(),
            httpContext?.Request.Headers.UserAgent.ToString());
    }

    private string? ReadBearerToken()
    {
        if (!Request.Headers.TryGetValue(HeaderNames.Authorization, out var values))
        {
            return null;
        }

        var value = values.ToString();
        const string bearerPrefix = "Bearer ";
        return value.StartsWith(bearerPrefix, StringComparison.OrdinalIgnoreCase)
            ? value[bearerPrefix.Length..].Trim()
            : null;
    }

    private static string Csv(string? value)
    {
        var text = value ?? string.Empty;
        return "\"" + text.Replace("\"", "\"\"", StringComparison.Ordinal) + "\"";
    }

    private ActionResult SiteUserValidationProblem(IReadOnlyDictionary<string, string[]> errors) =>
        ValidationProblem(new ValidationProblemDetails(errors.ToDictionary(item => item.Key, item => item.Value))
        {
            Title = "Site user was not saved",
            Detail = "Check the login, name, role and status.",
            Status = StatusCodes.Status400BadRequest
        });
}
