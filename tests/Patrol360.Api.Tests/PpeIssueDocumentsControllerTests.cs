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
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Api.Tests;

public sealed class PpeIssueDocumentsControllerTests
{
    [Fact]
    public void DisabledFeatureBlocksNewIssuance()
    {
        var controller = new PpeIssueDocumentsController(DispatchProxy.Create<IPpeIssueDocumentService, MissingDocumentService>(), null!, new ConfigurationBuilder().Build());
        Assert.IsType<ConflictObjectResult>(controller.Create(null!));
        Assert.IsType<ConflictObjectResult>(controller.Confirm(Guid.NewGuid(), null!));
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

    [Fact]
    public void JournalExportRequiresExportPermission()
    {
        var filter = typeof(PpeIssueDocumentsController).GetMethod(nameof(PpeIssueDocumentsController.ExportJournal))!
            .GetCustomAttribute<RequirePermissionAttribute>()!;
        var denied = Context("inventory.view"); filter.OnAuthorization(denied);
        Assert.Equal(403, Assert.IsType<ObjectResult>(denied.Result).StatusCode);
        var allowed = Context("inventory.reports.export"); filter.OnAuthorization(allowed);
        Assert.Null(allowed.Result);
    }

    private static AuthorizationFilterContext Context(string permission)
    {
        var http = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("permission", permission)], "test")) };
        return new(new ActionContext(http, new RouteData(), new ActionDescriptor()), []);
    }

    public class MissingDocumentService : DispatchProxy
    {
        protected override object? Invoke(MethodInfo? method, object?[]? args) =>
            method?.Name == nameof(IPpeIssueDocumentService.GetIssueDocument)
                ? new InventoryCommandResult<PpeIssueDocumentDto>(null, new Dictionary<string, string[]> { ["id"] = ["Not found"] })
                : throw new NotSupportedException(method?.Name);
    }
}
