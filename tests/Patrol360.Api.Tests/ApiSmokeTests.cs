using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Mvc.Routing;
using Microsoft.Extensions.DependencyInjection;
using Patrol360.Api.Authorization;
using Patrol360.Api.Controllers;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Api.Tests;

public class ApiSmokeTests
{
    [Fact]
    public void ApiAssemblyContainsHealthController()
    {
        var assembly = typeof(HealthController).Assembly;

        Assert.Equal("Patrol360.Api", assembly.GetName().Name);
        Assert.Contains(assembly.GetTypes(), type => type == typeof(HealthController));
    }

    [Fact]
    public void AuthControllerLoginReturnsSessionWhenServiceSucceeds()
    {
        var user = new SessionUserDto(Guid.NewGuid(), "admin", "Administrator", ["admin"], ["mobile_accounts.write"]);
        var session = new AuthSessionDto(user, "token-1", DateTimeOffset.UtcNow.AddHours(8));
        var controller = new AuthController(new FakeAuthSessionService(
            loginResult: new AuthLoginResult(session, false, new Dictionary<string, string[]>())));

        var result = controller.Login(new LoginRequestDto("admin", "Patrol360!"));

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Same(session, ok.Value);
    }

    [Fact]
    public void AuthControllerLoginReturnsUnauthorizedWhenServiceRejectsCredentials()
    {
        var controller = new AuthController(new FakeAuthSessionService(
            loginResult: new AuthLoginResult(null, true, new Dictionary<string, string[]>())));

        var result = controller.Login(new LoginRequestDto("admin", "wrong"));

        Assert.IsType<UnauthorizedObjectResult>(result.Result);
    }

    [Fact]
    public void AuthControllerLoginUsesWebAuthRateLimitPolicy()
    {
        var method = typeof(AuthController).GetMethod(nameof(AuthController.Login));

        Assert.NotNull(method);
        var attribute = Assert.Single(method.GetCustomAttributes(typeof(EnableRateLimitingAttribute), inherit: true));
        Assert.Equal("web-auth", Assert.IsType<EnableRateLimitingAttribute>(attribute).PolicyName);
    }

    [Fact]
    public void EveryApiEndpointHasExplicitAuthenticationClassification()
    {
        var explicitlyAnonymousEndpoints = new HashSet<string>(StringComparer.Ordinal)
        {
            "AuthController.Login",
            "HealthController.Live",
            "HealthController.Ready",
            "MobileController.Bootstrap",
            "MobileController.Health",
            "MobileController.Login",
            "MobileController.Logout",
            "MobileController.MarkNotificationRead",
            "MobileController.Notifications",
            "MobileController.Outbox",
            "MobileController.OutboxResult",
            "MobileController.RegisterPushToken",
            "MobileController.Refresh",
            "MobileController.SaveDiagnosticReport",
            "MobileController.UploadFile",
            "MobileController.WorkTask",
            "MobileController.WorkTasks",
            "MobileV2Controller.WorkItems",
        };

        var endpoints = typeof(AuthController).Assembly
            .GetTypes()
            .Where(type => !type.IsAbstract && typeof(ControllerBase).IsAssignableFrom(type))
            .SelectMany(type => type
                .GetMethods()
                .Where(method => method.DeclaringType == type)
                .Where(method => method.GetCustomAttributes(inherit: true).OfType<HttpMethodAttribute>().Any())
                .Select(method => new { Controller = type, Method = method }))
            .ToArray();

        var endpointsWithoutExplicitClassification = endpoints
            .Where(endpoint => !HasAuthenticationMetadata(endpoint.Controller, endpoint.Method))
            .Select(endpoint => $"{endpoint.Controller.Name}.{endpoint.Method.Name}")
            .Order(StringComparer.Ordinal)
            .ToArray();
        var actualAnonymousEndpoints = endpoints
            .Where(endpoint => HasAllowAnonymousMetadata(endpoint.Controller, endpoint.Method))
            .Select(endpoint => $"{endpoint.Controller.Name}.{endpoint.Method.Name}")
            .Order(StringComparer.Ordinal)
            .ToArray();

        Assert.Empty(endpointsWithoutExplicitClassification);
        Assert.Equal(explicitlyAnonymousEndpoints.Order(StringComparer.Ordinal), actualAnonymousEndpoints);
    }

    [Fact]
    public async Task SiteBearerAuthenticationBuildsPrincipalFromActiveSession()
    {
        var user = new SessionUserDto(Guid.NewGuid(), "operator", "Operator", ["operator"], ["dashboard.read"]);
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IAuthSessionService>(new FakeAuthSessionService(currentUser: user));
        services
            .AddAuthentication(SiteBearerAuthenticationHandler.SchemeName)
            .AddScheme<AuthenticationSchemeOptions, SiteBearerAuthenticationHandler>(
                SiteBearerAuthenticationHandler.SchemeName,
                _ => { });

        await using var provider = services.BuildServiceProvider();
        var context = new DefaultHttpContext { RequestServices = provider };
        context.Request.Headers.Authorization = "Bearer token-1";

        var result = await context.AuthenticateAsync(SiteBearerAuthenticationHandler.SchemeName);

        Assert.True(result.Succeeded);
        Assert.Equal(user.Id.ToString(), result.Principal!.FindFirstValue(ClaimTypes.NameIdentifier));
        Assert.True(result.Principal.HasClaim("permission", "dashboard.read"));
    }

    [Fact]
    public void RequirePermissionReturnsUnauthorizedWhenBearerTokenIsMissing()
    {
        var context = CreateAuthorizationContext(new FakeAuthSessionService());
        var attribute = new RequirePermissionAttribute("site_users.write");

        attribute.OnAuthorization(context);

        Assert.IsType<UnauthorizedObjectResult>(context.Result);
    }

    [Fact]
    public void RequirePermissionReturnsForbiddenWhenUserLacksPermission()
    {
        var user = new SessionUserDto(Guid.NewGuid(), "viewer", "Viewer", ["auditor"], ["dashboard.read"]);
        var context = CreateAuthorizationContext(new FakeAuthSessionService(currentUser: user), "token-1");
        var attribute = new RequirePermissionAttribute("site_users.write");

        attribute.OnAuthorization(context);

        var result = Assert.IsType<ObjectResult>(context.Result);
        Assert.Equal(StatusCodes.Status403Forbidden, result.StatusCode);
    }

    [Fact]
    public void RequirePermissionAllowsUserWithPermission()
    {
        var user = new SessionUserDto(Guid.NewGuid(), "admin", "Administrator", ["admin"], ["site_users.write"]);
        var context = CreateAuthorizationContext(new FakeAuthSessionService(currentUser: user), "token-1");
        var attribute = new RequirePermissionAttribute("site_users.write");

        attribute.OnAuthorization(context);

        Assert.Null(context.Result);
    }

    [Fact]
    public void RequireAnyPermissionAllowsUserWithOneMatchingPermission()
    {
        var user = new SessionUserDto(Guid.NewGuid(), "emu", "EMU", ["emu_operator"], ["emu.completed.delete"]);
        var context = CreateAuthorizationContext(new FakeAuthSessionService(currentUser: user), "token-1");
        var attribute = new RequireAnyPermissionAttribute("emu.work.delete", "emu.completed.delete");

        attribute.OnAuthorization(context);

        Assert.Null(context.Result);
    }

