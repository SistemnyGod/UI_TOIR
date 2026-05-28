using Microsoft.AspNetCore.Mvc;
using Patrol360.Api.Authorization;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Api.Controllers;

[ApiController]
[Route("api/v1/dashboards")]
[Route("api/v1/dashboard")]
public sealed class DashboardController(IPatrolDashboardQuery dashboardQuery) : ControllerBase
{
    [HttpGet("summary")]
    [RequirePermission("dashboard.read")]
    public ActionResult<DashboardSummaryDto> Summary() => Ok(dashboardQuery.GetSummary());

    [HttpGet("active-patrols")]
    [HttpGet("active-assignments")]
    [RequirePermission("dashboard.read")]
    public ActionResult<IReadOnlyList<AssignmentDto>> ActiveAssignments() => Ok(dashboardQuery.GetActiveAssignments());
}
