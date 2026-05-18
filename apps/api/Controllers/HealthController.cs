using Microsoft.AspNetCore.Mvc;

namespace Patrol360.Api.Controllers;

[ApiController]
[Route("health")]
public sealed class HealthController : ControllerBase
{
    [HttpGet("live")]
    public IActionResult Live() => Ok(new { status = "live" });

    [HttpGet("ready")]
    public IActionResult Ready() => Ok(new { status = "ready" });
}
