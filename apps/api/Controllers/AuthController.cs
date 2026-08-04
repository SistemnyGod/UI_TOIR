using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Net.Http.Headers;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Api.Controllers;

[ApiController]
[Route("api/v1/auth")]
public sealed class AuthController(IAuthSessionService authSessionService) : ControllerBase
{
    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting("web-auth")]
    public ActionResult<AuthSessionDto> Login(LoginRequestDto request)
    {
        var result = authSessionService.Login(request, ClientIp(), UserAgent());
        if (result.Errors.Count > 0)
        {
            return AuthValidationProblem(result.Errors);
        }

        if (result.Unauthorized)
        {
            return Unauthorized(new ProblemDetails
            {
                Title = "Unable to sign in",
                Detail = "Check the login and password.",
                Status = StatusCodes.Status401Unauthorized
            });
        }

        return Ok(result.Session);
    }

    [HttpGet("me")]
    [Authorize]
    public ActionResult<SessionUserDto> Me()
    {
        var token = ReadBearerToken();
        var user = token is null ? null : authSessionService.GetCurrentUser(token);
        return user is null ? Unauthorized() : Ok(user);
    }

    [HttpPost("change-password")]
    [Authorize]
    public ActionResult<AuthSessionDto> ChangePassword(ChangePasswordDto request)
    {
        var token = ReadBearerToken();
        var result = token is null
            ? new AuthChangePasswordResult(null, true, new Dictionary<string, string[]>())
            : authSessionService.ChangePassword(token, request);

        if (result.Errors.Count > 0)
        {
            return AuthValidationProblem(result.Errors);
        }

        return result.Unauthorized || result.Session is null
            ? Unauthorized()
            : Ok(result.Session);
    }

    [HttpPost("logout")]
    [Authorize]
    public IActionResult Logout()
    {
        var token = ReadBearerToken();
        if (token is not null)
        {
            authSessionService.Logout(token);
        }

        return NoContent();
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

    private string? ClientIp() => ControllerContext?.HttpContext?.Connection.RemoteIpAddress?.ToString();

    private string? UserAgent() => ControllerContext?.HttpContext?.Request.Headers.UserAgent.ToString();

    private ActionResult AuthValidationProblem(IReadOnlyDictionary<string, string[]> errors) =>
        ValidationProblem(new ValidationProblemDetails(errors.ToDictionary(item => item.Key, item => item.Value))
        {
            Title = "Authentication request was not completed",
            Detail = "Check the submitted fields.",
            Status = StatusCodes.Status400BadRequest
        });
}
