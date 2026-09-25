using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Patrol360.Api.Authorization;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Api.Controllers;

[ApiController]
[Route("api/v2/mobile")]
[Authorize(Policy = MobileBearerAuthenticationHandler.PolicyName)]
public sealed class MobileV2Controller(IMobileAppService mobileAppService) : MobileApiControllerBase
{
    [HttpGet("work-items")]
    public ActionResult<IReadOnlyList<MobileWorkItemDto>> WorkItems()
    {
        return Ok(mobileAppService.GetWorkItemsV2(MobileAccessToken));
    }

    [HttpGet("work-items/page")]
    public ActionResult<MobileWorkItemPageDto> WorkItemsPage(
        string scope = "active", Guid? employeeId = null, string? cursor = null, int pageSize = 25)
    {
        try
        {
            var result = mobileAppService.GetWorkItemsPage(MobileAccessToken, scope, employeeId, cursor, pageSize);
            return result is null ? Unauthorized() : Ok(result);
        }
        catch (ArgumentException error) { return BadRequest(new { message = error.Message }); }
    }
}
