using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Api.Controllers;

[ApiController]
[Route("api/v1/mobile")]
public sealed class MobileController(IMobileAppService mobileAppService) : ControllerBase
{
    [HttpGet("health")]
    public IActionResult Health() =>
        Ok(new
        {
            status = "ok",
            serverTime = DateTimeOffset.UtcNow,
            syncProtocolVersion = "1.0",
            request = new
            {
                host = Request.Host.Value,
                scheme = Request.Scheme,
                path = Request.Path.Value,
                remoteIp = GetIpAddress(),
                userAgent = Request.Headers.UserAgent.ToString(),
                mobileClient = Request.Headers.TryGetValue("X-Patrol360-Client", out var clientHeader)
                    ? clientHeader.ToString()
                    : null,
            },
        });

    [HttpPost("auth/login")]
    public ActionResult<MobileAuthSessionDto> Login(MobileLoginRequestDto request)
    {
        var result = mobileAppService.Login(request, GetIpAddress());
        if (result.Errors.Count > 0)
        {
            return MobileValidationProblem("Mobile login failed", result.Errors);
        }

        return result.Unauthorized ? Unauthorized() : Ok(result.Session);
    }

    [HttpPost("auth/refresh")]
    public ActionResult<MobileAuthSessionDto> Refresh(MobileRefreshRequestDto request)
    {
        var result = mobileAppService.Refresh(request, GetIpAddress());
        if (result.Errors.Count > 0)
        {
            return MobileValidationProblem("Mobile refresh failed", result.Errors);
        }

        return result.Unauthorized ? Unauthorized() : Ok(result.Session);
    }

    [HttpPost("auth/logout")]
    public IActionResult Logout()
    {
        var token = ReadBearerToken();
        if (token is not null)
        {
            mobileAppService.Logout(token);
        }

        return NoContent();
    }

    [HttpGet("bootstrap")]
    public ActionResult<MobileBootstrapDto> Bootstrap()
    {
        var token = ReadBearerToken();
        if (token is null)
        {
            return Unauthorized();
        }

        var bootstrap = mobileAppService.GetBootstrap(token);
        return bootstrap is null ? Unauthorized() : Ok(bootstrap);
    }

    [HttpPost("devices/push-token")]
    public ActionResult<MobileDeviceRegistrationDto> RegisterPushToken(MobilePushTokenRegistrationDto request)
    {
        var token = ReadBearerToken();
        if (token is null)
        {
            return Unauthorized();
        }

        var result = mobileAppService.RegisterPushToken(token, request);
        return result is null ? Unauthorized() : Ok(result);
    }

    [HttpGet("notifications")]
    public ActionResult<IReadOnlyList<MobileNotificationDto>> Notifications([FromQuery] bool unreadOnly = false)
    {
        var token = ReadBearerToken();
        if (token is null)
        {
            return Unauthorized();
        }

        return Ok(mobileAppService.GetNotifications(token, unreadOnly));
    }

    [HttpPost("notifications/{notificationId:guid}/read")]
    public ActionResult<MobileNotificationDto> MarkNotificationRead(Guid notificationId)
    {
        var token = ReadBearerToken();
        if (token is null)
        {
            return Unauthorized();
        }

        var result = mobileAppService.MarkNotificationRead(token, notificationId);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpGet("work-tasks")]
    [HttpGet("emu/tasks")]
    public ActionResult<IReadOnlyList<MobileWorkTaskDto>> WorkTasks()
    {
        var token = ReadBearerToken();
        if (token is null)
        {
            return Unauthorized();
        }

        return Ok(mobileAppService.GetWorkTasks(token));
    }

    [HttpGet("work-tasks/{taskId:guid}")]
    [HttpGet("emu/tasks/{taskId:guid}")]
    public ActionResult<MobileWorkTaskDto> WorkTask(Guid taskId)
    {
        var token = ReadBearerToken();
        if (token is null)
        {
            return Unauthorized();
        }

        var result = mobileAppService.GetWorkTask(token, taskId);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost("outbox")]
    public ActionResult<IReadOnlyList<MobileOutboxResponseDto>> Outbox(MobileOutboxBatchDto request)
    {
        var token = ReadBearerToken();
        if (token is null)
        {
            return Unauthorized();
        }

        var result = mobileAppService.SaveOutbox(token, request);
        return result.Count == 0 ? Unauthorized() : Ok(result);
    }

    [HttpPost("files")]
    [RequestSizeLimit(32 * 1024 * 1024)]
    public ActionResult<MobileFileUploadResponseDto> UploadFile(
        [FromForm] string clientFileId,
        [FromForm] Guid? assignmentId,
        [FromForm] Guid? pointId,
        [FromForm] string? remarkId,
        [FromForm] string sha256,
        [FromForm] long sizeBytes,
        [FromForm] DateTimeOffset capturedAtLocal,
        [FromForm] IFormFile file)
    {
        var token = ReadBearerToken();
        if (token is null)
        {
            return Unauthorized();
        }

        if (file.Length == 0)
        {
            return BadRequest("File is empty.");
        }

        using var stream = file.OpenReadStream();
        var result = mobileAppService.UploadFile(
            token,
            new MobileFileUploadCommand(
                clientFileId,
                assignmentId,
                pointId,
                remarkId,
                sha256,
                sizeBytes,
                capturedAtLocal,
                file.FileName,
                file.ContentType,
                stream));

        return result is null ? Unauthorized() : Ok(result);
    }

    [HttpGet("outbox/{clientOperationId}")]
    public ActionResult<MobileOutboxResponseDto> OutboxResult(string clientOperationId)
    {
        var token = ReadBearerToken();
        if (token is null)
        {
            return Unauthorized();
        }

        var result = mobileAppService.GetOutboxResult(token, clientOperationId);
        return result is null ? NotFound() : Ok(result);
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

    private string GetIpAddress() =>
        HttpContext.Connection.RemoteIpAddress?.ToString() ?? "-";

    private ActionResult MobileValidationProblem(string title, IReadOnlyDictionary<string, string[]> errors) =>
        ValidationProblem(new ValidationProblemDetails(errors.ToDictionary(item => item.Key, item => item.Value))
        {
            Title = title,
            Status = StatusCodes.Status400BadRequest,
        });
}
