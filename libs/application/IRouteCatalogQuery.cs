using Patrol360.Contracts;

namespace Patrol360.Application;

public interface IRouteCatalogQuery
{
    IReadOnlyList<RouteDto> GetRoutes();

    RouteDto? GetRoute(Guid id);
}

public interface IRouteCatalogService
{
    CreateRouteResult CreateRoute(CreateRouteDto request);

    UpdateRouteResult UpdateRoute(Guid id, UpdateRouteDto request);

    bool DeleteRoute(Guid id);

    CreateRoutePointResult CreateRoutePoint(Guid routeId, CreateRoutePointDto request);

    UpdateRoutePointResult UpdateRoutePoint(Guid routeId, Guid pointId, UpdateRoutePointDto request);

    bool DeleteRoutePoint(Guid routeId, Guid pointId);

    UpdateRoutePointResult ReorderRoutePoint(Guid routeId, Guid pointId, ReorderRoutePointDto request);
}

public sealed record CreateRouteResult(
    RouteDto? Route,
    IReadOnlyDictionary<string, string[]> Errors)
{
    public bool Succeeded => Route is not null && Errors.Count == 0;
}

public sealed record UpdateRouteResult(
    RouteDto? Route,
    IReadOnlyDictionary<string, string[]> Errors)
{
    public bool Succeeded => Route is not null && Errors.Count == 0;
}

public sealed record CreateRoutePointResult(
    RouteDto? Route,
    RoutePointDto? Point,
    IReadOnlyDictionary<string, string[]> Errors)
{
    public bool Succeeded => Route is not null && Point is not null && Errors.Count == 0;
}

public sealed record UpdateRoutePointResult(
    RouteDto? Route,
    RoutePointDto? Point,
    IReadOnlyDictionary<string, string[]> Errors)
{
    public bool Succeeded => Route is not null && Point is not null && Errors.Count == 0;
}
