using Microsoft.AspNetCore.Mvc;
using Patrol360.Api.Authorization;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Api.Controllers;

// Dispatcher journal of unfinished patrols handed over to another employee of
// the shift from the mobile app (transferPatrolAssignment).
[ApiController]
[Route("api/v1/patrol-transfers")]
public sealed class PatrolTransfersController(IPatrolTransferService service) : ControllerBase
{
    [HttpGet]
    [RequirePermission("requests.read")]
    public ActionResult<IReadOnlyList<PatrolAssignmentTransferDto>> List(Guid? assignmentId = null, int limit = 100) =>
        Ok(service.GetPatrolTransfers(assignmentId, limit));
}
