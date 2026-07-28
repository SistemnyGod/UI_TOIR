using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Patrol360.Api.Services;

namespace Patrol360.Api.Controllers;

[ApiController]
[AllowAnonymous]
[Route("health")]
public sealed class HealthController(IApplicationReadinessProbe readinessProbe) : ControllerBase
{
    [HttpGet("live")]
    public IActionResult Live() => Ok(new { status = "live" });

    [HttpGet("ready")]
    public async Task<IActionResult> Ready(CancellationToken cancellationToken)
    {
        var readiness = await readinessProbe.CheckAsync(cancellationToken);
        return readiness.IsReady
            ? Ok(new { status = "ready" })
            : StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                status = "unready",
                dependency = readiness.Dependency
            });
    }
}
