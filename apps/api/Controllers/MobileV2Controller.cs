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
}
