using Microsoft.AspNetCore.Mvc;
using Patrol360.Api.Authorization;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Api.Controllers;

[ApiController]
[Route("api/v1/inventory/ppe/kit-templates")]
[RequirePermission("inventory.view")]
public sealed class PpeKitTemplatesController(IPpeKitTemplateService service, IAuthenticatedSiteUserContext userContext) : ControllerBase
{
    private SessionUserDto UserInfo => userContext.User ?? throw new InvalidOperationException("Authenticated site user is unavailable");
    private bool CanManageShared => UserInfo.Permissions.Contains("inventory.ppe.norms.manage", StringComparer.OrdinalIgnoreCase);
    [HttpGet] public IActionResult Get() => Ok(service.Get(UserInfo.Id));
    [HttpGet("legacy"), RequirePermission("inventory.ppe.norms.manage")] public IActionResult Legacy() => Ok(service.GetLegacy());
    [HttpPut("{id:guid}/bind"), RequirePermission("inventory.ppe.norms.manage")] public IActionResult BindLegacy(Guid id, BindLegacyPpeKitTemplateDto request) => Result(service.BindLegacy(id, request, UserInfo.Id, UserInfo.DisplayName));
    [HttpPost, RequirePermission("inventory.ppe.manage")] public IActionResult Create(CreatePpeKitTemplateDto request) => Result(service.Create(request, UserInfo.Id, UserInfo.DisplayName, CanManageShared));
    [HttpPut("{id:guid}"), RequirePermission("inventory.ppe.manage")] public IActionResult Update(Guid id, UpdatePpeKitTemplateDto request) => Result(service.Update(id, request, UserInfo.Id, CanManageShared));
    [HttpPatch("{id:guid}/name"), RequirePermission("inventory.ppe.manage")] public IActionResult Rename(Guid id, RenamePpeKitTemplateDto request) => Result(service.Rename(id, request, UserInfo.Id, CanManageShared));
    [HttpPost("{id:guid}/copy"), RequirePermission("inventory.ppe.manage")] public IActionResult Copy(Guid id, CopyPpeKitTemplateDto request) => Result(service.Copy(id, request, UserInfo.Id, UserInfo.DisplayName, CanManageShared));
    [HttpPost("{id:guid}/apply")] public IActionResult Apply(Guid id, [FromBody] ApplyRequest request) => Result(service.Apply(id, request.NormSetId, UserInfo.Id));
    [HttpPatch("{id:guid}/archive"), RequirePermission("inventory.ppe.manage")] public IActionResult Archive(Guid id, ArchivePpeKitTemplateDto request) => Result(service.Archive(id, request, UserInfo.Id, CanManageShared));
    private IActionResult Result(InventoryCommandResult<PpeKitTemplateDto> result) => result.Succeeded ? Ok(result.Value) : StatusCode(result.Errors.ContainsKey("conflict") ? 409 : result.Errors.ContainsKey("permission") ? 403 : 400, new ValidationProblemDetails(result.Errors.ToDictionary(x => x.Key, x => x.Value)));
    public sealed record ApplyRequest(Guid NormSetId);
}