    [Fact]
    public void RequireAnyPermissionReturnsForbiddenWhenUserLacksAllPermissions()
    {
        var user = new SessionUserDto(Guid.NewGuid(), "emu", "EMU", ["emu_operator"], ["emu.work-accounting.view"]);
        var context = CreateAuthorizationContext(new FakeAuthSessionService(currentUser: user), "token-1");
        var attribute = new RequireAnyPermissionAttribute("emu.work.delete", "emu.completed.delete");

        attribute.OnAuthorization(context);

        var result = Assert.IsType<ObjectResult>(context.Result);
        Assert.Equal(StatusCodes.Status403Forbidden, result.StatusCode);
    }

    [Fact]
    public void EmuWorkSessionsRejectsDeletedRowsForBaseOperator()
    {
        var workService = new FakeEmuWorkService();
        var user = new SessionUserDto(Guid.NewGuid(), "emu", "EMU", ["emu_operator"], ["emu.view", "emu.work-accounting.view"]);
        var controller = CreateEmuController(workService, user);

        var result = controller.WorkSessions(includeDeleted: true);

        var forbidden = Assert.IsType<ObjectResult>(result.Result);
        Assert.Equal(StatusCodes.Status403Forbidden, forbidden.StatusCode);
        Assert.Null(workService.LastQuery);
    }

    [Fact]
    public void EmuWorkSessionsRequiresHistoryPermissionForCompletedHistory()
    {
        var workService = new FakeEmuWorkService();
        var user = new SessionUserDto(Guid.NewGuid(), "emu", "EMU", ["emu_operator"], ["emu.view", "emu.work-accounting.view"]);
        var controller = CreateEmuController(workService, user);

        var result = controller.WorkSessions(operationalStatus: "Завершено");

        var forbidden = Assert.IsType<ObjectResult>(result.Result);
        Assert.Equal(StatusCodes.Status403Forbidden, forbidden.StatusCode);
        Assert.Null(workService.LastQuery);
    }

    [Fact]
    public void EmuWorkSessionsAllowsCompletedHistoryWithHistoryPermission()
    {
        var workService = new FakeEmuWorkService();
        var user = new SessionUserDto(Guid.NewGuid(), "emu", "EMU", ["emu_operator"], ["emu.view", "emu.history.view"]);
        var controller = CreateEmuController(workService, user);
        var waitReasonId = Guid.NewGuid();
        var notCompletedReasonId = Guid.NewGuid();

        var result = controller.WorkSessions(
            waitReasonId: waitReasonId,
            notCompletedReasonId: notCompletedReasonId,
            operationalStatus: "Завершено",
            resultStatus: "Выполнено",
            shiftType: "night",
            employeeSearch: "fitter",
            problemOnly: true,
            manualCorrectionsOnly: true,
            sortBy: "section");

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.IsType<EmuListResponseDto<EmuWorkSessionDto>>(ok.Value);
        Assert.NotNull(workService.LastQuery);
        Assert.Equal(user.Id, workService.LastQuery!.CreatedByUserId);
        Assert.Equal(waitReasonId, workService.LastQuery!.WaitReasonId);
        Assert.Equal(notCompletedReasonId, workService.LastQuery.NotCompletedReasonId);
        Assert.Equal("Завершено", workService.LastQuery!.OperationalStatus);
        Assert.Equal("Выполнено", workService.LastQuery.ResultStatus);
        Assert.Equal("night", workService.LastQuery.ShiftType);
        Assert.Equal("fitter", workService.LastQuery.EmployeeSearch);
        Assert.True(workService.LastQuery.ProblemOnly);
        Assert.True(workService.LastQuery.ManualCorrectionsOnly);
        Assert.Equal("section", workService.LastQuery.SortBy);
    }

    [Fact]
    public void EmuCreateWorkSessionRejectsSectionOutsideActorScopes()
    {
        var workService = new FakeEmuWorkService();
        var user = new SessionUserDto(Guid.NewGuid(), "emu", "EMU", ["emu_operator"], ["emu.view", "emu.work.create"]);
        var controller = CreateEmuController(workService, user);

        var result = controller.CreateWorkSession(new EmuCreateWorkSessionDto(
            WorkDate: new DateOnly(2026, 6, 15),
            SectionId: Guid.NewGuid(),
            ArrivedAt: null,
            EmployeeIds: [],
            TaskDescription: "Scoped work"));

        var forbidden = Assert.IsType<ObjectResult>(result.Result);
        Assert.Equal(StatusCodes.Status403Forbidden, forbidden.StatusCode);
        Assert.Null(workService.CreatedRequest);
    }

    [Fact]
    public void EmuWorkSessionsExportRequiresExportPermissionAttribute()
    {
        AssertEndpointPermission(typeof(EmuController), nameof(EmuController.ExportWorkSessions), "emu.reports.export");
    }

    [Fact]
    public void EmuWorkSessionsExportReturnsCsvWithCurrentFilters()
    {
        var workService = new FakeEmuWorkService();
        var user = new SessionUserDto(Guid.NewGuid(), "emu", "EMU", ["emu_manager"], ["emu.view", "emu.reports.export", "emu.scope.all"]);
        var controller = CreateEmuController(workService, user);
        var dateFrom = new DateOnly(2026, 6, 1);
        var waitReasonId = Guid.NewGuid();

        var result = controller.ExportWorkSessions(dateFrom: dateFrom, waitReasonId: waitReasonId, operationalStatus: "Завершено", resultStatus: "Выполнено", shiftType: "day", employeeSearch: "master", problemOnly: true, sortBy: "waiting");

        var file = Assert.IsType<FileContentResult>(result);
        Assert.Equal("text/csv; charset=utf-8", file.ContentType);
        Assert.StartsWith("emu-history-", file.FileDownloadName);
        Assert.NotEmpty(file.FileContents);
        Assert.NotNull(workService.LastQuery);
        Assert.Null(workService.LastQuery!.CreatedByUserId);
        Assert.Equal(dateFrom, workService.LastQuery!.DateFrom);
        Assert.Equal(waitReasonId, workService.LastQuery.WaitReasonId);
        Assert.Equal("Завершено", workService.LastQuery.OperationalStatus);
        Assert.Equal("Выполнено", workService.LastQuery.ResultStatus);
        Assert.Equal("day", workService.LastQuery.ShiftType);
        Assert.Equal("master", workService.LastQuery.EmployeeSearch);
        Assert.True(workService.LastQuery.ProblemOnly);
        Assert.Equal("waiting", workService.LastQuery.SortBy);
    }

