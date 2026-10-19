using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.Infrastructure;
using Microsoft.AspNetCore.Routing;
using Patrol360.Api.Controllers;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Api.Tests;

public sealed class PatrolLateReportsControllerTests
{
    [Theory]
    [InlineData(nameof(PatrolLateReportsController.List), "requests.read", true)]
    [InlineData(nameof(PatrolLateReportsController.List), "results.read", false)]
    [InlineData(nameof(PatrolLateReportsController.Resolve), "requests.read", false)]
    [InlineData(nameof(PatrolLateReportsController.Resolve), "assignments.write", true)]
    public void EndpointsRequireDispatcherPermissions(string action, string permission, bool allowed)
    {
        var method = typeof(PatrolLateReportsController).GetMethod(action)!;
        var context = new AuthorizationFilterContext(new ActionContext(new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("permission", permission)], "test"))
        }, new RouteData(), new ActionDescriptor()), []);
        foreach (var filter in method.GetCustomAttributes(true).OfType<IAuthorizationFilter>()) filter.OnAuthorization(context);
        Assert.Equal(allowed, context.Result is null);
    }

    [Theory]
    [InlineData(null, StatusCodes.Status200OK)]
    [InlineData("notFound", StatusCodes.Status404NotFound)]
    [InlineData("invalidDecision", StatusCodes.Status400BadRequest)]
    [InlineData("assignmentHasReport", StatusCodes.Status409Conflict)]
    [InlineData("alreadyResolved", StatusCodes.Status409Conflict)]
    public void ResolutionErrorsMapToHttpStatus(string? errorCode, int expectedStatus)
    {
        var controller = new PatrolLateReportsController(new FakeLateReports(errorCode))
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
        var result = controller.Resolve(Guid.NewGuid(), new PatrolLateReportResolutionRequestDto("apply", null)).Result;
        Assert.Equal(expectedStatus, Assert.IsAssignableFrom<IStatusCodeActionResult>(result).StatusCode);
    }

    private sealed class FakeLateReports(string? errorCode) : IPatrolLateReportService
    {
        public IReadOnlyList<PatrolLateReportDto> GetLateReports(string? status, int limit) => [];

        public PatrolLateReportResolutionResult ResolveLateReport(Guid lateReportId, PatrolLateReportResolutionRequestDto request, string actor) =>
            errorCode is null
                ? new(new PatrolLateReportDto(lateReportId, Guid.NewGuid(), Guid.NewGuid(), "Route", "Employee", "login", "assignmentClosed",
                    "Завершено", "Завершено", "auto", DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, "applied", 1, 0, 0, 0, false, "", actor, DateTimeOffset.UtcNow, null), null, null)
                : new(null, errorCode, "error");
    }
}
