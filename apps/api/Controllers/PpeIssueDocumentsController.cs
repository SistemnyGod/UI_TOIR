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
    IPpeIssueDocumentService service, IPpeIssueDocumentPrintService printing, IConfiguration configuration,
    IInventoryWorkflowService? norms = null) : ControllerBase
{
    private bool Enabled => configuration.GetValue<bool>("Features:PpeIssueDocuments") && Readiness().Ready;
    private (bool Ready, int Count, int Total) Readiness()
    {
        return PpeIssuancePolicy.Readiness(norms, configuration);
    }
    private string ActorName => User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.Identity?.Name ?? "unknown";

    [HttpGet("capabilities")]
    public IActionResult Capabilities()
    {
        var readiness = Readiness();
        var flag = configuration.GetValue<bool>("Features:PpeIssueDocuments");
        return Ok(new { enabled = flag && readiness.Ready, readyCount = readiness.Count, totalCount = readiness.Total,
            reason = !flag ? "Новые выдачи выключены сервером до завершения приёмки." : !readiness.Ready ? "Не все наборы норм проверены и опубликованы." : "" });
    }

    [HttpGet]
    public IActionResult List([FromQuery] Guid? employeeId) => Ok(service.GetIssueDocuments(employeeId));

    [HttpGet("journal")]
    public IActionResult Journal([FromQuery] PpeIssueJournalQuery query) => Ok(service.GetIssueJournal(query));

    [HttpGet("journal/export")]
    [RequirePermission("inventory.reports.export")]
    public IActionResult ExportJournal([FromQuery] PpeIssueJournalQuery query)
    {
        var file = service.ExportIssueJournal(query);
        return File(file.Content, file.ContentType, file.DownloadName);
    }

    [HttpGet("norms")]
    public IActionResult Norms([FromQuery] Guid employeeId, [FromQuery] DateOnly date) => Ok(service.GetApplicablePpeNorms(employeeId, date));

    [HttpGet("{id:guid}")]
    public IActionResult Get(Guid id) => Result(service.GetIssueDocument(id));

    [HttpPost]
    [RequirePermission("inventory.ppe.manage")]
    public IActionResult Create(SavePpeIssueDocumentDto request) => Enabled ? Result(service.SaveIssueDocument(null, request, ActorName)) : Blocked();

    [HttpPut("{id:guid}")]
    [RequirePermission("inventory.ppe.manage")]
    public IActionResult Update(Guid id, SavePpeIssueDocumentDto request) => Enabled ? Result(service.SaveIssueDocument(id, request, ActorName)) : Blocked();

    [HttpPost("{id:guid}/validate")]
    public IActionResult Validate(Guid id) => Result(service.ValidateIssueDocument(id));

    [HttpPost("{id:guid}/confirm")]
    [RequirePermission("inventory.ppe.manage")]
    public IActionResult Confirm(Guid id, ConfirmPpeIssueDocumentDto request) => Enabled || service.GetIssueDocument(id).Value?.Status == "confirmed" ? Result(service.ConfirmIssueDocument(id, request, ActorName)) : Blocked();

    [HttpPost("{id:guid}/cancel")]
    [RequirePermission("inventory.ppe.manage")]
    public IActionResult Cancel(Guid id, CancelPpeIssueDocumentDto request) => Result(service.CancelIssueDocument(id, request, ActorName));

    [HttpPost("legacy-drafts/{cardId:guid}/migrate")]
    [RequirePermission("inventory.ppe.manage")]
    public IActionResult Migrate(Guid cardId) => Enabled ? Result(service.MigratePpeLegacyDraft(cardId, ActorName)) : Blocked();

    [HttpPut("norm-sets/{id:guid}/scope")]
    [RequirePermission("inventory.ppe.norms.manage")]
    public IActionResult Scope(Guid id, PpeNormApprovalDto request) => Result(service.ApprovePpeNormScope(id, request, ActorName));

    [HttpPut("norm-rows/{id:guid}/rules")]
    [RequirePermission("inventory.ppe.norms.manage")]
    public IActionResult Rules(Guid id, PpeNormRowRulesDto request) => Result(service.SetPpeNormRowRules(id, request, ActorName));

    [HttpPut("norm-rows/{id:guid}/approval")]
    [RequirePermission("inventory.ppe.norms.manage")]
    public IActionResult Approval(Guid id, PpeMappingApprovalDto request) => Result(service.ApprovePpeMapping(id, request, ActorName));

    [HttpGet("{id:guid}/print")]
    [RequirePermission("inventory.reports.export")]
    public async Task<IActionResult> Print(Guid id, [FromQuery] string type = "norms", [FromQuery] string format = "pdf", CancellationToken cancellationToken = default)
    {
        var result = await printing.PrintAsync(id, type, format, cancellationToken);
        return result.Succeeded ? File(result.Value!.Content, result.Value.ContentType, result.Value.DownloadName) : Result(result);
    }

    private IActionResult Result<T>(InventoryCommandResult<T> result)
    {
        if (result.Succeeded) return Ok(result.Value);
        return StatusCode(result.Errors.ContainsKey("conflict") ? 409 : 400, new ValidationProblemDetails(result.Errors.ToDictionary(x => x.Key, x => x.Value)));
    }

    private IActionResult Blocked() => Conflict(new ProblemDetails { Status = 409, Title = "Новые выдачи СИЗ недоступны", Detail = "Завершите проверку и публикацию всех наборов норм. Выдача включается после приёмки; просмотр, подготовка норм и печать сохранённых документов доступны." });
}
