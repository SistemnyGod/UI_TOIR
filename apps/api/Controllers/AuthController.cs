using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Api.Controllers;

[ApiController]
[Route("api/v1/auth")]
public sealed class AuthController(IAuthSessionService authSessionService) : ControllerBase
{
    [HttpPost("login")]
    public ActionResult<AuthSessionDto> Login(LoginRequestDto request)
    {
        var result = authSessionService.Login(request);
        if (result.Errors.Count > 0)
        {
            return AuthValidationProblem(result.Errors);
        }

        if (result.Unauthorized)
        {
            return Unauthorized(new ProblemDetails
            {
                Title = "Не удалось войти",
                Detail = "Проверьте логин и пароль.",
                Status = StatusCodes.Status401Unauthorized
            });
        }

        return Ok(result.Session);
    }

    [HttpGet("me")]
    public ActionResult<SessionUserDto> Me()
    {
        var token = ReadBearerToken();
        var user = token is null ? null : authSessionService.GetCurrentUser(token);
        return user is null ? Unauthorized() : Ok(user);
    }

    [HttpPost("logout")]
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

    private ActionResult AuthValidationProblem(IReadOnlyDictionary<string, string[]> errors) =>
        ValidationProblem(new ValidationProblemDetails(errors.ToDictionary(item => item.Key, item => item.Value))
        {
            Title = "Вход не выполнен",
            Detail = "Заполните логин и пароль.",
            Status = StatusCodes.Status400BadRequest
        });
}
