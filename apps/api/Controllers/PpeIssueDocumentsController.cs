using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Patrol360.Api.Authorization;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Api.Controllers;

[ApiController]
[Route("api/v1/inventory/ppe/issue-documents")]
[RequirePermission("inventory.view")]
public sealed class PpeIssueDocumentsController(
    IPpeIssueDocumentService service, IPpeIssueDocumentPrintService printing, IConfiguration configuration) : ControllerBase
{
    private bool Enabled => configuration.GetValue<bool>("Features:PpeIssueDocuments");
    private string ActorName => User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.Identity?.Name ?? "unknown";

    [HttpGet("capabilities")]
    public IActionResult Capabilities() => Ok(new { enabled = Enabled });

    [HttpGet]
    public IActionResult List([FromQuery] Guid? employeeId) => Enabled ? Ok(service.GetIssueDocuments(employeeId)) : NotFound();

    [HttpGet("norms")]
    public IActionResult Norms([FromQuery] Guid employeeId, [FromQuery] DateOnly date) => Enabled ? Ok(service.GetApplicablePpeNorms(employeeId, date)) : NotFound();

    [HttpGet("{id:guid}")]
    public IActionResult Get(Guid id) => Enabled ? Result(service.GetIssueDocument(id)) : NotFound();

    [HttpPost]
    [RequirePermission("inventory.ppe.manage")]
    public IActionResult Create(SavePpeIssueDocumentDto request) => Enabled ? Result(service.SaveIssueDocument(null, request, ActorName)) : NotFound();

    [HttpPut("{id:guid}")]
    [RequirePermission("inventory.ppe.manage")]
    public IActionResult Update(Guid id, SavePpeIssueDocumentDto request) => Enabled ? Result(service.SaveIssueDocument(id, request, ActorName)) : NotFound();

    [HttpPost("{id:guid}/validate")]
    public IActionResult Validate(Guid id) => Enabled ? Result(service.ValidateIssueDocument(id)) : NotFound();

    [HttpPost("{id:guid}/confirm")]
    [RequirePermission("inventory.ppe.manage")]
    public IActionResult Confirm(Guid id, ConfirmPpeIssueDocumentDto request) => Enabled ? Result(service.ConfirmIssueDocument(id, request, ActorName)) : NotFound();

    [HttpPost("{id:guid}/cancel")]
    [RequirePermission("inventory.ppe.manage")]
    public IActionResult Cancel(Guid id, CancelPpeIssueDocumentDto request) => Enabled ? Result(service.CancelIssueDocument(id, request, ActorName)) : NotFound();

    [HttpPost("legacy-drafts/{cardId:guid}/migrate")]
    [RequirePermission("inventory.ppe.manage")]
    public IActionResult Migrate(Guid cardId) => Enabled ? Result(service.MigratePpeLegacyDraft(cardId, ActorName)) : NotFound();

    [HttpPut("norm-sets/{id:guid}/scope")]
    [RequirePermission("inventory.ppe.norms.manage")]
    public IActionResult Scope(Guid id, PpeNormApprovalDto request) => Enabled ? Result(service.ApprovePpeNormScope(id, request, ActorName)) : NotFound();

    [HttpPut("norm-rows/{id:guid}/rules")]
    [RequirePermission("inventory.ppe.norms.manage")]
    public IActionResult Rules(Guid id, PpeNormRowRulesDto request) => Enabled ? Result(service.SetPpeNormRowRules(id, request, ActorName)) : NotFound();

    [HttpPut("norm-rows/{id:guid}/approval")]
    [RequirePermission("inventory.ppe.norms.manage")]
    public IActionResult Approval(Guid id, PpeMappingApprovalDto request) => Enabled ? Result(service.ApprovePpeMapping(id, request, ActorName)) : NotFound();

    [HttpGet("{id:guid}/print")]
    [RequirePermission("inventory.reports.export")]
    public async Task<IActionResult> Print(Guid id, [FromQuery] string type = "norms", [FromQuery] string format = "pdf", CancellationToken cancellationToken = default)
    {
        if (!Enabled) return NotFound();
        var result = await printing.PrintAsync(id, type, format, cancellationToken);
        return result.Succeeded ? File(result.Value!.Content, result.Value.ContentType, result.Value.DownloadName) : Result(result);
    }

    private IActionResult Result<T>(InventoryCommandResult<T> result)
    {
        if (!Enabled) return NotFound();
        if (result.Succeeded) return Ok(result.Value);
        return StatusCode(result.Errors.ContainsKey("conflict") ? 409 : 400, new ValidationProblemDetails(result.Errors.ToDictionary(x => x.Key, x => x.Value)));
    }
}
