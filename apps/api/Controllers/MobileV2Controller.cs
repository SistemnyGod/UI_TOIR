using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Api.Controllers;

[ApiController]
[Route("api/v2/mobile")]
public sealed class MobileV2Controller(IMobileAppService mobileAppService) : ControllerBase
{
    [HttpGet("work-items")]
    public ActionResult<IReadOnlyList<MobileWorkItemDto>> WorkItems()
    {
        var token = ReadBearerToken();
        return token is null ? Unauthorized() : Ok(mobileAppService.GetWorkItemsV2(token));
    }

    private string? ReadBearerToken()
    {
        if (!Request.Headers.TryGetValue(HeaderNames.Authorization, out var values))
        {
            return null;
        }

        var value = values.ToString();
        const string bearerPrefix = "Bearer ";
        return value.StartsWith(bearerPrefix, StringComparison.OrdinalIgnoreCase)
            ? value[bearerPrefix.Length..].Trim()
            : null;
    }
}
