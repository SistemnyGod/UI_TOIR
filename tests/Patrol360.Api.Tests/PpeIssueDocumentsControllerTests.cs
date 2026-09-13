using System.Reflection;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Patrol360.Api.Authorization;
using Patrol360.Api.Controllers;

namespace Patrol360.Api.Tests;

public sealed class PpeIssueDocumentsControllerTests
{
    [Fact]
    public async Task DisabledFeatureDoesNotCallServices()
    {
        var controller = new PpeIssueDocumentsController(null!, null!, new ConfigurationBuilder().Build());
        Assert.IsType<NotFoundResult>(controller.List(null));
        Assert.IsType<NotFoundResult>(controller.Get(Guid.NewGuid()));
        Assert.IsType<NotFoundResult>(controller.Create(null!));
        Assert.IsType<NotFoundResult>(controller.Confirm(Guid.NewGuid(), null!));
        Assert.IsType<NotFoundResult>(await controller.Print(Guid.NewGuid()));
    }

    [Theory]
    [InlineData(nameof(PpeIssueDocumentsController.Scope))]
    [InlineData(nameof(PpeIssueDocumentsController.Rules))]
    [InlineData(nameof(PpeIssueDocumentsController.Approval))]
    public void AccountantCannotApproveNorms(string action)
    {
        var filter = typeof(PpeIssueDocumentsController).GetMethod(action)!.GetCustomAttribute<RequirePermissionAttribute>()!;
        var denied = Context("inventory.ppe.manage");
        filter.OnAuthorization(denied);
        Assert.Equal(403, Assert.IsType<ObjectResult>(denied.Result).StatusCode);
        var allowed = Context("inventory.ppe.norms.manage");
        filter.OnAuthorization(allowed);
        Assert.Null(allowed.Result);
    }

    [Fact]
    public void ReadPermissionDoesNotAllowConfirmation()
    {
        var filter = typeof(PpeIssueDocumentsController).GetMethod(nameof(PpeIssueDocumentsController.Confirm))!
            .GetCustomAttribute<RequirePermissionAttribute>()!;
        var context = Context("inventory.view");
        filter.OnAuthorization(context);
        Assert.Equal(403, Assert.IsType<ObjectResult>(context.Result).StatusCode);
    }

    private static AuthorizationFilterContext Context(string permission)
    {
        var http = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("permission", permission)], "test")) };
        return new(new ActionContext(http, new RouteData(), new ActionDescriptor()), []);
    }
}
