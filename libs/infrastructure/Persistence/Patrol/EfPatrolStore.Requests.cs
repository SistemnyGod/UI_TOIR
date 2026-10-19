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

        if (filter?.Id is not null)
        {
            query = query.Where(request => request.Id == filter.Id.Value);
        }

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
            var statusCode = PatrolStatusCodeMapper.ToRequestCode(status);
            query = statusCode is null
                ? query.Where(request => request.Status == status)
                : query.Where(request => request.StatusCode == statusCode || request.Status == status);
        }

        if (!string.IsNullOrWhiteSpace(filter?.StatusGroup))
        {
            var codes = PatrolStatusCodeMapper.GetRequestGroupCodes(filter.StatusGroup.Trim().ToLowerInvariant());
            var aliases = PatrolStatusCodeMapper.GetRequestCodeAliases(codes);
            query = query.Where(request => codes.Contains(request.StatusCode!) || aliases.Contains(request.Status.Trim().ToLower()));
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
            var search = ToLikeContainsPattern(filter.Query);
            query = query.Where(request => EF.Functions.ILike(request.SearchText, search, "\\"));
        }

        var requestRows = query
            .OrderByDescending(request => request.CreatedAt)
            .ThenByDescending(request => request.Id)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .ToList();
        var assignmentIds = requestRows
            .Where(request => request.Assignment is not null)
            .Select(request => request.Assignment!.Id)
            .ToArray();
        var resultIds = dbContext.PatrolResults
            .AsNoTracking()
            .Where(result => result.AssignmentId.HasValue && assignmentIds.Contains(result.AssignmentId.Value))
            .GroupBy(result => result.AssignmentId!.Value)
            .Select(group => new { AssignmentId = group.Key, ResultId = group.Select(result => result.Id).First() })
            .ToDictionary(item => item.AssignmentId, item => item.ResultId);

        return requestRows
            .Select(request => MapPatrolRequest(request, request.Assignment is not null && resultIds.TryGetValue(request.Assignment.Id, out var resultId) ? resultId : null))
            .ToList();
    }

    public CreatePatrolRequestResult Create(CreatePatrolRequestDto request)
    {
        using var transaction = dbContext.Database.BeginTransaction();
        if (request.ClientRequestId is Guid clientId)
        {
            if (clientId == Guid.Empty)
                return RequestIdentityConflict();
            var operationLock = $"patrol-request-create:{clientId}";
            dbContext.Database.ExecuteSqlInterpolated($"SELECT pg_advisory_xact_lock(hashtextextended({operationLock}, 0))");
            var existing = dbContext.PatrolRequests.AsNoTracking().Include(row => row.Assignment)
                .SingleOrDefault(row => row.Id == clientId);
            if (existing is not null)
            {
                if (!MatchesCreatedRequest(existing, request)) return RequestIdentityConflict();
                return new CreatePatrolRequestResult(MapPatrolRequest(existing), new Dictionary<string, string[]>());
            }
        }
        var employee = ResolveEmployee(request);
        var route = ResolveRoute(request);
        var sourceResultExists = request.SourceResultId is null
            || dbContext.PatrolResults.Any(result => result.Id == request.SourceResultId.Value);
        var plannedAt = ResolveRequestPlannedAt(request);
        var requestedShift = NormalizeOptionalText(request.Shift, employee?.Shift ?? string.Empty);
        if (employee is not null && plannedAt is not null && !string.IsNullOrWhiteSpace(requestedShift))
        {
            AcquireEmployeeShiftAssignmentLock(employee!.Id, plannedAt!.Value, requestedShift);
        }

        var errors = ValidateCreateRequest(request, employee, route, sourceResultExists, plannedAt);

        if (errors.Count > 0)
        {
            return new CreatePatrolRequestResult(null, errors);
        }

        var now = DateTimeOffset.UtcNow;
        var numberLockKey = $"patrol-request-number:{request.ScheduledDate:yyyyMMdd}";
        dbContext.Database.ExecuteSqlInterpolated($"SELECT pg_advisory_xact_lock(hashtextextended({numberLockKey}, 0))");
        var requestEntity = new PatrolRequestEntity
        {
            Id = request.ClientRequestId ?? Guid.NewGuid(),
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

        var routeRevision = GetOrCreateCurrentRouteRevision(route);
        var assignmentEntity = new AssignmentEntity
        {
            Id = Guid.NewGuid(),
            PatrolRequestId = requestEntity.Id,
            EmployeeId = employee.Id,
            RouteId = route.Id,
            RouteVersionNo = route.VersionNo,
            RouteRevisionId = routeRevision.Id,
            RouteRevision = routeRevision,
            Shift = requestedShift,
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
        transaction.Commit();

        return new CreatePatrolRequestResult(MapPatrolRequest(requestEntity), new Dictionary<string, string[]>());
    }

    private static CreatePatrolRequestResult RequestIdentityConflict() => new(null,
        new Dictionary<string, string[]> { ["clientRequestId"] = ["Идентификатор отправки уже использован для другой заявки. Откройте созданную заявку или начните новую."] });

    private static bool MatchesCreatedRequest(PatrolRequestEntity existing, CreatePatrolRequestDto request) =>
        (request.EmployeeId is not null ? existing.EmployeeId == request.EmployeeId : existing.EmployeeName == request.EmployeeName?.Trim())
        && (request.RouteId is not null ? existing.RouteId == request.RouteId : existing.RouteName == request.RouteName?.Trim())
        && existing.SourceResultId == request.SourceResultId && existing.ScheduledDate == request.ScheduledDate
        && existing.ScheduledTime == request.ScheduledTime && existing.NotifyEmployee == request.NotifyEmployee
        && existing.NotificationText == NormalizeOptionalText(request.NotificationText)
        && existing.Description == NormalizeOptionalText(request.Description)
        && (request.PlannedAt is null || existing.Assignment?.PlannedAt == request.PlannedAt)
        && (string.IsNullOrWhiteSpace(request.Shift) || existing.Assignment?.Shift == request.Shift.Trim());

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
        var id = request.RouteId ?? dbContext.Routes.AsNoTracking()
            .Where(route => route.Name == NormalizeOptionalText(request.RouteName) && !route.IsArchived)
            .Select(route => (Guid?)route.Id).FirstOrDefault();
        if (id is null) return null;
        var route = PatrolRouteRevisionStore.LoadForUpdate(dbContext, id.Value);
        return route is { IsArchived: false } ? route : null;
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
        // The date lock is held until commit. MAX also handles gaps left by
        // historical cleanup, where COUNT would reuse an existing number.
        var next = dbContext.Database.SqlQuery<long>($$"""
            SELECT COALESCE(MAX(regexp_replace(number, '^REQ-[0-9]{8}-', '')::bigint), 0) + 1 AS "Value"
            FROM patrol_requests
            WHERE scheduled_date = {{scheduledDate}}
              AND number ~ '^REQ-[0-9]{8}-[0-9]{1,18}$'
            """).Single();
        return $"REQ-{scheduledDate:yyyyMMdd}-{next:0000}";
    }

    private DateTimeOffset CombinePlannedAt(DateOnly date, TimeOnly? time) =>
        patrolTimeZone.ToUtc(date, time ?? TimeOnly.MinValue);

    private DateTimeOffset? ResolveRequestPlannedAt(CreatePatrolRequestDto request)
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

    private static PatrolRequestDto MapPatrolRequest(PatrolRequestEntity request, Guid? resultId = null) =>
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
            request.Assignment?.Id,
            request.CancellationReasonCode,
            request.CancellationReasonText,
            request.CancelledAt,
            request.CancelledByUserId,
            request.CancelledByUserName,
            resultId);

    private static PatrolRequestPaging NormalizePatrolRequestPaging(int page, int pageSize)
    {
        var normalizedPageSize = pageSize <= 0 ? DefaultPatrolRequestPageSize : Math.Min(pageSize, MaxPatrolRequestPageSize);
        var maxPage = Math.Max(DefaultPatrolRequestPage, int.MaxValue / normalizedPageSize);
        var normalizedPage = page <= 0 ? DefaultPatrolRequestPage : Math.Min(page, maxPage);
        return new PatrolRequestPaging(normalizedPage, normalizedPageSize);
    }

    private sealed record PatrolRequestPaging(int Page, int PageSize);
}
