using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Net.Http.Headers;
using Patrol360.Application;

namespace Patrol360.Api.Authorization;

[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class)]
public sealed class RequirePermissionAttribute(string permission) : Attribute, IAuthorizationFilter
{
    public void OnAuthorization(AuthorizationFilterContext context)
    {
        var token = ReadBearerToken(context.HttpContext.Request);
        if (token is null)
        {
            context.Result = new UnauthorizedObjectResult(new ProblemDetails
            {
                Title = "Требуется авторизация",
                Detail = "Передайте Bearer token активной сессии.",
                Status = StatusCodes.Status401Unauthorized
            });
            return;
        }

        var authSessionService = context.HttpContext.RequestServices.GetRequiredService<IAuthSessionService>();
        var user = authSessionService.GetCurrentUser(token);
        if (user is null)
        {
            context.Result = new UnauthorizedObjectResult(new ProblemDetails
            {
                Title = "Сессия недействительна",
                Detail = "Войдите в систему повторно.",
                Status = StatusCodes.Status401Unauthorized
            });
            return;
        }

        if (!user.Permissions.Contains(permission, StringComparer.OrdinalIgnoreCase))
        {
            context.Result = new ObjectResult(new ProblemDetails
            {
                Title = "Недостаточно прав",
                Detail = $"Для действия требуется право {permission}.",
                Status = StatusCodes.Status403Forbidden
            })
            {
                StatusCode = StatusCodes.Status403Forbidden
            };
        }
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
