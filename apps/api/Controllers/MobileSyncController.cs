using Microsoft.AspNetCore.Mvc;
using Patrol360.Api.Authorization;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Api.Controllers;

[ApiController]
[Route("api/v1/mobile-sync")]
public sealed class MobileSyncController(IMobileSyncAdminService syncAdminService) : ControllerBase
{
    [HttpGet("conflicts")]
    [RequirePermission("results.read")]
    public ActionResult<IReadOnlyList<MobileSyncConflictListItemDto>> Conflicts() =>
        Ok(syncAdminService.GetConflicts());

    [HttpGet("device-health")]
    [RequirePermission("results.read")]
    public ActionResult<IReadOnlyList<MobileDeviceHealthDto>> DeviceHealth() =>
        Ok(syncAdminService.GetDeviceHealth());

    [HttpGet("conflicts/{clientOperationId}")]
    [RequirePermission("results.read")]
    public ActionResult<MobileSyncConflictDetailDto> Conflict(string clientOperationId)
    {
        var conflict = syncAdminService.GetConflict(clientOperationId);
        return conflict is null ? NotFound() : Ok(conflict);
    }

    [HttpPost("conflicts/{clientOperationId}/resolution")]
    [RequirePermission("results.read")]
    public ActionResult<MobileSyncConflictResolutionDto> Resolve(
        string clientOperationId,
        MobileSyncConflictResolutionRequestDto request)
    {
        var result = syncAdminService.SetResolution(clientOperationId, request, User.Identity?.Name ?? "operator");
        return result is null ? NotFound() : Ok(result);
    }
}
