using Microsoft.AspNetCore.Mvc;
using Patrol360.Api.Authorization;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Api.Controllers;

[ApiController]
[Route("api/v1/results")]
public sealed class ResultsController(IPatrolResultQuery resultQuery) : ControllerBase
{
    [HttpGet]
    [RequirePermission("results.read")]
    public ActionResult<IReadOnlyList<ResultListItemDto>> List(
        [FromQuery] string? status,
        [FromQuery] Guid? routeId,
        [FromQuery] Guid? employeeId,
        [FromQuery] DateOnly? dateFrom,
        [FromQuery] DateOnly? dateTo,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 100)
    {
        var filter = new ResultFilterDto(status, routeId, employeeId, dateFrom, dateTo);

        return Ok(resultQuery.GetResults(filter, page, pageSize));
    }

    [HttpGet("export")]
    [RequirePermission("results.read")]
    public IActionResult Export(
        [FromQuery] string? status,
        [FromQuery] Guid? routeId,
        [FromQuery] Guid? employeeId,
        [FromQuery] DateOnly? dateFrom,
        [FromQuery] DateOnly? dateTo)
    {
        var filter = new ResultFilterDto(status, routeId, employeeId, dateFrom, dateTo);
        var export = resultQuery.ExportResults(filter);
        Response.Headers["X-Patrol360-Export-Truncated"] = export.Truncated ? "true" : "false";
        Response.Headers["X-Patrol360-Export-Row-Count"] = export.RowCount.ToString();
        Response.Headers["X-Patrol360-Export-Max-Rows"] = export.MaxRows.ToString();

        return File(export.Content, export.ContentType, export.FileName);
    }

    [HttpGet("{id:guid}")]
    [RequirePermission("results.read")]
    public ActionResult<ResultDetailDto> Get(Guid id)
    {
        var result = resultQuery.GetResult(id);

        return result is null ? NotFound() : Ok(result);
    }

    [HttpGet("{id:guid}/attachments/{attachmentId:guid}")]
    [RequirePermission("results.read")]
    public IActionResult DownloadAttachment(Guid id, Guid attachmentId)
    {
        var attachment = resultQuery.GetAttachmentFile(id, attachmentId);

        return attachment is null
            ? NotFound()
            : PhysicalFile(attachment.Path, attachment.ContentType, attachment.FileName);
    }
}
