using Microsoft.AspNetCore.Mvc;
using Patrol360.Api.Authorization;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Api.Controllers;

[ApiController]
[Route("api/v2/results")]
public sealed class ResultsV2Controller(IPatrolResultQuery resultQuery) : ControllerBase
{
    [HttpGet]
    [RequirePermission("results.read")]
    public ActionResult<ResultPageDto> List(
        [FromQuery] string? status,
        [FromQuery] Guid? routeId,
        [FromQuery] Guid? employeeId,
        [FromQuery] DateOnly? dateFrom,
        [FromQuery] DateOnly? dateTo,
        [FromQuery] Guid? assignmentId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 100,
        [FromQuery] string? query = null,
        [FromQuery] bool? hasPhotos = null)
    {
        var filter = new ResultFilterDto(status, routeId, employeeId, dateFrom, dateTo, assignmentId, query, hasPhotos);
        return Ok(resultQuery.GetResultsPage(filter, page, pageSize));
    }
}