    [Fact]
    public void EmuWorkSessionsExportRejectsDeletedRowsWithoutAuditPermission()
    {
        var workService = new FakeEmuWorkService();
        var user = new SessionUserDto(Guid.NewGuid(), "emu", "EMU", ["emu_manager"], ["emu.view", "emu.reports.export"]);
        var controller = CreateEmuController(workService, user);

        var result = controller.ExportWorkSessions(includeDeleted: true);

        var forbidden = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, forbidden.StatusCode);
        Assert.Null(workService.LastQuery);
    }

    [Fact]
    public void EmuEmployeeWorkHistoryReportUsesEmployeeAndFilters()
    {
        var workService = new FakeEmuWorkService();
        var user = new SessionUserDto(Guid.NewGuid(), "emu", "EMU", ["emu_manager"], ["emu.view", "emu.history.view"]);
        var controller = CreateEmuController(workService, user);
        var employeeId = Guid.NewGuid();
        var sectionId = Guid.NewGuid();

        var result = controller.EmployeeWorkHistoryReport(
            employeeId,
            dateFrom: new DateOnly(2026, 6, 1),
            sectionId: sectionId,
            shiftType: "night",
            page: 2,
            pageSize: 25);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.IsType<EmuEmployeeWorkHistoryReportDto>(ok.Value);
        Assert.NotNull(workService.LastEmployeeReportQuery);
        Assert.Equal(employeeId, workService.LastEmployeeReportId);
        Assert.Equal(employeeId, workService.LastEmployeeReportQuery!.EmployeeId);
        Assert.Equal(sectionId, workService.LastEmployeeReportQuery.SectionId);
        Assert.Equal("night", workService.LastEmployeeReportQuery.ShiftType);
        Assert.Equal(2, workService.LastEmployeeReportQuery.Page);
        Assert.Equal(25, workService.LastEmployeeReportQuery.PageSize);
    }

    [Fact]
    public void PatrolReadEndpointsRequireReadPermissions()
    {
        AssertEndpointPermission(typeof(DashboardController), nameof(DashboardController.Summary), "dashboard.read");
        AssertEndpointPermission(typeof(DashboardController), nameof(DashboardController.ActiveAssignments), "dashboard.read");
        AssertEndpointPermission(typeof(RoutesController), nameof(RoutesController.List), "routes.read");
        AssertEndpointPermission(typeof(RoutesController), nameof(RoutesController.Get), "routes.read");
        AssertEndpointPermission(typeof(EmployeesController), nameof(EmployeesController.List), "employees.read");
        AssertEndpointPermission(typeof(EmployeesController), nameof(EmployeesController.Get), "employees.read");
        AssertEndpointPermission(typeof(PatrolRequestsController), nameof(PatrolRequestsController.List), "requests.read");
        AssertEndpointPermission(typeof(AssignmentsController), nameof(AssignmentsController.List), "assignments.read");
        AssertEndpointPermission(typeof(ResultsController), nameof(ResultsController.List), "results.read");
        AssertEndpointPermission(typeof(ResultsController), nameof(ResultsController.Get), "results.read");
    }

    [Fact]
    public void PercoIntegrationEndpointsRequireExpectedPermissions()
    {
        AssertEndpointPermission(typeof(PercoIntegrationController), nameof(PercoIntegrationController.GetSettings), "integrations.perco.view");
        AssertEndpointPermission(typeof(PercoIntegrationController), nameof(PercoIntegrationController.UpdateSettings), "integrations.perco.manage");
        AssertEndpointPermission(typeof(PercoIntegrationController), nameof(PercoIntegrationController.TestConnection), "integrations.perco.manage");
        AssertEndpointPermission(typeof(PercoIntegrationController), nameof(PercoIntegrationController.SyncEmployees), "integrations.perco.sync");
        AssertEndpointPermission(typeof(PercoIntegrationController), nameof(PercoIntegrationController.SyncEvents), "integrations.perco.sync");
        AssertEndpointPermission(typeof(PercoIntegrationController), nameof(PercoIntegrationController.GetUnmatchedEmployees), "integrations.perco.match");
        AssertEndpointPermission(typeof(PercoIntegrationController), nameof(PercoIntegrationController.MatchEmployee), "integrations.perco.match");
        AssertEndpointPermission(typeof(PercoIntegrationController), nameof(PercoIntegrationController.GetLogs), "integrations.perco.logs.view");
        AssertEndpointPermission(typeof(PercoIntegrationController), nameof(PercoIntegrationController.GetDiagnostics), "integrations.perco.view");
    }

    [Fact]
    public void SiteUsersControllerCreateReturnsCreatedUserWhenServiceSucceeds()
    {
        var user = new SiteUserDto(
            Guid.NewGuid(),
            "operator",
            "Operator",
            ["operator"],
              "active",
              DateTimeOffset.UtcNow,
              null,
              ["dashboard.read"],
              []);
        var created = new SiteUserCreatedDto(user, "Patrol-123456!");
        var controller = new SiteUsersController(new FakeSiteUserAdminService(
            createResult: new CreateSiteUserResult(created, new Dictionary<string, string[]>())));

        var result = controller.Create(new CreateSiteUserDto("operator", "Operator", ["operator"], "active", "Password1"));

        var objectResult = Assert.IsType<CreatedAtActionResult>(result.Result);
        Assert.Same(created, objectResult.Value);
    }

    [Fact]
    public void SiteUsersControllerCreateReturnsValidationProblemWhenServiceFails()
    {
        var controller = new SiteUsersController(new FakeSiteUserAdminService(
            createResult: new CreateSiteUserResult(null, new Dictionary<string, string[]>
            {
                ["login"] = ["Login is required"],
            })));

        var result = controller.Create(new CreateSiteUserDto("", "", [], "active"));

        var objectResult = Assert.IsAssignableFrom<ObjectResult>(result.Result);
        var problem = Assert.IsType<ValidationProblemDetails>(objectResult.Value);
        Assert.Equal(400, objectResult.StatusCode);
        Assert.Contains("login", problem.Errors.Keys);
    }

    [Fact]
    public void SiteUsersControllerUpdateScopesReturnsValidationProblemWhenServiceFails()
    {
        var controller = new SiteUsersController(new FakeSiteUserAdminService(
            scopesResult: new UpdateSiteUserScopesResult(null, new Dictionary<string, string[]>
            {
                ["scopes"] = ["Invalid EMU section"],
            })));

        var result = controller.UpdateScopes(Guid.NewGuid(), new UpdateSiteUserScopesDto(
        [
            new SiteUserAccessScopeUpsertDto("emu", "section", Guid.Empty),
        ]));

        var objectResult = Assert.IsAssignableFrom<ObjectResult>(result.Result);
        var problem = Assert.IsType<ValidationProblemDetails>(objectResult.Value);
        Assert.Equal(400, objectResult.StatusCode);
        Assert.Contains("scopes", problem.Errors.Keys);
    }

    [Fact]
    public void RoutesControllerCreateReturnsCreatedRouteWhenServiceSucceeds()
    {
        var route = CreateRoute();
        var controller = new RoutesController(
            new FakeRouteCatalogQuery([route]),
            new FakeRouteCatalogService(createRouteResult: new CreateRouteResult(route, new Dictionary<string, string[]>())));

        var result = controller.Create(new CreateRouteDto(
            Name: route.Name,
            Description: route.Description,
            Territory: route.Territory,
            Status: route.Status,
            Duration: route.Duration,
            Distance: route.Distance,
            Periodicity: route.Periodicity));

        var created = Assert.IsType<CreatedResult>(result.Result);
        var createdRoute = Assert.IsType<RouteDto>(created.Value);
        Assert.Equal(route.Id, createdRoute.Id);
        Assert.Equal($"/api/v1/routes/{route.Id}", created.Location);
    }

    [Fact]
    public void RoutesControllerCreateReturnsValidationProblemWhenServiceFails()
    {
        var controller = new RoutesController(
            new FakeRouteCatalogQuery([]),
            new FakeRouteCatalogService(createRouteResult: new CreateRouteResult(null, new Dictionary<string, string[]>
            {
                ["name"] = ["Name is required"],
            })));

        var result = controller.Create(new CreateRouteDto(
            Name: "",
            Description: null,
            Territory: null,
            Status: null,
            Duration: null,
            Distance: null,
            Periodicity: null));

        var objectResult = Assert.IsAssignableFrom<ObjectResult>(result.Result);
        var problem = Assert.IsType<ValidationProblemDetails>(objectResult.Value);
        Assert.Equal(400, objectResult.StatusCode);
        Assert.Contains("name", problem.Errors.Keys);
    }

    [Fact]
    public void RoutesControllerDeleteMapsServiceResultToHttpStatus()
    {
        var routeId = Guid.NewGuid();
        var okController = new RoutesController(
            new FakeRouteCatalogQuery([]),
            new FakeRouteCatalogService(deleteRouteResult: true));
        var missingController = new RoutesController(
            new FakeRouteCatalogQuery([]),
            new FakeRouteCatalogService(deleteRouteResult: false));

        Assert.IsType<NoContentResult>(okController.Delete(routeId));
        Assert.IsType<NotFoundResult>(missingController.Delete(routeId));
    }

    [Fact]
    public void MobileAccountsControllerUpdateReturnsOkWhenServiceSucceeds()
    {
        var account = CreateMobileAccount();
        var controller = new MobileAccountsController(new FakeMobileAccountService(
            updateResult: new UpdateMobileAccountResult(account, new Dictionary<string, string[]>())),
            new FakeEmployeeDirectoryQuery());

        var result = controller.Update(account.Id, new UpdateMobileAccountDto(account.Login, account.Role, account.Status));

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Same(account, ok.Value);
    }

    [Fact]
    public void MobileAccountsControllerDetachReturnsValidationProblemWhenServiceRejectsRequest()
    {
        var controller = new MobileAccountsController(new FakeMobileAccountService(
            detachResult: new UpdateMobileAccountResult(null, new Dictionary<string, string[]>
            {
                ["employeeId"] = ["Employee is not bound"],
            })),
            new FakeEmployeeDirectoryQuery());

        var result = controller.DetachEmployee(Guid.NewGuid(), Guid.NewGuid());

        var objectResult = Assert.IsAssignableFrom<ObjectResult>(result.Result);
        var problem = Assert.IsType<ValidationProblemDetails>(objectResult.Value);
        Assert.Equal(400, objectResult.StatusCode);
        Assert.Contains("employeeId", problem.Errors.Keys);
    }

    [Fact]
    public void MobileAccountsControllerBlockMapsMissingAccountToNotFound()
    {
        var controller = new MobileAccountsController(new FakeMobileAccountService(
            blockResult: new UpdateMobileAccountResult(null, new Dictionary<string, string[]>
            {
                ["account"] = ["Not found"],
            })),
            new FakeEmployeeDirectoryQuery());

        var result = controller.Block(Guid.NewGuid());

        Assert.IsType<NotFoundResult>(result.Result);
    }

    [Fact]
    public void MobileAccountsControllerRequiresReadOrWritePermissionAtClassLevel()
    {
        var attribute = typeof(MobileAccountsController)
            .GetCustomAttributes(typeof(RequireAnyPermissionAttribute), inherit: false)
            .OfType<RequireAnyPermissionAttribute>()
            .SingleOrDefault();
        Assert.NotNull(attribute);

        var missingToken = CreateAuthorizationContext(new FakeAuthSessionService());
        attribute!.OnAuthorization(missingToken);
        Assert.IsType<UnauthorizedObjectResult>(missingToken.Result);

        var unrelatedUser = new SessionUserDto(Guid.NewGuid(), "viewer", "Viewer", ["viewer"], ["dashboard.read"]);
        var unrelatedContext = CreateAuthorizationContext(new FakeAuthSessionService(currentUser: unrelatedUser), "token-1");
        attribute.OnAuthorization(unrelatedContext);
        var forbidden = Assert.IsType<ObjectResult>(unrelatedContext.Result);
        Assert.Equal(StatusCodes.Status403Forbidden, forbidden.StatusCode);

        var readUser = new SessionUserDto(Guid.NewGuid(), "reader", "Reader", ["operator"], ["mobile_accounts.read"]);
        var readContext = CreateAuthorizationContext(new FakeAuthSessionService(currentUser: readUser), "token-1");
        attribute.OnAuthorization(readContext);
        Assert.Null(readContext.Result);

        var writeUser = new SessionUserDto(Guid.NewGuid(), "writer", "Writer", ["admin"], ["mobile_accounts.write"]);
        var writeContext = CreateAuthorizationContext(new FakeAuthSessionService(currentUser: writeUser), "token-1");
        attribute.OnAuthorization(writeContext);
        Assert.Null(writeContext.Result);
    }

    [Fact]
    public void PatrolRequestsControllerListReturnsRequestsFromService()
    {
        var request = CreatePatrolRequest();
        var controller = new PatrolRequestsController(new FakePatrolRequestService(requests: [request]));

        var result = controller.List();

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var requests = Assert.IsAssignableFrom<IReadOnlyList<PatrolRequestDto>>(ok.Value);
        Assert.Single(requests);
        Assert.Equal(request.Id, requests[0].Id);
    }

    [Fact]
    public void PatrolRequestsControllerListPassesPagingToService()
    {
        var service = new FakePatrolRequestService();
        var controller = new PatrolRequestsController(service);

        _ = controller.List(3, 50);

        Assert.Equal(3, service.LastPage);
        Assert.Equal(50, service.LastPageSize);
    }

    [Fact]
    public void ResultsControllerListReturnsResultsFromQuery()
    {
        var resultItem = CreateResultListItem();
        var controller = new ResultsController(new FakePatrolResultQuery([resultItem]));

        var result = controller.List(null, null, null, null, null, null);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var results = Assert.IsAssignableFrom<IReadOnlyList<ResultListItemDto>>(ok.Value);
        Assert.Single(results);
        Assert.Equal(resultItem.Id, results[0].Id);
    }

    [Fact]
    public void ResultsControllerListPassesPagingToQuery()
    {
        var query = new FakePatrolResultQuery([]);
        var controller = new ResultsController(query);

        _ = controller.List(null, null, null, null, null, null, 3, 25);

        Assert.Equal(3, query.LastPage);
        Assert.Equal(25, query.LastPageSize);
    }

    [Fact]
    public async Task ResultsV2ControllerReturnsPagingEnvelope()
    {
        var resultItem = CreateResultListItem();
        var query = new FakePatrolResultQuery([resultItem]);
        var controller = new ResultsV2Controller(query);

        var result = await controller.List(null, null, null, null, null, null, 2, 25);

        var ok = Assert.IsType<OkObjectResult>(result);
        var page = Assert.IsType<ResultPageDto>(ok.Value);
        Assert.Single(page.Items);
        Assert.Equal(2, page.Page);
        Assert.Equal(25, page.PageSize);
    }

    [Fact]
    public async Task ResultsV3ControllerReturnsCompleteGroups()
    {
        var resultItem = CreateResultListItem();
        var query = new FakePatrolResultQuery([resultItem]);
        var controller = new ResultsV3Controller(query);

        var result = await controller.List(null, null, null, null, null, null, 2, 25);

        var ok = Assert.IsType<OkObjectResult>(result);
        var page = Assert.IsType<ResultGroupPageDto>(ok.Value);
        var group = Assert.Single(page.Items);
        Assert.Single(group.Results);
        Assert.Equal(resultItem.Id, group.Results[0].Id);
        Assert.Equal(2, page.Page);
        Assert.Equal(25, page.PageSize);
    }

    [Fact]
    public void ResultsControllerGetMapsMissingResultToNotFound()
    {
        var controller = new ResultsController(new FakePatrolResultQuery([]));

        var result = controller.Get(Guid.NewGuid());

        Assert.IsType<NotFoundResult>(result.Result);
    }

    [Fact]
    public void AssignmentsControllerListReturnsAssignmentsFromService()
    {
        var assignment = CreateAssignment();
        var controller = new AssignmentsController(new FakeAssignmentService(assignments: [assignment]));

        var result = controller.List();

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var assignments = Assert.IsAssignableFrom<IReadOnlyList<AssignmentDto>>(ok.Value);
        Assert.Single(assignments);
        Assert.Equal(assignment.Id, assignments[0].Id);
    }

    [Fact]
    public void AssignmentsControllerListPassesPagingToService()
    {
        var service = new FakeAssignmentService();
        var controller = new AssignmentsController(service);

        _ = controller.List(4, 50);

        Assert.Equal(4, service.LastPage);
        Assert.Equal(50, service.LastPageSize);
    }

    [Fact]
    public void AssignmentsControllerCreateReturnsValidationProblemWhenServiceFails()
    {
        var controller = new AssignmentsController(new FakeAssignmentService(
            createResult: new CreateAssignmentResult(null, new Dictionary<string, string[]>
            {
                ["patrolRequestId"] = ["Request is required"],
            })));

        var result = controller.Create(new CreateAssignmentDto(null, Guid.NewGuid(), Guid.NewGuid(), DateTimeOffset.UtcNow, "Day"));

        var objectResult = Assert.IsAssignableFrom<ObjectResult>(result.Result);
        var problem = Assert.IsType<ValidationProblemDetails>(objectResult.Value);
        Assert.Equal(400, objectResult.StatusCode);
        Assert.Contains("patrolRequestId", problem.Errors.Keys);
    }

    [Fact]
    public void AssignmentsControllerCreateReturnsOkForIdempotentReplay()
    {
        var assignment = CreateAssignment();
        var controller = new AssignmentsController(new FakeAssignmentService(
            createResult: new CreateAssignmentResult(assignment, new Dictionary<string, string[]>(), CreateAssignmentOutcome.Reused)));

        var result = controller.Create(new CreateAssignmentDto(assignment.PatrolRequestId, assignment.EmployeeId, assignment.RouteId, assignment.PlannedAt, assignment.Shift));

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Same(assignment, ok.Value);
    }

    [Fact]
    public void AssignmentsControllerCreateReturnsConflictForDifferentReplay()
    {
        var controller = new AssignmentsController(new FakeAssignmentService(
            createResult: new CreateAssignmentResult(null, new Dictionary<string, string[]>
            {
                ["patrolRequestId"] = ["Different payload"]
            }, CreateAssignmentOutcome.Conflict)));

        var result = controller.Create(new CreateAssignmentDto(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), DateTimeOffset.UtcNow, "Day"));

        var conflict = Assert.IsType<ConflictObjectResult>(result.Result);
        var problem = Assert.IsType<ValidationProblemDetails>(conflict.Value);
        Assert.Equal(409, problem.Status);
    }

    [Fact]
    public void AssignmentsControllerCommandMapsMissingAssignmentToNotFound()
    {
        var controller = new AssignmentsController(new FakeAssignmentService());

        var result = controller.Start(Guid.NewGuid());

        Assert.IsType<NotFoundResult>(result.Result);
    }

    [Fact]
    public void AssignmentsControllerCommandReturnsChangedFlag()
    {
        var assignment = CreateAssignment();
        var commandResult = new AssignmentCommandResult(assignment, false, "Already started");
        var controller = new AssignmentsController(new FakeAssignmentService(startResult: commandResult));

        var result = controller.Start(assignment.Id);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var body = Assert.IsType<AssignmentCommandResultDto>(ok.Value);
        Assert.False(body.Changed);
        Assert.Same(assignment, body.Assignment);
    }

    private static RouteDto CreateRoute() =>
        new(
            Guid.NewGuid(),
            Name: "North perimeter",
            Description: "Perimeter inspection",
            Territory: "North",
            Status: "Active",
            Duration: "45 min",
            Distance: "1.5 km",
            Periodicity: "Daily",
            VersionNo: 1,
            Points: []);

    private static MobileAccountDto CreateMobileAccount() =>
        new(
            Guid.NewGuid(),
            Login: "mobile_01",
            PasswordState: "Password set",
            Employee: "Employee One",
            EmployeeScope: "selected",
            BoundEmployeeIds: [Guid.NewGuid()],
            BoundEmployees: ["Employee One"],
            Role: "Inspector",
            Status: "Active",
            Session: "-",
            LastSeen: "Never",
            Device: "-",
            Version: "-");

    private static ResultListItemDto CreateResultListItem() =>
        new(
            Guid.NewGuid(),
            AssignmentId: Guid.NewGuid(),
            Status: "Подтверждено",
            PointId: Guid.NewGuid(),
            Point: "Main gate",
            EmployeeId: Guid.NewGuid(),
            Employee: "Employee One",
            RouteId: Guid.NewGuid(),
            Route: "North perimeter",
            Territory: "North",
            Shift: "День",
            PlannedAt: DateTimeOffset.UtcNow.AddMinutes(-30),
            ActualAt: DateTimeOffset.UtcNow.AddMinutes(-20),
            StartedAt: DateTimeOffset.UtcNow.AddMinutes(-25),
            FinishedAt: DateTimeOffset.UtcNow.AddMinutes(-20),
            Deviation: "+10 min",
            Comment: "No issues",
            Photos: 1,
            IssueType: "-",
            Severity: "-");

    private static AssignmentDto CreateAssignment() =>
        new(
            Guid.NewGuid(),
            PatrolRequestId: Guid.NewGuid(),
            EmployeeId: Guid.NewGuid(),
            EmployeeName: "Employee One",
            RouteId: Guid.NewGuid(),
            RouteName: "North perimeter",
            Shift: "День",
            Status: "Назначена",
            PlannedAt: DateTimeOffset.UtcNow.AddMinutes(30),
            StartedAt: null,
            FinishedAt: null,
            ProgressPercent: 0,
            Eta: "12:00");

    private static PatrolRequestDto CreatePatrolRequest() =>
        new(
            Guid.NewGuid(),
            Number: "REQ-1",
            EmployeeId: Guid.NewGuid(),
            EmployeeName: "Employee One",
            RouteId: Guid.NewGuid(),
            RouteName: "North perimeter",
            SourceResultId: null,
            ScheduledDate: DateOnly.FromDateTime(DateTime.UtcNow.Date),
            ScheduledTime: new TimeOnly(9, 0),
            NotifyEmployee: false,
            NotificationText: string.Empty,
            Status: "РќР°Р·РЅР°С‡РµРЅР°",
            CreatedAt: DateTimeOffset.UtcNow,
            Description: "Daily route");

    private static AuthorizationFilterContext CreateAuthorizationContext(IAuthSessionService authSessionService, string? accessToken = null)
    {
        var services = new ServiceCollection()
            .AddSingleton(authSessionService)
            .BuildServiceProvider();
        var httpContext = new DefaultHttpContext { RequestServices = services };
        if (!string.IsNullOrWhiteSpace(accessToken))
        {
            httpContext.Request.Headers.Authorization = $"Bearer {accessToken}";
            var user = authSessionService.GetCurrentUser(accessToken);
            if (user is not null)
            {
                var claims = new List<Claim>
                {
                    new(ClaimTypes.NameIdentifier, user.Id.ToString()),
                    new(ClaimTypes.Name, user.Login),
                };
                claims.AddRange(user.Roles.Select(role => new Claim(ClaimTypes.Role, role)));
                claims.AddRange(user.Permissions.Select(permission => new Claim("permission", permission)));
                httpContext.User = new ClaimsPrincipal(new ClaimsIdentity(claims, SiteBearerAuthenticationHandler.SchemeName));
            }
        }

        var actionContext = new ActionContext(
            httpContext,
            new RouteData(),
            new ActionDescriptor());
        return new AuthorizationFilterContext(actionContext, []);
    }

    private static bool HasAuthenticationMetadata(Type controllerType, System.Reflection.MethodInfo method)
    {
        var attributes = GetEndpointAttributes(controllerType, method);

        return attributes.OfType<IAllowAnonymous>().Any()
            || attributes.OfType<IAuthorizeData>().Any()
            || attributes.OfType<RequirePermissionAttribute>().Any()
            || attributes.OfType<RequireAnyPermissionAttribute>().Any();
    }

    private static bool HasAllowAnonymousMetadata(Type controllerType, System.Reflection.MethodInfo method) =>
        GetEndpointAttributes(controllerType, method).OfType<IAllowAnonymous>().Any();

    private static object[] GetEndpointAttributes(Type controllerType, System.Reflection.MethodInfo method) =>
        controllerType
            .GetCustomAttributes(inherit: true)
            .Concat(method.GetCustomAttributes(inherit: true))
            .ToArray();

    private static void AssertEndpointPermission(Type controllerType, string methodName, string permission)
    {
        var method = controllerType.GetMethod(methodName);
        Assert.NotNull(method);
        var attribute = method!.GetCustomAttributes(typeof(RequirePermissionAttribute), inherit: false)
            .OfType<RequirePermissionAttribute>()
            .SingleOrDefault();
        Assert.NotNull(attribute);

        var user = new SessionUserDto(Guid.NewGuid(), "reader", "Reader", ["operator"], [permission]);
        var context = CreateAuthorizationContext(new FakeAuthSessionService(currentUser: user), "token-1");

        attribute!.OnAuthorization(context);

        Assert.Null(context.Result);
    }

    private static EmuController CreateEmuController(FakeEmuWorkService workService, SessionUserDto user)
    {
        var controller = new EmuController(
            new FakeEmuCatalogService(),
            workService,
            new FakeEmuShiftService(),
            new FakeEmuPlanService(),
            new FakeAuthSessionService(currentUser: user),
            new FakeSiteUserAdminService());
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext()
        };
        controller.ControllerContext.HttpContext.Request.Headers.Authorization = "Bearer token-1";
        return controller;
    }

    private sealed class FakeEmuCatalogService : IEmuCatalogService
    {
        public EmuSettingsDto GetSettings() => new([], [], [], [], []);

        public EmuCommandResult<EmuReferenceDto> CreateSection(EmuCreateReferenceDto request) => new(null, new Dictionary<string, string[]>());

        public EmuCommandResult<EmuReferenceDto> UpdateSection(Guid id, EmuUpdateReferenceDto request) => new(null, new Dictionary<string, string[]>());

        public EmuCommandResult<EmuReferenceDto> CreateWaitReason(EmuCreateReferenceDto request) => new(null, new Dictionary<string, string[]>());

        public EmuCommandResult<EmuReferenceDto> UpdateWaitReason(Guid id, EmuUpdateReferenceDto request) => new(null, new Dictionary<string, string[]>());

        public EmuCommandResult<EmuReferenceDto> CreateNotCompletedReason(EmuCreateReferenceDto request) => new(null, new Dictionary<string, string[]>());

        public EmuCommandResult<EmuReferenceDto> UpdateNotCompletedReason(Guid id, EmuUpdateReferenceDto request) => new(null, new Dictionary<string, string[]>());

        public EmuCommandResult<EmuWorkTemplateDto> CreateWorkTemplate(EmuCreateWorkTemplateDto request) => new(null, new Dictionary<string, string[]>());

        public EmuCommandResult<EmuWorkTemplateDto> UpdateWorkTemplate(Guid id, EmuUpdateWorkTemplateDto request) => new(null, new Dictionary<string, string[]>());

        public IReadOnlyList<EmuFavoriteEmployeeDto> GetFavoriteEmployees() => [];

        public EmuCommandResult<EmuFavoriteEmployeeDto> AddFavoriteEmployee(EmuAddFavoriteEmployeeDto request) => new(null, new Dictionary<string, string[]>());

        public EmuCommandResult<EmuFavoriteEmployeeDto> RemoveFavoriteEmployee(Guid employeeId) => new(null, new Dictionary<string, string[]>());
    }

    private sealed class FakeEmuWorkService : IEmuWorkService
    {
        public EmuCreateWorkSessionDto? CreatedRequest { get; private set; }

        public Guid? LastEmployeeReportId { get; private set; }

        public EmuWorkSessionQueryDto? LastEmployeeReportQuery { get; private set; }

        public EmuWorkSessionQueryDto? LastQuery { get; private set; }

        public EmuDashboardDto GetDashboard(IReadOnlyList<Guid>? allowedSectionIds = null, Guid? createdByUserId = null) => new([], [], [], [], []);

        public EmuListResponseDto<EmuWorkSessionDto> GetWorkSessions(EmuWorkSessionQueryDto query)
        {
            LastQuery = query;
            return new EmuListResponseDto<EmuWorkSessionDto>([], 0, query.Page, query.PageSize, 1);
        }

        public EmuWorkHistoryReportDto GetWorkHistoryReport(EmuWorkSessionQueryDto query) =>
            new(
                query,
                DateTimeOffset.UtcNow,
                new EmuWorkHistoryTotalsDto(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
                [],
                [],
                []);

        public EmuCommandResult<EmuEmployeeWorkHistoryReportDto> GetEmployeeWorkHistoryReport(Guid employeeId, EmuWorkSessionQueryDto query)
        {
            LastEmployeeReportId = employeeId;
            LastEmployeeReportQuery = query;
            return new(
                new EmuEmployeeWorkHistoryReportDto(
                    query,
                    DateTimeOffset.UtcNow,
                    new EmuEmployeeWorkReportDto(employeeId, "Employee", "", "", "", 0, 0, 0, 0, 0, 0),
                    [],
                    new EmuListResponseDto<EmuWorkSessionDto>([], 0, query.Page, query.PageSize, 1)),
                new Dictionary<string, string[]>());
        }

        public EmuWorkSessionChangesDto GetWorkSessionChanges(DateTimeOffset since, IReadOnlyList<Guid>? allowedSectionIds = null, Guid? createdByUserId = null) => new(DateTimeOffset.UtcNow, [], []);

        public EmuCommandResult<EmuWorkSessionDto> GetWorkSession(Guid id) => new(null, new Dictionary<string, string[]>());

        public EmuListResponseDto<EmuShiftRemarkDto> GetShiftRemarks(int page = 1, int pageSize = 50, Guid? sectionId = null, Guid? employeeId = null, IReadOnlyList<Guid>? allowedSectionIds = null) => new([], 0, page, pageSize, 1);

        public EmuCommandResult<EmuShiftRemarkDto> GetShiftRemark(Guid id) => new(null, new Dictionary<string, string[]>());

        public ResultAttachmentFileDto? GetShiftRemarkAttachmentFile(Guid remarkId, Guid attachmentId) => null;

        public ResultAttachmentFileDto? GetWorkAttachmentFile(Guid workSessionId, Guid attachmentId) => null;

        public EmuCommandResult<EmuWorkSessionDto> CreateWorkSession(EmuCreateWorkSessionDto request, Guid? actorUserId, string actorName, bool canOverridePlanApproval = false)
        {
            CreatedRequest = request;
            return new(null, new Dictionary<string, string[]>());
        }

        public EmuCommandResult<EmuWorkSessionDto> UpdateWorkSession(Guid id, EmuUpdateWorkSessionDto request, Guid? actorUserId, string actorName) => new(null, new Dictionary<string, string[]>());

        public EmuCommandResult<EmuWorkSessionDto> AddWorkSessionEmployee(Guid id, EmuAddWorkSessionEmployeeDto request, Guid? actorUserId, string actorName) => new(null, new Dictionary<string, string[]>());

        public EmuCommandResult<EmuWorkSessionDto> FinishWorkSessionEmployee(Guid id, Guid employeeId, EmuFinishWorkSessionEmployeeDto request, Guid? actorUserId, string actorName) => new(null, new Dictionary<string, string[]>());

        public EmuCommandResult<EmuWorkSessionDto> MarkWorkSessionEmployeeMistaken(Guid id, Guid employeeId, EmuMarkMistakenWorkSessionEmployeeDto request, Guid? actorUserId, string actorName) => new(null, new Dictionary<string, string[]>());

        public EmuCommandResult<EmuWorkSessionDto> PauseWorkSession(Guid id, EmuPauseWorkSessionDto request, Guid? actorUserId, string actorName) => new(null, new Dictionary<string, string[]>());

        public EmuCommandResult<EmuWorkSessionDto> ResumeWorkSession(Guid id, EmuResumeWorkSessionDto request, Guid? actorUserId, string actorName) => new(null, new Dictionary<string, string[]>());

        public EmuCommandResult<EmuWorkSessionDto> CompleteWorkSession(Guid id, EmuCompleteWorkSessionDto request, Guid? actorUserId, string actorName) => new(null, new Dictionary<string, string[]>());

        public EmuCommandResult<EmuWorkSessionDto> CarryOverWorkSession(Guid id, EmuCarryOverWorkSessionDto request, Guid? actorUserId, string actorName) => new(null, new Dictionary<string, string[]>());

        public EmuCommandResult<EmuWorkSessionDto> DeleteWorkSession(Guid id, EmuDeleteWorkSessionDto request, Guid? actorUserId, string actorName) => new(null, new Dictionary<string, string[]>());

        public EmuListResponseDto<EmuAuditEventDto> GetWorkSessionAudit(Guid id, int page = 1, int pageSize = 100) => new([], 0, page, pageSize, 1);
    }

    private sealed class FakeEmuPlanService : IEmuPlanService
    {
        public EmuListResponseDto<EmuPlanTaskDto> GetPlanTasks(DateOnly? weekStart = null, IReadOnlyList<Guid>? allowedSectionIds = null) => new([], 0, 1, 100, 1);

        public EmuPlanTaskChangesDto GetPlanTaskChanges(DateTimeOffset since, IReadOnlyList<Guid>? allowedSectionIds = null) => new(DateTimeOffset.UtcNow, [], []);

        public EmuCommandResult<EmuPlanTaskDto> CreatePlanTask(EmuUpsertPlanTaskDto request, Guid? actorUserId, string actorName) => new(null, new Dictionary<string, string[]>());

        public EmuCommandResult<EmuPlanTaskDto> UpdatePlanTask(Guid id, EmuUpsertPlanTaskDto request, Guid? actorUserId, string actorName, IReadOnlyList<Guid>? allowedSectionIds = null) => new(null, new Dictionary<string, string[]>());

        public EmuCommandResult<EmuPlanTaskDto> ReschedulePlanTask(Guid id, EmuReschedulePlanTaskDto request, Guid? actorUserId, string actorName, IReadOnlyList<Guid>? allowedSectionIds = null) => new(null, new Dictionary<string, string[]>());

        public EmuCommandResult<EmuPlanTaskDto> ApprovePlanTask(Guid id, EmuApprovePlanTaskDto request, Guid? actorUserId, string actorName, IReadOnlyList<Guid>? allowedSectionIds = null) => new(null, new Dictionary<string, string[]>());

        public EmuCommandResult<IReadOnlyList<EmuPlanTaskDto>> ApproveWeek(EmuApproveWeekDto request, Guid? actorUserId, string actorName, IReadOnlyList<Guid>? allowedSectionIds = null) => new(null, new Dictionary<string, string[]>());
    }

    private sealed class FakeEmuShiftService : IEmuShiftService
    {
        public IReadOnlyList<EmuShiftTemplateDto> GetShiftTemplates() => [];

        public IReadOnlyList<EmuEmployeeShiftDto> GetEmployeeShifts(DateOnly date, Guid? employeeId = null, IReadOnlyList<Guid>? allowedSectionIds = null) => [];

        public EmuCommandResult<EmuEmployeeShiftDto> UpdateEmployeeShift(Guid id, EmuUpdateEmployeeShiftDto request, Guid? actorUserId, string actorName) =>
            new(null, new Dictionary<string, string[]>());

        public EmuCommandResult<EmuEmployeeShiftSummaryDto> GetEmployeeShiftSummary(Guid employeeId, DateOnly date, IReadOnlyList<Guid>? allowedSectionIds = null) =>
            new(null, new Dictionary<string, string[]>());

        public EmuCommandResult<EmuEmployeeMonthSummaryDto> GetEmployeeMonthSummary(Guid employeeId, DateOnly month, IReadOnlyList<Guid>? allowedSectionIds = null) =>
            new(null, new Dictionary<string, string[]>());

        public IReadOnlyList<EmuDecisionDto> GetDecisions(EmuDecisionQueryDto query, IReadOnlyList<Guid>? allowedSectionIds = null) => [];

        public EmuCommandResult<EmuDecisionDto> ResolveDecision(Guid id, EmuResolveDecisionDto request, Guid? actorUserId, string actorName, IReadOnlyList<Guid>? allowedSectionIds = null) =>
            new(null, new Dictionary<string, string[]>());
    }

    private sealed class FakeRouteCatalogQuery(IReadOnlyList<RouteDto> routes) : IRouteCatalogQuery
    {
        public IReadOnlyList<RouteDto> GetRoutes(bool includeArchived = false) => routes;

        public RouteDto? GetRoute(Guid id) => routes.FirstOrDefault(route => route.Id == id);
    }

    private sealed class FakeRouteCatalogService(
        CreateRouteResult? createRouteResult = null,
        bool deleteRouteResult = false) : IRouteCatalogService
    {
        public CreateRouteResult CreateRoute(CreateRouteDto request) =>
            createRouteResult ?? new CreateRouteResult(null, new Dictionary<string, string[]>());

        public CreateRouteResult CreateRouteWithPoints(CreateRouteWithPointsDto request) =>
            createRouteResult ?? new CreateRouteResult(null, new Dictionary<string, string[]>());

        public UpdateRouteResult UpdateRoute(Guid id, UpdateRouteDto request) =>
            new(null, new Dictionary<string, string[]>());

        public bool DeleteRoute(Guid id) => deleteRouteResult;

        public CreateRoutePointResult CreateRoutePoint(Guid routeId, CreateRoutePointDto request) =>
            new(null, null, new Dictionary<string, string[]>());

        public UpdateRoutePointResult UpdateRoutePoint(Guid routeId, Guid pointId, UpdateRoutePointDto request) =>
            new(null, null, new Dictionary<string, string[]>());

        public bool DeleteRoutePoint(Guid routeId, Guid pointId) =>
            false;

        public UpdateRoutePointResult ReorderRoutePoint(Guid routeId, Guid pointId, ReorderRoutePointDto request) =>
            new(null, null, new Dictionary<string, string[]>());
    }

    private sealed class FakeMobileAccountService(
        UpdateMobileAccountResult? updateResult = null,
        UpdateMobileAccountResult? detachResult = null,
        UpdateMobileAccountResult? blockResult = null) : IMobileAccountService
    {
        public IReadOnlyList<MobileAccountDto> GetAccounts() => [];

        public MobileAccountDto? GetAccount(Guid id) => null;

        public CreateMobileAccountResult CreateAccount(CreateMobileAccountDto request) =>
            new(null, null, new Dictionary<string, string[]>());

        public UpdateMobileAccountResult UpdateAccount(Guid id, UpdateMobileAccountDto request) =>
            updateResult ?? new UpdateMobileAccountResult(null, new Dictionary<string, string[]>());

        public UpdateMobileAccountResult AttachEmployee(Guid id, AttachMobileAccountEmployeeDto request) =>
            new(null, new Dictionary<string, string[]>());

        public UpdateMobileAccountResult DetachEmployee(Guid id, Guid employeeId) =>
            detachResult ?? new UpdateMobileAccountResult(null, new Dictionary<string, string[]>());

        public UpdateMobileAccountResult BlockAccount(Guid id) =>
            blockResult ?? new UpdateMobileAccountResult(null, new Dictionary<string, string[]>());

        public UpdateMobileAccountResult UnblockAccount(Guid id) =>
            new(null, new Dictionary<string, string[]>());

        public ResetMobileAccountPasswordDto? ResetPassword(Guid id) => null;

        public bool DeleteAccount(Guid id) => false;

        public IReadOnlyList<MobileAccountSessionDto> GetSessions(Guid id) => [];

        public IReadOnlyList<MobileAccountSecurityEventDto> GetSecurityEvents(Guid id) => [];
    }

    private sealed class FakeEmployeeDirectoryQuery : IEmployeeDirectoryQuery
    {
        public IReadOnlyList<EmployeeDto> GetEmployees() => [];

        public EmployeeDto? GetEmployee(Guid id) => null;
    }

    private sealed class FakePatrolResultQuery(IReadOnlyList<ResultListItemDto> results) : IPatrolResultQuery
    {
        public int? LastPage { get; private set; }

        public int? LastPageSize { get; private set; }

        public IReadOnlyList<ResultListItemDto> GetResults(ResultFilterDto filter, int page = 1, int pageSize = 100)
        {
            LastPage = page;
            LastPageSize = pageSize;
            return results;
        }

        public ResultPageDto GetResultsPage(ResultFilterDto filter, int page = 1, int pageSize = 100)
        {
            LastPage = page;
            LastPageSize = pageSize;
            return new ResultPageDto(results, page, pageSize, results.Count, results.Count == 0 ? 0 : 1, false);
        }

        public ResultExportFileDto ExportResults(ResultFilterDto filter) =>
            new([], "text/csv; charset=utf-8", "patrol-results.csv");

        public ResultDetailDto? GetResult(Guid id) => null;

        public ResultAttachmentFileDto? GetAttachmentFile(Guid resultId, Guid attachmentId) => null;
    }

    private sealed class FakeAssignmentService(
        IReadOnlyList<AssignmentDto>? assignments = null,
        CreateAssignmentResult? createResult = null,
        AssignmentCommandResult? startResult = null) : IAssignmentService
    {
        public int? LastPage { get; private set; }

        public int? LastPageSize { get; private set; }

        public IReadOnlyList<AssignmentDto> GetAssignments(int page = 1, int pageSize = 100, AssignmentFilterDto? filter = null)
        {
            LastPage = page;
            LastPageSize = pageSize;
            return assignments ?? [];
        }

        public AssignmentSettingsDto GetSettings() =>
            new([], new AssignmentShiftSettingsDto("08:00", "20:00", "20:00", "08:00"));

        public AssignmentSettingsDto UpdateSettings(UpdateAssignmentSettingsDto request) =>
            new(request.FavoriteEmployeeIds ?? [], request.ShiftSettings ?? new AssignmentShiftSettingsDto("08:00", "20:00", "20:00", "08:00"));

        public CreateAssignmentResult Create(CreateAssignmentDto request) =>
            createResult ?? new CreateAssignmentResult(CreateAssignment(), new Dictionary<string, string[]>());

        public AssignmentCommandResult? Start(Guid id) => startResult;

        public AssignmentCommandResult? Cancel(Guid id) => null;

        public AssignmentCommandResult? Complete(Guid id, CompleteAssignmentDto? request = null) => null;
    }

    private sealed class FakePatrolRequestService(
        IReadOnlyList<PatrolRequestDto>? requests = null,
        CreatePatrolRequestResult? createResult = null) : IPatrolRequestService
    {
        public int? LastPage { get; private set; }

        public int? LastPageSize { get; private set; }

        public IReadOnlyList<PatrolRequestDto> GetRequests(int page = 1, int pageSize = 100, PatrolRequestFilterDto? filter = null)
        {
            LastPage = page;
            LastPageSize = pageSize;
            return requests ?? [];
        }

        public CreatePatrolRequestResult Create(CreatePatrolRequestDto request) =>
            createResult ?? new CreatePatrolRequestResult(CreatePatrolRequest(), new Dictionary<string, string[]>());
    }

    private sealed class FakeAuthSessionService(AuthLoginResult? loginResult = null, SessionUserDto? currentUser = null) : IAuthSessionService
    {
        public AuthLoginResult Login(LoginRequestDto request) =>
            loginResult ?? new AuthLoginResult(null, true, new Dictionary<string, string[]>());

        public SessionUserDto? GetCurrentUser(string accessToken) => currentUser;

        public bool Logout(string accessToken) => true;
    }

    private sealed class FakeSiteUserAdminService(
        CreateSiteUserResult? createResult = null,
        UpdateSiteUserScopesResult? scopesResult = null) : ISiteUserAdminService
    {
        public IReadOnlyList<SiteUserDto> GetUsers() => [];

        public SiteUserDto? GetUser(Guid id) => null;

        public IReadOnlyList<RoleDto> GetRoles() => [];

        public SiteUserAccessDto? GetUserAccess(Guid id) => null;

        public CreateSiteUserResult CreateUser(CreateSiteUserDto request) =>
            createResult ?? new CreateSiteUserResult(null, new Dictionary<string, string[]>());

        public UpdateSiteUserResult UpdateUser(Guid id, UpdateSiteUserDto request) =>
            new(null, new Dictionary<string, string[]>());

        public UpdateSiteUserResult BlockUser(Guid id) =>
            new(null, new Dictionary<string, string[]>());

        public UpdateSiteUserResult UnblockUser(Guid id) =>
            new(null, new Dictionary<string, string[]>());

        public UpdateSiteUserResult UpdateUserPermissions(Guid id, UpdateSiteUserPermissionsDto request) =>
            new(null, new Dictionary<string, string[]>());

        public UpdateSiteUserScopesResult UpdateUserScopes(Guid id, UpdateSiteUserScopesDto request, Guid? actorUserId = null) =>
            scopesResult ?? new(null, new Dictionary<string, string[]> { ["user"] = ["Not found"] });

        public ResetSiteUserPasswordDto? ResetPassword(Guid id) => null;
    }
}
