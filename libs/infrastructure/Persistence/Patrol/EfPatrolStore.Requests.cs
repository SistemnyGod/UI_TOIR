using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Caching.Memory;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfPatrolStore
{
    private const int DefaultPatrolRequestPage = 1;
    private const int DefaultPatrolRequestPageSize = 100;
    private const int MaxPatrolRequestPageSize = 500;

    public IReadOnlyList<PatrolRequestDto> GetRequests(
        int page = DefaultPatrolRequestPage,
        int pageSize = DefaultPatrolRequestPageSize,
        PatrolRequestFilterDto? filter = null)
    {
        var paging = NormalizePatrolRequestPaging(page, pageSize);
        var query = dbContext.PatrolRequests
            .AsNoTracking()
            .Include(request => request.Assignment)
            .AsQueryable();

        if (filter?.EmployeeId is not null)
        {
            query = query.Where(request => request.EmployeeId == filter.EmployeeId.Value);
        }

        if (filter?.RouteId is not null)
        {
            query = query.Where(request => request.RouteId == filter.RouteId.Value);
        }

        if (!string.IsNullOrWhiteSpace(filter?.Status))
        {
            var status = filter.Status.Trim();
            query = query.Where(request => request.Status == status);
        }

        if (filter?.DateFrom is not null)
        {
            query = query.Where(request => request.ScheduledDate >= filter.DateFrom.Value);
        }

        if (filter?.DateTo is not null)
        {
            query = query.Where(request => request.ScheduledDate <= filter.DateTo.Value);
        }

        if (!string.IsNullOrWhiteSpace(filter?.Query))
        {
            var search = filter.Query.Trim().ToLower();
            query = query.Where(request =>
                request.Number.ToLower().Contains(search)
                || request.EmployeeName.ToLower().Contains(search)
                || request.RouteName.ToLower().Contains(search)
                || request.Description.ToLower().Contains(search));
        }

        return query
            .OrderByDescending(request => request.CreatedAt)
            .ThenByDescending(request => request.Id)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .ToList()
            .Select(request => MapPatrolRequest(request))
            .ToList();
    }

    public CreatePatrolRequestResult Create(CreatePatrolRequestDto request)
    {
        var employee = ResolveEmployee(request);
        var route = ResolveRoute(request);
        var sourceResultExists = request.SourceResultId is null
            || dbContext.PatrolResults.Any(result => result.Id == request.SourceResultId.Value);
        var plannedAt = ResolveRequestPlannedAt(request);
        var errors = ValidateCreateRequest(request, employee, route, sourceResultExists, plannedAt);

        if (errors.Count > 0)
        {
            return new CreatePatrolRequestResult(null, errors);
        }

        var now = DateTimeOffset.UtcNow;
        var requestEntity = new PatrolRequestEntity
        {
            Id = Guid.NewGuid(),
            Number = GenerateRequestNumber(request.ScheduledDate),
            EmployeeId = employee!.Id,
            EmployeeName = employee.FullName,
            RouteId = route!.Id,
            RouteName = route.Name,
            SourceResultId = request.SourceResultId,
            ScheduledDate = request.ScheduledDate,
            ScheduledTime = request.ScheduledTime,
            NotifyEmployee = request.NotifyEmployee,
            NotificationText = NormalizeOptionalText(request.NotificationText),
            Status = AssignmentStatusValues.Assigned,
            CreatedAt = now,
            Description = NormalizeOptionalText(request.Description)
        };

        var assignmentEntity = new AssignmentEntity
        {
            Id = Guid.NewGuid(),
            PatrolRequestId = requestEntity.Id,
            EmployeeId = employee.Id,
            RouteId = route.Id,
            RouteVersionNo = route.VersionNo,
            Shift = NormalizeOptionalText(request.Shift, employee.Shift),
            Status = request.NotifyEmployee ? AssignmentStatusValues.Waiting : AssignmentStatusValues.Assigned,
            PlannedAt = plannedAt!.Value,
            ProgressPercent = 0,
            LockVersion = 0
        };

        requestEntity.Assignment = assignmentEntity;
        dbContext.PatrolRequests.Add(requestEntity);
        dbContext.Assignments.Add(assignmentEntity);

        AddMobileNotificationForEmployee(
                employee.Id,
                "patrolRequest",
                "Новая заявка на обход",
                string.IsNullOrWhiteSpace(requestEntity.NotificationText)
                    ? BuildAssignmentNotificationText(employee.FullName, route.Name, plannedAt.Value)
                    : requestEntity.NotificationText,
                "patrolRequest",
                requestEntity.Id.ToString(),
                $"patrol-request:{requestEntity.Id}");

        SaveChangesAndInvalidateDashboardSummary();

        return new CreatePatrolRequestResult(MapPatrolRequest(requestEntity), new Dictionary<string, string[]>());
    }

    private EmployeeEntity? ResolveEmployee(CreatePatrolRequestDto request)
    {
        if (request.EmployeeId is not null)
        {
            return dbContext.Employees.FirstOrDefault(employee => employee.Id == request.EmployeeId.Value);
        }

        var employeeName = NormalizeOptionalText(request.EmployeeName);
        return string.IsNullOrWhiteSpace(employeeName)
            ? null
            : dbContext.Employees.FirstOrDefault(employee => employee.FullName == employeeName);
    }

    private RouteEntity? ResolveRoute(CreatePatrolRequestDto request)
    {
        if (request.RouteId is not null)
        {
            return dbContext.Routes.FirstOrDefault(route => route.Id == request.RouteId.Value && !route.IsArchived);
        }

        var routeName = NormalizeOptionalText(request.RouteName);
        return string.IsNullOrWhiteSpace(routeName)
            ? null
            : dbContext.Routes.FirstOrDefault(route => route.Name == routeName && !route.IsArchived);
    }

    private Dictionary<string, string[]> ValidateCreateRequest(
        CreatePatrolRequestDto request,
        EmployeeEntity? employee,
        RouteEntity? route,
        bool sourceResultExists,
        DateTimeOffset? plannedAt)
    {
        var errors = new Dictionary<string, string[]>();

        if (request.EmployeeId is null && string.IsNullOrWhiteSpace(request.EmployeeName))
        {
            errors["employee"] = ["Выберите сотрудника для обхода."];
        }
        else if (employee is null)
        {
            errors["employee"] = ["Сотрудник не найден."];
        }

        if (request.RouteId is null && string.IsNullOrWhiteSpace(request.RouteName))
        {
            errors["route"] = ["Выберите маршрут обхода."];
        }
        else if (route is null)
        {
            errors["route"] = ["Маршрут не найден."];
        }
        else if (!RouteHasActivePoints(route.Id))
        {
            errors["route"] = ["В маршруте нет активных точек обхода."];
        }

        if (!sourceResultExists)
        {
            errors["sourceResultId"] = ["Результат обхода не найден."];
        }

        if (request.ScheduledDate == default)
        {
            errors["scheduledDate"] = ["Укажите дату обхода."];
        }

        if (request.ScheduledTime is null && plannedAt is null)
        {
            errors["scheduledTime"] = ["Укажите время старта обхода."];
        }

        var shift = string.IsNullOrWhiteSpace(request.Shift) ? employee?.Shift : request.Shift;
        if (string.IsNullOrWhiteSpace(shift))
        {
            errors["shift"] = ["Укажите смену назначения."];
        }

        if (employee is not null && plannedAt is not null && !string.IsNullOrWhiteSpace(shift))
        {
            AddEmployeeAssignmentConflictError(errors, "employee", employee.Id, plannedAt.Value, shift);
        }

        return errors;
    }

    private bool RouteHasActivePoints(Guid routeId) =>
        dbContext.RoutePoints.Any(point =>
            point.RouteId == routeId
            && point.Status != "Черновик"
            && point.Status != "Draft");

    private string GenerateRequestNumber(DateOnly scheduledDate)
    {
        var todayCount = dbContext.PatrolRequests.Count(request => request.ScheduledDate == scheduledDate);

        return $"REQ-{scheduledDate:yyyyMMdd}-{todayCount + 1:0000}";
    }

    private static DateTimeOffset CombinePlannedAt(DateOnly date, TimeOnly? time)
    {
        var dateTime = date.ToDateTime(time ?? TimeOnly.MinValue);
        return new DateTimeOffset(dateTime, TimeZoneInfo.Local.GetUtcOffset(dateTime)).ToUniversalTime();
    }

    private static DateTimeOffset? ResolveRequestPlannedAt(CreatePatrolRequestDto request)
    {
        if (request.PlannedAt is not null && request.PlannedAt != default)
        {
            return request.PlannedAt.Value.ToUniversalTime();
        }

        if (request.ScheduledDate == default || request.ScheduledTime is null)
        {
            return null;
        }

        return CombinePlannedAt(request.ScheduledDate, request.ScheduledTime);
    }

    private static PatrolRequestDto MapPatrolRequest(PatrolRequestEntity request) =>
        new(
            request.Id,
            request.Number,
            request.EmployeeId,
            request.EmployeeName,
            request.RouteId,
            request.RouteName,
            request.SourceResultId,
            request.ScheduledDate,
            request.ScheduledTime,
            request.NotifyEmployee,
            request.NotificationText,
            request.Status,
            request.CreatedAt,
            request.Description,
            request.Assignment?.Id);

    private static PatrolRequestPaging NormalizePatrolRequestPaging(int page, int pageSize)
    {
        var normalizedPageSize = pageSize <= 0 ? DefaultPatrolRequestPageSize : Math.Min(pageSize, MaxPatrolRequestPageSize);
        var maxPage = Math.Max(DefaultPatrolRequestPage, int.MaxValue / normalizedPageSize);
        var normalizedPage = page <= 0 ? DefaultPatrolRequestPage : Math.Min(page, maxPage);
        return new PatrolRequestPaging(normalizedPage, normalizedPageSize);
    }

    private sealed record PatrolRequestPaging(int Page, int PageSize);
}
