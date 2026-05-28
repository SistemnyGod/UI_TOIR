using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
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
            ["dashboard.read"]);
        var created = new SiteUserCreatedDto(user, "Patrol-123456!");
        var controller = new SiteUsersController(new FakeSiteUserAdminService(
            createResult: new CreateSiteUserResult(created, new Dictionary<string, string[]>())));

        var result = controller.Create(new CreateSiteUserDto("operator", "Operator", ["operator"], "active"));

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
    public void ResultsControllerListReturnsResultsFromQuery()
    {
        var resultItem = CreateResultListItem();
        var controller = new ResultsController(new FakePatrolResultQuery([resultItem]));

        var result = controller.List(null, null, null, null, null);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var results = Assert.IsAssignableFrom<IReadOnlyList<ResultListItemDto>>(ok.Value);
        Assert.Single(results);
        Assert.Equal(resultItem.Id, results[0].Id);
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

    private static AuthorizationFilterContext CreateAuthorizationContext(IAuthSessionService authSessionService, string? accessToken = null)
    {
        var services = new ServiceCollection()
            .AddSingleton(authSessionService)
            .BuildServiceProvider();
        var httpContext = new DefaultHttpContext { RequestServices = services };
        if (!string.IsNullOrWhiteSpace(accessToken))
        {
            httpContext.Request.Headers.Authorization = $"Bearer {accessToken}";
        }

        var actionContext = new ActionContext(
            httpContext,
            new RouteData(),
            new ActionDescriptor());
        return new AuthorizationFilterContext(actionContext, []);
    }

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
        public IReadOnlyList<ResultListItemDto> GetResults(ResultFilterDto filter) => results;

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
        public IReadOnlyList<AssignmentDto> GetAssignments() => assignments ?? [];

        public CreateAssignmentResult Create(CreateAssignmentDto request) =>
            createResult ?? new CreateAssignmentResult(CreateAssignment(), new Dictionary<string, string[]>());

        public AssignmentCommandResult? Start(Guid id) => startResult;

        public AssignmentCommandResult? Cancel(Guid id) => null;

        public AssignmentCommandResult? Complete(Guid id, CompleteAssignmentDto? request = null) => null;
    }

    private sealed class FakeAuthSessionService(AuthLoginResult? loginResult = null, SessionUserDto? currentUser = null) : IAuthSessionService
    {
        public AuthLoginResult Login(LoginRequestDto request) =>
            loginResult ?? new AuthLoginResult(null, true, new Dictionary<string, string[]>());

        public SessionUserDto? GetCurrentUser(string accessToken) => currentUser;

        public bool Logout(string accessToken) => true;
    }

    private sealed class FakeSiteUserAdminService(CreateSiteUserResult? createResult = null) : ISiteUserAdminService
    {
        public IReadOnlyList<SiteUserDto> GetUsers() => [];

        public SiteUserDto? GetUser(Guid id) => null;

        public IReadOnlyList<RoleDto> GetRoles() => [];

        public CreateSiteUserResult CreateUser(CreateSiteUserDto request) =>
            createResult ?? new CreateSiteUserResult(null, new Dictionary<string, string[]>());

        public UpdateSiteUserResult UpdateUser(Guid id, UpdateSiteUserDto request) =>
            new(null, new Dictionary<string, string[]>());

        public UpdateSiteUserResult BlockUser(Guid id) =>
            new(null, new Dictionary<string, string[]>());

        public UpdateSiteUserResult UnblockUser(Guid id) =>
            new(null, new Dictionary<string, string[]>());

        public ResetSiteUserPasswordDto? ResetPassword(Guid id) => null;
    }
}
