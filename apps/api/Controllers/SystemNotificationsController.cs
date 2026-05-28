using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;
using Patrol360.Api.Authorization;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Api.Controllers;

[ApiController]
[Route("api/v1/system-notifications")]
[RequirePermission("dashboard.read")]
public sealed class SystemNotificationsController(
    ISystemNotificationService systemNotificationService,
    IAuthSessionService authSessionService) : ControllerBase
{
    [HttpGet]
    public ActionResult<IReadOnlyList<SystemNotificationDto>> List([FromQuery] int limit = 20)
    {
        var token = ReadBearerToken(Request);
        var user = token is null ? null : authSessionService.GetCurrentUser(token);
        if (user is null)
        {
            return Unauthorized();
        }

        return Ok(systemNotificationService.GetNotifications(user, limit));
    }

    private static string? ReadBearerToken(HttpRequest request)
    {
        if (!request.Headers.TryGetValue(HeaderNames.Authorization, out var values))
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
