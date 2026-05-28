using Microsoft.AspNetCore.Mvc;
using Patrol360.Api.Authorization;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Api.Controllers;

[ApiController]
[Route("api/v1/routes")]
public sealed class RoutesController(
    IRouteCatalogQuery routeCatalogQuery,
    IRouteCatalogService routeCatalogService) : ControllerBase
{
    [HttpGet]
    [RequirePermission("routes.read")]
    public ActionResult<IReadOnlyList<RouteDto>> List([FromQuery] bool includeArchived = false) =>
        Ok(routeCatalogQuery.GetRoutes(includeArchived));

    [HttpGet("{id:guid}")]
    [RequirePermission("routes.read")]
    public ActionResult<RouteDto> Get(Guid id)
    {
        var route = routeCatalogQuery.GetRoute(id);
        return route is null ? NotFound() : Ok(route);
    }

    [HttpPost]
    [RequirePermission("routes.write")]
    public ActionResult<RouteDto> Create(CreateRouteDto request)
    {
        var result = routeCatalogService.CreateRoute(request);
        if (!result.Succeeded)
        {
            return RouteValidationProblem(result.Errors);
        }

        return Created($"/api/v1/routes/{result.Route!.Id}", result.Route);
    }

    [HttpPost("with-points")]
    [RequirePermission("routes.write")]
    public ActionResult<RouteDto> CreateWithPoints(CreateRouteWithPointsDto request)
    {
        var result = routeCatalogService.CreateRouteWithPoints(request);
        if (!result.Succeeded)
        {
            return RouteValidationProblem(result.Errors);
        }

        return Created($"/api/v1/routes/{result.Route!.Id}", result.Route);
    }

    [HttpPut("{id:guid}")]
    [RequirePermission("routes.write")]
    public ActionResult<RouteDto> Update(Guid id, UpdateRouteDto request)
    {
        var result = routeCatalogService.UpdateRoute(id, request);
        if (!result.Succeeded)
        {
            return RouteValidationProblem(result.Errors);
        }

        return Ok(result.Route);
    }

    [HttpDelete("{id:guid}")]
    [RequirePermission("routes.write")]
    public IActionResult Delete(Guid id) =>
        routeCatalogService.DeleteRoute(id) ? NoContent() : NotFound();

    [HttpPost("{routeId:guid}/points")]
    [RequirePermission("routes.write")]
    public ActionResult<RoutePointDto> CreatePoint(Guid routeId, CreateRoutePointDto request)
    {
        var result = routeCatalogService.CreateRoutePoint(routeId, request);
        if (!result.Succeeded)
        {
            return RouteValidationProblem(result.Errors);
        }

        return Created($"/api/v1/routes/{routeId}/points/{result.Point!.Id}", result.Point);
    }

    [HttpPut("{routeId:guid}/points/{pointId:guid}")]
    [RequirePermission("routes.write")]
    public ActionResult<RoutePointDto> UpdatePoint(Guid routeId, Guid pointId, UpdateRoutePointDto request)
    {
        var result = routeCatalogService.UpdateRoutePoint(routeId, pointId, request);
        if (!result.Succeeded)
        {
            return RouteValidationProblem(result.Errors);
        }

        return Ok(result.Point);
    }

    [HttpPut("{routeId:guid}/points/{pointId:guid}/order")]
    [RequirePermission("routes.write")]
    public ActionResult<RoutePointDto> ReorderPoint(Guid routeId, Guid pointId, ReorderRoutePointDto request)
    {
        var result = routeCatalogService.ReorderRoutePoint(routeId, pointId, request);
        if (!result.Succeeded)
        {
            return RouteValidationProblem(result.Errors);
        }

        return Ok(result.Point);
    }

    [HttpDelete("{routeId:guid}/points/{pointId:guid}")]
    [RequirePermission("routes.write")]
    public IActionResult DeletePoint(Guid routeId, Guid pointId) =>
        routeCatalogService.DeleteRoutePoint(routeId, pointId) ? NoContent() : NotFound();

    private ActionResult RouteValidationProblem(IReadOnlyDictionary<string, string[]> errors) =>
        ValidationProblem(new ValidationProblemDetails(errors.ToDictionary(item => item.Key, item => item.Value))
        {
            Title = "Маршрут не сохранен",
            Detail = "Проверьте обязательные поля маршрута или точки.",
            Status = StatusCodes.Status400BadRequest
        });
}
