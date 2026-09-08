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
    IAuthenticatedSiteUserContext authenticatedUserContext) : ControllerBase
{
    [HttpGet]
    public ActionResult<IReadOnlyList<SystemNotificationDto>> List([FromQuery] int limit = 20)
    {
        var user = authenticatedUserContext.User;
        if (user is null)
        {
            return Unauthorized();
        }

        return Ok(systemNotificationService.GetNotifications(user, limit));
    }
}
