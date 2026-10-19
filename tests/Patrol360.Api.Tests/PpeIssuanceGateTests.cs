using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Patrol360.Api.Authorization;
using Patrol360.Api.Controllers;
using Patrol360.Contracts;
using System.Reflection;

namespace Patrol360.Api.Tests;

public sealed class PpeIssuanceGateTests
{
    [Theory]
    [InlineData(nameof(InventoryController.CreatePpeIssue))]
    [InlineData(nameof(InventoryController.CreatePpeIssueBatch))]
    [InlineData(nameof(InventoryController.AddPpeCardLine))]
    [InlineData(nameof(InventoryController.UpdatePpeCardLine))]
    public void LegacyWritersCannotBypassDisabledIssuance(string method)
    {
        var filter = typeof(InventoryController).GetMethod(method)!.GetCustomAttribute<PpeIssuanceEnabledAttribute>();
        Assert.NotNull(filter);
        var context = Context(null);
        filter.OnActionExecuting(context);
        Assert.Equal(409, Assert.IsType<ObjectResult>(context.Result).StatusCode);
    }

    [Fact]
    public void FlagAloneCannotEnableIssuanceWithoutAllReadyNorms()
    {
        var context = Context(null, true);
        new PpeIssuanceEnabledAttribute().OnActionExecuting(context);
        Assert.Equal(409, Assert.IsType<ObjectResult>(context.Result).StatusCode);
    }

    [Theory]
    [InlineData("issued", false)]
    [InlineData("partial", false)]
    [InlineData("returned", true)]
    [InlineData("written_off", true)]
    public void ExistingPositionsCanBeClosedButNotIssued(string status, bool allowed)
    {
        var context = Context(new UpdateInventoryStatusDto(status));
        new PpeIssuanceEnabledAttribute(true).OnActionExecuting(context);
        Assert.Equal(allowed, context.Result is null);
    }

    private static ActionExecutingContext Context(object? request, bool enabled = false)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Features:PpeIssueDocuments"] = enabled.ToString() }).Build();
        var services = new ServiceCollection().AddSingleton<IConfiguration>(configuration).BuildServiceProvider();
        var http = new DefaultHttpContext { RequestServices = services };
        return new(new ActionContext(http, new RouteData(), new ActionDescriptor()), [], new Dictionary<string, object?> { ["request"] = request }, new object());
    }
}
