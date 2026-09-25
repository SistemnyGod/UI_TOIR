using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Patrol360.Api.Authorization;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Api.Controllers;

[ApiController]
[Route("api/v1/patrol-appeals")]
public sealed class PatrolAppealsController(IMobilePatrolAppealService service) : ControllerBase
{
    [HttpGet]
    [RequirePermission("requests.read")]
    public ActionResult<IReadOnlyList<MobilePatrolAppealDto>> List(int page = 1, int pageSize = 25, string? status = "open") => Ok(service.ListPatrolAppeals(page, pageSize, status));

    [HttpPost("{id:guid}/resolve")]
    [RequirePermission("assignments.write")]
    public ActionResult<MobilePatrolAppealDto> Resolve(Guid id, ResolveMobilePatrolAppealDto request)
    {
        try
        {
            var actorId = Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var value) ? value : (Guid?)null;
            var result = service.ResolvePatrolAppeal(id, request, actorId, User.Identity?.Name ?? "Диспетчер");
            return result is null ? NotFound() : Ok(result);
        }
        catch (ArgumentException error) { return BadRequest(new { message = error.Message }); }
        catch (InvalidOperationException error) { return Conflict(new { message = error.Message }); }
    }
}
