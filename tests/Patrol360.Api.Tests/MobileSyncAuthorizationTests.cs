using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using Patrol360.Api.Controllers;

namespace Patrol360.Api.Tests;

public sealed class MobileSyncAuthorizationTests
{
    [Theory]
    [InlineData("results.read", false)]
    [InlineData("mobile_accounts.write", true)]
    public void ConflictResolutionRequiresWritePermission(string permission, bool allowed)
    {
        var method = typeof(MobileSyncController).GetMethod(nameof(MobileSyncController.Resolve))!;
        var context = new AuthorizationFilterContext(new ActionContext(new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("permission", permission)], "test"))
        }, new RouteData(), new ActionDescriptor()), []);
        foreach (var filter in method.GetCustomAttributes(true).OfType<IAuthorizationFilter>()) filter.OnAuthorization(context);
        Assert.Equal(allowed, context.Result is null);
        if (!allowed) Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(context.Result).StatusCode);
    }
}
