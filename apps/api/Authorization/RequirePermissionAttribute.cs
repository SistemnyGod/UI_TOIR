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
                Title = "РўСЂРµР±СѓРµС‚СЃСЏ Р°РІС‚РѕСЂРёР·Р°С†РёСЏ",
                Detail = "РџРµСЂРµРґР°Р№С‚Рµ Bearer token Р°РєС‚РёРІРЅРѕР№ СЃРµСЃСЃРёРё.",
                Status = StatusCodes.Status401Unauthorized
            });
            return;
        }

        if (principal.HasClaim("require_password_change", "true"))
        {
            context.Result = new ObjectResult(new ProblemDetails
            {
                Title = "Password change required",
                Detail = "Change the temporary password before using the application.",
                Status = StatusCodes.Status403Forbidden
            })
            {
                StatusCode = StatusCodes.Status403Forbidden
            };
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
                Title = "РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РїСЂР°РІ",
                Detail = $"Р”Р»СЏ РґРµР№СЃС‚РІРёСЏ С‚СЂРµР±СѓРµС‚СЃСЏ РѕРґРЅРѕ РёР· РїСЂР°РІ: {permissionList}.",
                Status = StatusCodes.Status403Forbidden
            })
            {
                StatusCode = StatusCodes.Status403Forbidden
            };
        }
    }

}
