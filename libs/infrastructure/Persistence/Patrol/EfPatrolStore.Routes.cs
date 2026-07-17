using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Caching.Memory;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfPatrolStore
{
    public IReadOnlyList<RouteDto> GetRoutes(bool includeArchived = false) =>
        dbContext.Routes
            .AsNoTracking()
            .Include(route => route.Points)
            .Where(route => includeArchived || !route.IsArchived)
            .OrderBy(route => route.Name)
            .AsEnumerable()
            .Select(route => MapRoute(route))
            .ToList();

    public RouteDto? GetRoute(Guid id)
    {
        var route = dbContext.Routes
            .AsNoTracking()
            .Include(item => item.Points)
            .FirstOrDefault(item => item.Id == id);

        return route is null ? null : MapRoute(route);
    }

    public CreateRouteResult CreateRoute(CreateRouteDto request)
    {
        var errors = ValidateRoute(request.Name);
        if (errors.Count > 0)
        {
            return new CreateRouteResult(null, errors);
        }

        var route = new RouteEntity
        {
            Id = Guid.NewGuid(),
            Name = request.Name.Trim(),
            Description = NormalizeOptionalText(request.Description),
            Territory = NormalizeOptionalText(request.Territory, "Без территории"),
            Status = NormalizeOptionalText(request.Status, "Активен"),
            Duration = NormalizeOptionalText(request.Duration, "00:30"),
            Distance = NormalizeOptionalText(request.Distance, "0 км"),
            Periodicity = NormalizeOptionalText(request.Periodicity, "По заявке"),
            VersionNo = 1,
            IsArchived = IsArchivedStatus(request.Status),
            CreatedAt = DateTimeOffset.UtcNow
        };

        dbContext.Routes.Add(route);
        SaveChangesAndInvalidateDashboardSummary();

        return new CreateRouteResult(MapRoute(route), new Dictionary<string, string[]>());
    }

    public CreateRouteResult CreateRouteWithPoints(CreateRouteWithPointsDto request)
    {
        IReadOnlyList<CreateRoutePointDto> points = request.Points ?? [];
        var errors = ValidateRoute(request.Route.Name);
        AddRoutePointPayloadErrors(errors, points);
        if (errors.Count > 0)
        {
            return new CreateRouteResult(null, errors);
        }

        using var transaction = dbContext.Database.BeginTransaction();
        var route = new RouteEntity
        {
            Id = Guid.NewGuid(),
            Name = request.Route.Name.Trim(),
            Description = NormalizeOptionalText(request.Route.Description),
            Territory = NormalizeOptionalText(request.Route.Territory, "Без территории"),
            Status = NormalizeOptionalText(request.Route.Status, "Активен"),
            Duration = NormalizeOptionalText(request.Route.Duration, "00:30"),
            Distance = NormalizeOptionalText(request.Route.Distance, "0 км"),
            Periodicity = NormalizeOptionalText(request.Route.Periodicity, "По заявке"),
            VersionNo = 1,
            IsArchived = IsArchivedStatus(request.Route.Status),
            CreatedAt = DateTimeOffset.UtcNow
        };

        dbContext.Routes.Add(route);

        var sequenceNo = 1;
        foreach (var pointRequest in points)
        {
            var point = new RoutePointEntity
            {
                Id = Guid.NewGuid(),
                RouteId = route.Id,
                SequenceNo = sequenceNo++,
                Name = pointRequest.Name.Trim(),
                Zone = NormalizeOptionalText(pointRequest.Zone, route.Territory),
                Type = NormalizeOptionalText(pointRequest.Type, "NFC"),
                Tag = NormalizeOptionalText(pointRequest.Tag),
                Description = NormalizeOptionalText(pointRequest.Description),
                Instruction = NormalizeOptionalText(pointRequest.Instruction),
                Interval = NormalizeOptionalText(pointRequest.Interval, "00:10"),
                ExpectedTime = NormalizeOptionalText(pointRequest.ExpectedTime, "00:05"),
                Status = NormalizeOptionalText(pointRequest.Status, "Активна"),
                NfcCode = NormalizeOptionalText(pointRequest.Tag),
                IsRequired = IsActivePointStatus(pointRequest.Status),
                RequiresPhoto = false
            };

            route.Points.Add(point);
        }

        route.VersionNo += points.Count;
        SaveChangesAndInvalidateDashboardSummary();
        transaction.Commit();

        return new CreateRouteResult(MapRoute(route), new Dictionary<string, string[]>());
    }

    public UpdateRouteResult UpdateRoute(Guid id, UpdateRouteDto request)
    {
        var route = dbContext.Routes.Include(item => item.Points).FirstOrDefault(item => item.Id == id);
        if (route is null)
        {
            return new UpdateRouteResult(null, new Dictionary<string, string[]> { ["route"] = ["Маршрут не найден."] });
        }

        if (request.ExpectedVersionNo is not null && request.ExpectedVersionNo != route.VersionNo)
        {
            return new UpdateRouteResult(null, BuildRouteVersionErrors(), true);
        }

        var errors = ValidateRoute(request.Name);
        if (errors.Count > 0)
        {
            return new UpdateRouteResult(null, errors);
        }

        route.Name = request.Name.Trim();
        route.Description = NormalizeOptionalText(request.Description);
        route.Territory = NormalizeOptionalText(request.Territory, "Без территории");
        route.Status = NormalizeOptionalText(request.Status, "Активен");
        route.Duration = NormalizeOptionalText(request.Duration, "00:30");
        route.Distance = NormalizeOptionalText(request.Distance, "0 км");
        route.Periodicity = NormalizeOptionalText(request.Periodicity, "По заявке");
        route.IsArchived = IsArchivedStatus(request.Status);
        route.VersionNo += 1;

        SaveChangesAndInvalidateDashboardSummary();

        return new UpdateRouteResult(MapRoute(route), new Dictionary<string, string[]>());
    }

    public bool DeleteRoute(Guid id)
    {
        var route = dbContext.Routes.FirstOrDefault(item => item.Id == id);
        if (route is null)
        {
            return false;
        }

        route.Status = "Архив";
        route.IsArchived = true;
        route.VersionNo += 1;
        SaveChangesAndInvalidateDashboardSummary();

        return true;
    }

    public CreateRoutePointResult CreateRoutePoint(Guid routeId, CreateRoutePointDto request)
    {
        var route = dbContext.Routes.Include(item => item.Points).FirstOrDefault(item => item.Id == routeId);
        if (route is null)
        {
            return new CreateRoutePointResult(null, null, new Dictionary<string, string[]> { ["route"] = ["Маршрут не найден."] });
        }

        var errors = ValidateRoutePoint(request.Name);
        AddRoutePointNfcUniquenessError(errors, routeId, request.Tag);
        if (errors.Count > 0)
        {
            return new CreateRoutePointResult(null, null, errors);
        }

        var point = new RoutePointEntity
        {
            Id = Guid.NewGuid(),
            RouteId = routeId,
            SequenceNo = route.Points.Count + 1,
            Name = request.Name.Trim(),
            Zone = NormalizeOptionalText(request.Zone, route.Territory),
            Type = NormalizeOptionalText(request.Type, "NFC"),
            Tag = NormalizeOptionalText(request.Tag),
            Description = NormalizeOptionalText(request.Description),
            Instruction = NormalizeOptionalText(request.Instruction),
            Interval = NormalizeOptionalText(request.Interval, "00:10"),
            ExpectedTime = NormalizeOptionalText(request.ExpectedTime, "00:05"),
            Status = NormalizeOptionalText(request.Status, "Активна"),
            NfcCode = NormalizeOptionalText(request.Tag),
            IsRequired = IsActivePointStatus(request.Status),
            RequiresPhoto = false
        };

        dbContext.RoutePoints.Add(point);
        route.VersionNo += 1;
        SaveChangesAndInvalidateDashboardSummary();

        return new CreateRoutePointResult(MapRoute(route), MapRoutePoint(point), new Dictionary<string, string[]>());
    }

    public UpdateRoutePointResult UpdateRoutePoint(Guid routeId, Guid pointId, UpdateRoutePointDto request)
    {
        var route = dbContext.Routes.Include(item => item.Points).FirstOrDefault(item => item.Id == routeId);
        var point = route?.Points.FirstOrDefault(item => item.Id == pointId);
        if (route is null || point is null)
        {
            return new UpdateRoutePointResult(null, null, new Dictionary<string, string[]> { ["point"] = ["Точка маршрута не найдена."] });
        }

        var errors = ValidateRoutePoint(request.Name);
        AddRoutePointNfcUniquenessError(errors, routeId, request.Tag, pointId);
        if (errors.Count > 0)
        {
            return new UpdateRoutePointResult(null, null, errors);
        }

        point.Name = request.Name.Trim();
        point.Zone = NormalizeOptionalText(request.Zone, route.Territory);
        point.Type = NormalizeOptionalText(request.Type, "NFC");
        point.Tag = NormalizeOptionalText(request.Tag);
        point.Description = NormalizeOptionalText(request.Description);
        point.Instruction = NormalizeOptionalText(request.Instruction);
        point.Interval = NormalizeOptionalText(request.Interval, "00:10");
        point.ExpectedTime = NormalizeOptionalText(request.ExpectedTime, "00:05");
        point.Status = NormalizeOptionalText(request.Status, "Активна");
        point.NfcCode = NormalizeOptionalText(request.Tag);
        point.IsRequired = IsActivePointStatus(request.Status);
        point.RequiresPhoto = false;
        route.VersionNo += 1;

        SaveChangesAndInvalidateDashboardSummary();

        return new UpdateRoutePointResult(MapRoute(route), MapRoutePoint(point), new Dictionary<string, string[]>());
    }

    public bool DeleteRoutePoint(Guid routeId, Guid pointId)
    {
        var route = dbContext.Routes.Include(item => item.Points).FirstOrDefault(item => item.Id == routeId);
        var point = route?.Points.FirstOrDefault(item => item.Id == pointId);
        if (route is null || point is null)
        {
            return false;
        }

        dbContext.RoutePoints.Remove(point);
        route.Points.Remove(point);
        route.VersionNo += 1;
        ReorderPoints(route.Points.OrderBy(item => item.SequenceNo));
        SaveChangesAndInvalidateDashboardSummary();

        return true;
    }

    public UpdateRoutePointResult ReorderRoutePoint(Guid routeId, Guid pointId, ReorderRoutePointDto request)
    {
        var route = dbContext.Routes.Include(item => item.Points).FirstOrDefault(item => item.Id == routeId);
        var point = route?.Points.FirstOrDefault(item => item.Id == pointId);
        if (route is null || point is null)
        {
            return new UpdateRoutePointResult(null, null, new Dictionary<string, string[]> { ["point"] = ["Точка маршрута не найдена."] });
        }

        if (request.ExpectedVersionNo is not null && request.ExpectedVersionNo != route.VersionNo)
        {
            return new UpdateRoutePointResult(null, null, BuildRouteVersionErrors(), true);
        }

        var ordered = route.Points.OrderBy(item => item.SequenceNo).ToList();
        ordered.Remove(point);
        var nextIndex = Math.Clamp(request.SequenceNo, 1, ordered.Count + 1) - 1;
        ordered.Insert(nextIndex, point);

        ReorderPoints(ordered);
        route.VersionNo += 1;
        SaveChangesAndInvalidateDashboardSummary();

        return new UpdateRoutePointResult(MapRoute(route), MapRoutePoint(point), new Dictionary<string, string[]>());
    }

    private static Dictionary<string, string[]> BuildRouteVersionErrors() =>
        new() { ["versionNo"] = ["Маршрут уже изменён другим пользователем. Обновите данные и повторите действие."] };

    private static Dictionary<string, string[]> ValidateRoute(string? name)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(name))
        {
            errors["name"] = ["Укажите название маршрута."];
        }

        return errors;
    }

    private static Dictionary<string, string[]> ValidateRoutePoint(string? name)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(name))
        {
            errors["name"] = ["Укажите название точки маршрута."];
        }

        return errors;
    }

    private static void AddRoutePointPayloadErrors(
        Dictionary<string, string[]> errors,
        IReadOnlyList<CreateRoutePointDto> points)
    {
        var seenNfc = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

        for (var index = 0; index < points.Count; index += 1)
        {
            var point = points[index];
            foreach (var error in ValidateRoutePoint(point.Name))
            {
                errors[$"points[{index}].{error.Key}"] = error.Value;
            }

            var nfcCode = NormalizeOptionalText(point.Tag);
            if (string.IsNullOrWhiteSpace(nfcCode))
            {
                continue;
            }

            if (seenNfc.TryGetValue(nfcCode, out var firstIndex))
            {
                errors[$"points[{index}].tag"] =
                    [$"NFC-метка уже указана в точке №{firstIndex + 1} этого маршрута."];
            }
            else
            {
                seenNfc[nfcCode] = index;
            }
        }
    }

    private void AddRoutePointNfcUniquenessError(Dictionary<string, string[]> errors, Guid routeId, string? tag, Guid? pointId = null)
    {
        var nfcCode = NormalizeOptionalText(tag);
        if (string.IsNullOrWhiteSpace(nfcCode))
        {
            return;
        }

        var exists = dbContext.RoutePoints.Any(point =>
            point.RouteId == routeId
            && point.NfcCode == nfcCode
            && (!pointId.HasValue || point.Id != pointId.Value));

        if (exists)
        {
            errors["tag"] = ["NFC-метка уже используется в другой точке этого маршрута."];
        }
    }

    private static RouteDto MapRoute(RouteEntity route) =>
        new(
            route.Id,
            route.Name,
            route.Description,
            NormalizeOptionalText(route.Territory, "Без территории"),
            NormalizeOptionalText(route.Status, route.IsArchived ? "Архив" : "Активен"),
            NormalizeOptionalText(route.Duration, "00:30"),
            NormalizeOptionalText(route.Distance, "0 км"),
            NormalizeOptionalText(route.Periodicity, "По заявке"),
            route.VersionNo,
            route.Points
                .OrderBy(point => point.SequenceNo)
                .Select(point => MapRoutePoint(point))
                .ToList());

    private static RoutePointDto MapRoutePoint(RoutePointEntity point) =>
        new(
            point.Id,
            point.SequenceNo,
            point.Name,
            NormalizeOptionalText(point.Zone, "Без зоны"),
            NormalizeOptionalText(point.Type, point.NfcCode is null ? "Ручной контроль" : "NFC"),
            NormalizeOptionalText(point.Tag, point.NfcCode ?? string.Empty),
            NormalizeOptionalText(point.Interval, "00:10"),
            NormalizeOptionalText(point.ExpectedTime, "00:05"),
            NormalizeOptionalText(point.Status, point.IsRequired ? "Активна" : "Черновик"),
            point.NfcCode,
            point.IsRequired,
            point.RequiresPhoto,
            NormalizeOptionalText(point.Description),
            NormalizeOptionalText(point.Instruction));

    private static void ReorderPoints(IEnumerable<RoutePointEntity> points)
    {
        var index = 1;
        foreach (var point in points)
        {
            point.SequenceNo = index++;
        }
    }
}
