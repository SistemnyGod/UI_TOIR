using Microsoft.AspNetCore.Mvc;
using Patrol360.Api.Authorization;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Api.Controllers;

// Dispatcher queue of patrol reports that reached the server after the
// assignment was closed. The phone opts in with lateReportPolicy = "review".
[ApiController]
[Route("api/v1/patrol-late-reports")]
public sealed class PatrolLateReportsController(IPatrolLateReportService service) : ControllerBase
{
    [HttpGet]
    [RequirePermission("requests.read")]
    public ActionResult<IReadOnlyList<PatrolLateReportDto>> List(string? status = "pending", int limit = 50) =>
        Ok(service.GetLateReports(status, limit));

    [HttpPost("{id:guid}/resolution")]
    [RequirePermission("assignments.write")]
    public ActionResult<PatrolLateReportDto> Resolve(Guid id, PatrolLateReportResolutionRequestDto request)
    {
        var result = service.ResolveLateReport(id, request, User.Identity?.Name ?? "Диспетчер");
        return result.ErrorCode switch
        {
            null => Ok(result.Report),
            "notFound" => NotFound(new { code = result.ErrorCode, message = result.ErrorMessage }),
            "invalidDecision" or "invalidComment" => BadRequest(new { code = result.ErrorCode, message = result.ErrorMessage }),
            _ => Conflict(new { code = result.ErrorCode, message = result.ErrorMessage }),
        };
    }
}
