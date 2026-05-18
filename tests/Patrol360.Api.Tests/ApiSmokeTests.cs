using Microsoft.AspNetCore.Mvc;
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

    private sealed class FakeRouteCatalogQuery(IReadOnlyList<RouteDto> routes) : IRouteCatalogQuery
    {
        public IReadOnlyList<RouteDto> GetRoutes() => routes;

        public RouteDto? GetRoute(Guid id) => routes.FirstOrDefault(route => route.Id == id);
    }

    private sealed class FakeRouteCatalogService(
        CreateRouteResult? createRouteResult = null,
        bool deleteRouteResult = false) : IRouteCatalogService
    {
        public CreateRouteResult CreateRoute(CreateRouteDto request) =>
            createRouteResult ?? new CreateRouteResult(null, new Dictionary<string, string[]>());

        public UpdateRouteResult UpdateRoute(Guid id, UpdateRouteDto request) =>
            throw new NotImplementedException();

        public bool DeleteRoute(Guid id) => deleteRouteResult;

        public CreateRoutePointResult CreateRoutePoint(Guid routeId, CreateRoutePointDto request) =>
            throw new NotImplementedException();

        public UpdateRoutePointResult UpdateRoutePoint(Guid routeId, Guid pointId, UpdateRoutePointDto request) =>
            throw new NotImplementedException();

        public bool DeleteRoutePoint(Guid routeId, Guid pointId) =>
            throw new NotImplementedException();

        public UpdateRoutePointResult ReorderRoutePoint(Guid routeId, Guid pointId, ReorderRoutePointDto request) =>
            throw new NotImplementedException();
    }
}
