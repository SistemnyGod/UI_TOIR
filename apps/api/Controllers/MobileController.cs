using Microsoft.Extensions.Configuration;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Patrol360.Api.Authorization;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Api.Controllers;

[ApiController]
[Route("api/v1/mobile")]
[Authorize(Policy = MobileBearerAuthenticationHandler.PolicyName)]
public sealed class MobileController(IMobileAppService mobileAppService, IConfiguration configuration) : MobileApiControllerBase
{
    [HttpGet("health")]
    [AllowAnonymous]
    public IActionResult Health() =>
        Ok(new
        {
            status = "ok",
            serverTime = DateTimeOffset.UtcNow,
            syncProtocolVersion = "1.0",
            contourId = MobileContourId
        });

    [HttpPost("auth/login")]
    [AllowAnonymous]
    [EnableRateLimiting("mobile-auth")]
    public ActionResult<MobileAuthSessionDto> Login(MobileLoginRequestDto request)
    {
        if (!IsExpectedContour(request.ContourId))
        {
            return Unauthorized(new { code = "wrong_contour" });
        }

        var result = mobileAppService.Login(request, GetIpAddress());
        if (result.Errors.Count > 0)
        {
            return MobileValidationProblem("Mobile login failed", result.Errors);
        }

        return result.Unauthorized
            ? Unauthorized(new { code = result.FailureCode ?? "invalid_credentials" })
            : Ok(result.Session);
    }

    [HttpPost("auth/refresh")]
    [AllowAnonymous]
    [EnableRateLimiting("mobile-auth")]
    public ActionResult<MobileAuthSessionDto> Refresh(MobileRefreshRequestDto request)
    {
        if (!IsExpectedContour(request.ContourId))
        {
            return Unauthorized(new { code = "wrong_contour" });
        }

        var result = mobileAppService.Refresh(request, GetIpAddress());
        if (result.Errors.Count > 0)
        {
            return MobileValidationProblem("Mobile refresh failed", result.Errors);
        }

        return result.Unauthorized
            ? Unauthorized(new { code = result.FailureCode ?? "device_reenrollment_required" })
            : Ok(result.Session);
    }

    [HttpPost("auth/logout")]
    public IActionResult Logout()
    {
        mobileAppService.Logout(MobileAccessToken);
        return NoContent();
    }

    [HttpGet("bootstrap")]
    public ActionResult<MobileBootstrapDto> Bootstrap()
    {
        var bootstrap = mobileAppService.GetBootstrap(MobileAccessToken);
        return bootstrap is null ? Unauthorized() : Ok(bootstrap);
    }

    [HttpPost("devices/push-token")]
    public ActionResult<MobileDeviceRegistrationDto> RegisterPushToken(MobilePushTokenRegistrationDto request)
    {
        var result = mobileAppService.RegisterPushToken(MobileAccessToken, request);
        return result is null ? Unauthorized() : Ok(result);
    }

    [HttpPost("diagnostics/daily")]
    [RequestSizeLimit(256 * 1024)]
    public ActionResult<MobileDiagnosticReportReceiptDto> SaveDiagnosticReport(MobileDiagnosticReportDto request)
    {
        try
        {
            var result = mobileAppService.SaveDiagnosticReport(MobileAccessToken, request);
            return result is null ? Unauthorized() : Ok(result);
        }
        catch (ArgumentException exception)
        {
            return BadRequest(exception.Message);
        }
    }

    [HttpGet("notifications")]
    public ActionResult<IReadOnlyList<MobileNotificationDto>> Notifications([FromQuery] bool unreadOnly = false)
    {
        return Ok(mobileAppService.GetNotifications(MobileAccessToken, unreadOnly));
    }

    [HttpPost("notifications/{notificationId:guid}/read")]
    public ActionResult<MobileNotificationDto> MarkNotificationRead(Guid notificationId)
    {
        var result = mobileAppService.MarkNotificationRead(MobileAccessToken, notificationId);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpGet("work-tasks")]
    [HttpGet("emu/tasks")]
    public ActionResult<IReadOnlyList<MobileWorkTaskDto>> WorkTasks()
    {
        return Ok(mobileAppService.GetWorkTasks(MobileAccessToken));
    }

    [HttpGet("work-tasks/{taskId:guid}")]
    [HttpGet("emu/tasks/{taskId:guid}")]
    public ActionResult<MobileWorkTaskDto> WorkTask(Guid taskId)
    {
        var result = mobileAppService.GetWorkTask(MobileAccessToken, taskId);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost("outbox")]
    [RequestSizeLimit(1024 * 1024)]
    public ActionResult<IReadOnlyList<MobileOutboxResponseDto>> Outbox(MobileOutboxBatchDto request)
    {
        if (!IsExpectedContour(request.ContourId))
        {
            return BadRequest(new { code = "wrong_contour" });
        }

        if (request.Commands is null || request.Commands.Count is < 1 or > 100)
        {
            return BadRequest("Outbox batch must contain from 1 to 100 commands.");
        }

        var result = mobileAppService.SaveOutbox(MobileAccessToken, request);
        return Ok(result);
    }

    [HttpPost("files")]
    [RequestSizeLimit(32 * 1024 * 1024)]
    public async Task<ActionResult<MobileFileUploadResponseDto>> UploadFile(
        [FromForm] string? contourId,
        [FromForm] string clientFileId,
        [FromForm] Guid? assignmentId,
        [FromForm] Guid? pointId,
        [FromForm] string? remarkId,
        [FromForm] Guid? workTaskId,
        [FromForm] string sha256,
        [FromForm] long sizeBytes,
        [FromForm] DateTimeOffset capturedAtLocal,
        [FromForm] IFormFile file)
    {
        if (!IsExpectedContour(contourId))
        {
            return BadRequest(new { code = "wrong_contour" });
        }

        if (file.Length == 0)
        {
            return BadRequest("File is empty.");
        }

        using var stream = file.OpenReadStream();
        var result = await mobileAppService.UploadFileAsync(
            MobileAccessToken,
            new MobileFileUploadCommand(
                clientFileId,
                assignmentId,
                pointId,
                remarkId,
                workTaskId,
                sha256,
                sizeBytes,
                capturedAtLocal,
                file.FileName,
                file.ContentType,
                stream),
            HttpContext.RequestAborted);

        return result is null ? Unauthorized() : Ok(result);
    }

    [HttpGet("outbox/{clientOperationId}")]
    public ActionResult<MobileOutboxResponseDto> OutboxResult(string clientOperationId)
    {
        var result = mobileAppService.GetOutboxResult(MobileAccessToken, clientOperationId);
        return result is null ? NotFound() : Ok(result);
    }

    private string MobileContourId => configuration["Patrol360:Mobile:ContourId"]
        ?? Environment.GetEnvironmentVariable("PATROL360_CONTOUR_ID")
        ?? "patrol360-local-enterprise";

    private bool IsExpectedContour(string? contourId) =>
        !string.IsNullOrWhiteSpace(contourId)
        && string.Equals(contourId.Trim(), MobileContourId, StringComparison.Ordinal);
    private string GetIpAddress() =>
        HttpContext.Connection.RemoteIpAddress?.ToString() ?? "-";

    private ActionResult MobileValidationProblem(string title, IReadOnlyDictionary<string, string[]> errors) =>
        ValidationProblem(new ValidationProblemDetails(errors.ToDictionary(item => item.Key, item => item.Value))
        {
            Title = title,
            Status = StatusCodes.Status400BadRequest,
        });
}
