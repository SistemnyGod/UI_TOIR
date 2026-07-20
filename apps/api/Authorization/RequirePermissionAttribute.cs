using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Patrol360.Api.Authorization;

[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class)]
public sealed class RequirePermissionAttribute(string permission) : Attribute, IAuthorizationFilter
{
    public void OnAuthorization(AuthorizationFilterContext context)
    {
        PermissionAuthorization.Apply(context, [permission]);
    }
}

[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class)]
public sealed class RequireAnyPermissionAttribute(params string[] permissions) : Attribute, IAuthorizationFilter
{
    public void OnAuthorization(AuthorizationFilterContext context)
    {
        PermissionAuthorization.Apply(context, permissions);
    }
}

internal static class PermissionAuthorization
{
    public static void Apply(AuthorizationFilterContext context, IReadOnlyList<string> permissions)
    {
        var principal = context.HttpContext.User;
        if (principal.Identity?.IsAuthenticated != true)
        {
            context.Result = new UnauthorizedObjectResult(new ProblemDetails
            {
                Title = "Требуется авторизация",
                Detail = "Передайте Bearer token активной сессии.",
                Status = StatusCodes.Status401Unauthorized
            });
            return;
        }

        var grantedPermissions = principal.FindAll("permission")
            .Select(claim => claim.Value)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (!permissions.Any(grantedPermissions.Contains))
        {
            var permissionList = string.Join(", ", permissions);
            context.Result = new ObjectResult(new ProblemDetails
            {
                Title = "Недостаточно прав",
                Detail = $"Для действия требуется одно из прав: {permissionList}.",
                Status = StatusCodes.Status403Forbidden
            })
            {
                StatusCode = StatusCodes.Status403Forbidden
            };
        }
    }

}
