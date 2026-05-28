using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed class EfPatrolStore(Patrol360DbContext dbContext) :
    IPatrolDashboardQuery,
    IRouteCatalogQuery,
    IEmployeeDirectoryQuery,
    IEmployeeDirectoryService,
    IMobileAccountService,
    IPatrolRequestService,
    IAssignmentService,
    IRouteCatalogService
{
    private static readonly PasswordHasher<MobileAccountEntity> MobilePasswordHasher = new();
    private static readonly string[] EditableMobileAccountStatuses = ["Активен", "Не привязан", "Заблокирован"];
    private static readonly string[] AllowedPatrolPhotoContentTypes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
    private const int MaxPatrolPhotoSizeBytes = 10 * 1024 * 1024;

    public DashboardSummaryDto GetSummary()
    {
        var onlineThreshold = DateTimeOffset.UtcNow.AddMinutes(-15);
        var localToday = DateOnly.FromDateTime(DateTime.Now);
        var localStartDateTime = localToday.ToDateTime(TimeOnly.MinValue);
        var localEndDateTime = localToday.AddDays(1).ToDateTime(TimeOnly.MinValue);
        var todayStart = new DateTimeOffset(localStartDateTime, TimeZoneInfo.Local.GetUtcOffset(localStartDateTime)).ToUniversalTime();
        var todayEnd = new DateTimeOffset(localEndDateTime, TimeZoneInfo.Local.GetUtcOffset(localEndDateTime)).ToUniversalTime();
        var totalPoints = dbContext.RoutePoints.Count(point => point.Route != null && !point.Route.IsArchived);
        var todayResults = dbContext.PatrolResults
            .Where(result => result.ActualAt >= todayStart && result.ActualAt < todayEnd);
        var completedPoints = todayResults.Count(result => result.RoutePointId != null);
        if (completedPoints == 0)
        {
            completedPoints = todayResults.Count();
        }
        var completedToday = todayResults
            .Where(result => result.AssignmentId != null)
            .Select(result => result.AssignmentId!.Value)
            .Distinct()
            .Count()
            + todayResults.Count(result => result.AssignmentId == null);
        var issues = todayResults.Count(result =>
            result.Status == "Замечание"
            || result.Status == "Просрочено"
            || result.IssueType != string.Empty && result.IssueType != "-");

        return new DashboardSummaryDto(
            ActivePatrols: dbContext.Assignments.Count(assignment => AssignmentStatusValues.Active.Contains(assignment.Status)),
            DelayedPatrols: dbContext.Assignments.Count(assignment => AssignmentStatusValues.Delayed.Contains(assignment.Status)),
            Issues: issues,
            CompletedToday: completedToday,
            ShiftCoveragePercent: CalculateShiftCoveragePercent(),
            CompletedPoints: completedPoints,
            TotalPoints: totalPoints,
            OnlineEmployees: dbContext.Employees.Count(employee => employee.LastSeenAt >= onlineThreshold),
            TotalEmployees: dbContext.Employees.Count());
    }

    public IReadOnlyList<AssignmentDto> GetActiveAssignments() =>
        GetAssignmentQuery()
            .Where(assignment => assignment.Status != AssignmentStatusValues.Completed && assignment.Status != AssignmentStatusValues.Cancelled)
            .OrderByDescending(assignment => assignment.PlannedAt)
            .Take(50)
            .AsEnumerable()
            .Select(MapAssignment)
            .ToList();

    public IReadOnlyList<AssignmentDto> GetAssignments() =>
        GetAssignmentQuery()
            .OrderByDescending(assignment => assignment.PlannedAt)
            .AsEnumerable()
            .Select(MapAssignment)
            .ToList();

    public CreateAssignmentResult Create(CreateAssignmentDto request)
    {
        var patrolRequest = request.PatrolRequestId is null
            ? null
            : dbContext.PatrolRequests.FirstOrDefault(item => item.Id == request.PatrolRequestId.Value);
        var employee = request.EmployeeId is null
            ? null
            : dbContext.Employees.FirstOrDefault(item => item.Id == request.EmployeeId.Value);
        var route = request.RouteId is null
            ? null
            : dbContext.Routes.FirstOrDefault(item => item.Id == request.RouteId.Value && !item.IsArchived);
        var existingAssignment = FindReusableAssignment(request, patrolRequest, employee, route);
        if (existingAssignment is not null)
        {
            return new CreateAssignmentResult(MapAssignment(existingAssignment), new Dictionary<string, string[]>());
        }

        var errors = ValidateCreateAssignment(request, patrolRequest, employee, route);

        if (errors.Count > 0)
        {
            return new CreateAssignmentResult(null, errors);
        }

        var confirmedPatrolRequest = patrolRequest!;
        var confirmedEmployee = employee!;
        var confirmedRoute = route!;
        var plannedAt = request.PlannedAt!.Value.ToUniversalTime();
        var shouldNotify = request.NotifyEmployee || confirmedPatrolRequest.NotifyEmployee;
        var notificationText = NormalizeOptionalText(request.NotificationText, confirmedPatrolRequest.NotificationText);

        confirmedPatrolRequest.Status = "Назначена";
        confirmedPatrolRequest.NotifyEmployee = shouldNotify;
        confirmedPatrolRequest.NotificationText = shouldNotify
            ? NormalizeOptionalText(notificationText, BuildAssignmentNotificationText(confirmedEmployee.FullName, confirmedRoute.Name, plannedAt))
            : string.Empty;
        if (!string.IsNullOrWhiteSpace(request.Comment))
        {
            confirmedPatrolRequest.Description = NormalizeOptionalText(request.Comment);
        }

        var assignment = new AssignmentEntity
        {
            Id = Guid.NewGuid(),
            PatrolRequestId = confirmedPatrolRequest.Id,
            EmployeeId = confirmedEmployee.Id,
            RouteId = confirmedRoute.Id,
            Shift = string.IsNullOrWhiteSpace(request.Shift) ? confirmedEmployee.Shift : request.Shift!.Trim(),
            Status = shouldNotify ? AssignmentStatusValues.Waiting : AssignmentStatusValues.Assigned,
            PlannedAt = plannedAt,
            ProgressPercent = 0,
            LockVersion = 0
        };

        dbContext.Assignments.Add(assignment);
        AddMobileNotificationForEmployee(
                confirmedEmployee.Id,
                "patrolRequest",
                "Новая заявка на обход",
                string.IsNullOrWhiteSpace(confirmedPatrolRequest.NotificationText)
                    ? BuildAssignmentNotificationText(confirmedEmployee.FullName, confirmedRoute.Name, plannedAt)
                    : confirmedPatrolRequest.NotificationText,
                "patrolRequest",
                confirmedPatrolRequest.Id.ToString(),
                $"patrol-request:{confirmedPatrolRequest.Id}");
        dbContext.SaveChanges();

        assignment.PatrolRequest = confirmedPatrolRequest;
        assignment.Employee = confirmedEmployee;
        assignment.Route = confirmedRoute;

        return new CreateAssignmentResult(MapAssignment(assignment), new Dictionary<string, string[]>());
    }

    public AssignmentCommandResult? Start(Guid id)
    {
        var assignment = FindAssignment(id);
        if (assignment is null)
        {
            return null;
        }

        if (assignment.Status == AssignmentStatusValues.InProgress || assignment.Status == AssignmentStatusValues.Completed)
        {
            return new AssignmentCommandResult(MapAssignment(assignment), false, "Назначение уже запущено или завершено.");
        }

        if (assignment.Status == AssignmentStatusValues.Cancelled)
        {
            return new AssignmentCommandResult(MapAssignment(assignment), false, "Отмененное назначение не запускается.");
        }

        assignment.Status = AssignmentStatusValues.InProgress;
        if (assignment.PatrolRequest is not null)
        {
            assignment.PatrolRequest.Status = "В работе";
        }

        assignment.StartedAt ??= DateTimeOffset.UtcNow;
        assignment.ProgressPercent = Math.Max(assignment.ProgressPercent, 1);
        assignment.LockVersion++;
        dbContext.SaveChanges();

        return new AssignmentCommandResult(MapAssignment(assignment), true, "Назначение запущено.");
    }

    public AssignmentCommandResult? Cancel(Guid id)
    {
        var assignment = FindAssignment(id);
        if (assignment is null)
        {
            return null;
        }

        if (assignment.Status == AssignmentStatusValues.Cancelled || assignment.Status == AssignmentStatusValues.Completed)
        {
            return new AssignmentCommandResult(MapAssignment(assignment), false, "Назначение уже закрыто.");
        }

        assignment.Status = AssignmentStatusValues.Cancelled;
        if (assignment.PatrolRequest is not null)
        {
            assignment.PatrolRequest.Status = "Закрыта";
        }

        assignment.LockVersion++;
        dbContext.SaveChanges();

        return new AssignmentCommandResult(MapAssignment(assignment), true, "Назначение отменено.");
    }

    public AssignmentCommandResult? Complete(Guid id, CompleteAssignmentDto? request = null)
    {
        var assignment = FindAssignment(id);
        if (assignment is null)
        {
            return null;
        }

        if (assignment.Status == AssignmentStatusValues.Completed)
        {
            var hasResult = dbContext.PatrolResults.Any(result => result.AssignmentId == assignment.Id);
            if (!hasResult && request is not null)
            {
                var backfillErrors = ValidateCompleteAssignment(request, assignment.Route?.Points);
                if (backfillErrors.Count > 0)
                {
                    return new AssignmentCommandResult(MapAssignment(assignment), false, "Результат обхода не сохранен.", backfillErrors);
                }

                var backfillActualAt = request.ActualAt!.Value.ToUniversalTime();
                assignment.FinishedAt ??= backfillActualAt;
                if (assignment.PatrolRequest is not null)
                {
                    assignment.PatrolRequest.Status = "Закрыта";
                }

                UpsertPatrolResult(assignment, request, backfillActualAt, DateTimeOffset.UtcNow);
                dbContext.SaveChanges();

                return new AssignmentCommandResult(MapAssignment(assignment), true, "Результат завершенного назначения сохранен.");
            }

            return new AssignmentCommandResult(MapAssignment(assignment), false, "Назначение уже завершено.");
        }

        if (assignment.Status == AssignmentStatusValues.Cancelled)
        {
            return new AssignmentCommandResult(MapAssignment(assignment), false, "Отмененное назначение не завершается.");
        }

        var errors = ValidateCompleteAssignment(request, assignment.Route?.Points);
        if (errors.Count > 0)
        {
            return new AssignmentCommandResult(MapAssignment(assignment), false, "Результат обхода не сохранен.", errors);
        }

        var actualAt = request!.ActualAt!.Value.ToUniversalTime();
        assignment.Status = AssignmentStatusValues.Completed;
        if (assignment.PatrolRequest is not null)
        {
            assignment.PatrolRequest.Status = "Закрыта";
        }

        assignment.StartedAt ??= assignment.PlannedAt <= actualAt ? assignment.PlannedAt : actualAt;
        assignment.FinishedAt = actualAt;
        assignment.ProgressPercent = 100;
        assignment.LockVersion++;
        UpsertPatrolResult(assignment, request, actualAt, DateTimeOffset.UtcNow);
        dbContext.SaveChanges();

        return new AssignmentCommandResult(MapAssignment(assignment), true, "Назначение завершено.");
    }

    private IQueryable<AssignmentEntity> GetAssignmentQuery() =>
        dbContext.Assignments
            .AsNoTracking()
            .Include(assignment => assignment.Employee)
            .Include(assignment => assignment.Route)
            .Include(assignment => assignment.PatrolRequest);

    private AssignmentEntity? FindAssignment(Guid id) =>
        dbContext.Assignments
            .Include(assignment => assignment.Employee)
            .Include(assignment => assignment.Route)
            .ThenInclude(route => route!.Points)
            .Include(assignment => assignment.PatrolRequest)
            .FirstOrDefault(assignment => assignment.Id == id);

    private AssignmentEntity? FindReusableAssignment(
        CreateAssignmentDto request,
        PatrolRequestEntity? patrolRequest,
        EmployeeEntity? employee,
        RouteEntity? route)
    {
        if (request.PatrolRequestId is null || patrolRequest is null || employee is null || route is null)
        {
            return null;
        }

        var assignment = dbContext.Assignments
            .Include(item => item.Employee)
            .Include(item => item.Route)
            .Include(item => item.PatrolRequest)
            .FirstOrDefault(item =>
                item.PatrolRequestId == request.PatrolRequestId.Value
                && item.Status != AssignmentStatusValues.Completed
                && item.Status != AssignmentStatusValues.Cancelled);

        if (assignment is null || assignment.EmployeeId != employee.Id || assignment.RouteId != route.Id)
        {
            return null;
        }

        return assignment;
    }

    private void UpsertPatrolResult(
        AssignmentEntity assignment,
        CompleteAssignmentDto request,
        DateTimeOffset actualAt,
        DateTimeOffset operationAt)
    {
        if (request.PointResults is { Count: > 0 })
        {
            UpsertPatrolPointResults(assignment, request, actualAt, operationAt);
            return;
        }

        var status = NormalizeResultStatus(request.Status);
        var selectedPoint = assignment.Route?.Points
            .OrderBy(point => point.SequenceNo)
            .FirstOrDefault(point => request.RoutePointId is not null && point.Id == request.RoutePointId.Value)
            ?? assignment.Route?.Points.OrderBy(point => point.SequenceNo).FirstOrDefault();
        var issueType = NormalizeOptionalText(request.IssueType, "-");
        var severity = NormalizeOptionalText(request.Severity, status == "Замечание" ? "Средняя" : "-");
        var result = dbContext.PatrolResults
            .Include(item => item.Issues)
            .Include(item => item.Attachments)
            .FirstOrDefault(item => item.AssignmentId == assignment.Id);

        if (result is null)
        {
            result = new PatrolResultEntity
            {
                Id = Guid.NewGuid(),
                AssignmentId = assignment.Id,
                CreatedAt = operationAt
            };
            dbContext.PatrolResults.Add(result);
        }
        else
        {
            dbContext.Set<PatrolResultIssueEntity>().RemoveRange(result.Issues);
            dbContext.Set<PatrolResultAttachmentEntity>().RemoveRange(result.Attachments);
        }

        result.AssignmentId = assignment.Id;
        result.EmployeeId = assignment.EmployeeId;
        result.RouteId = assignment.RouteId;
        result.RoutePointId = selectedPoint?.Id;
        result.Status = status;
        result.PointName = selectedPoint?.Name ?? assignment.Route?.Name ?? string.Empty;
        result.EmployeeName = assignment.Employee?.FullName ?? assignment.PatrolRequest?.EmployeeName ?? string.Empty;
        result.RouteName = assignment.Route?.Name ?? assignment.PatrolRequest?.RouteName ?? string.Empty;
        result.Territory = assignment.Route?.Territory ?? string.Empty;
        result.Shift = assignment.Shift;
        result.PlannedAt = assignment.PlannedAt;
        result.ActualAt = actualAt;
        result.Deviation = FormatDeviation(assignment.PlannedAt, actualAt);
        result.Comment = NormalizeOptionalText(request.Comment);
        result.IssueType = issueType;
        result.Severity = severity;
        result.Photos = Math.Max(Math.Max(0, request.Photos), request.PhotoAttachments?.Count ?? 0);

        if (status == "Замечание")
        {
            result.Issues.Add(new PatrolResultIssueEntity
            {
                Id = Guid.NewGuid(),
                Type = issueType,
                Severity = severity,
                Message = NormalizeOptionalText(request.Comment),
                CreatedAt = operationAt
            });
        }

        AddPatrolResultAttachments(result, request.PhotoAttachments, operationAt);
    }

    private void UpsertPatrolPointResults(
        AssignmentEntity assignment,
        CompleteAssignmentDto request,
        DateTimeOffset actualAt,
        DateTimeOffset operationAt)
    {
        var existingResults = dbContext.PatrolResults
            .Include(item => item.Issues)
            .Where(item => item.AssignmentId == assignment.Id)
            .ToList();
        dbContext.Set<PatrolResultIssueEntity>().RemoveRange(existingResults.SelectMany(result => result.Issues));
        dbContext.PatrolResults.RemoveRange(existingResults);

        var routePoints = assignment.Route?.Points.OrderBy(point => point.SequenceNo).ToDictionary(point => point.Id) ?? [];
        foreach (var pointResult in request.PointResults ?? [])
        {
            routePoints.TryGetValue(pointResult.RoutePointId, out var selectedPoint);
            var status = NormalizeResultStatus(pointResult.Status);
            var issueType = NormalizeOptionalText(pointResult.IssueType, "-");
            var severity = NormalizeOptionalText(pointResult.Severity, status == "Замечание" ? "Средняя" : "-");
            var comment = NormalizeOptionalText(pointResult.Comment, request.Comment ?? string.Empty);
            var result = new PatrolResultEntity
            {
                Id = Guid.NewGuid(),
                AssignmentId = assignment.Id,
                CreatedAt = operationAt,
                EmployeeId = assignment.EmployeeId,
                RouteId = assignment.RouteId,
                RoutePointId = selectedPoint?.Id,
                Status = status,
                PointName = selectedPoint?.Name ?? assignment.Route?.Name ?? string.Empty,
                EmployeeName = assignment.Employee?.FullName ?? assignment.PatrolRequest?.EmployeeName ?? string.Empty,
                RouteName = assignment.Route?.Name ?? assignment.PatrolRequest?.RouteName ?? string.Empty,
                Territory = assignment.Route?.Territory ?? string.Empty,
                Shift = assignment.Shift,
                PlannedAt = assignment.PlannedAt,
                ActualAt = actualAt,
                Deviation = FormatDeviation(assignment.PlannedAt, actualAt),
                Comment = comment,
                IssueType = issueType,
                Severity = severity,
                Photos = Math.Max(Math.Max(0, pointResult.Photos), pointResult.PhotoAttachments?.Count ?? 0)
            };

            if (status == "Замечание")
            {
                result.Issues.Add(new PatrolResultIssueEntity
                {
                    Id = Guid.NewGuid(),
                    Type = issueType,
                    Severity = severity,
                    Message = comment,
                    CreatedAt = operationAt
                });
            }

            AddPatrolResultAttachments(result, pointResult.PhotoAttachments, operationAt);
            dbContext.PatrolResults.Add(result);
        }
    }

    private static Dictionary<string, string[]> ValidateCompleteAssignment(
        CompleteAssignmentDto? request,
        IEnumerable<RoutePointEntity>? routePoints = null)
    {
        var errors = new Dictionary<string, string[]>();
        if (request is null)
        {
            errors["result"] = ["Заполните результат обхода."];
            return errors;
        }

        if (request.ActualAt is null || request.ActualAt == default)
        {
            errors["actualAt"] = ["Укажите фактическое время обхода."];
        }

        if (string.IsNullOrWhiteSpace(request.Status))
        {
            errors["status"] = ["Выберите статус результата."];
        }

        var status = NormalizeResultStatus(request.Status);
        if (string.IsNullOrWhiteSpace(request.Comment))
        {
            errors["comment"] = ["Заполните комментарий по результату обхода."];
        }

        if (status == "Замечание" && string.IsNullOrWhiteSpace(request.IssueType))
        {
            errors["issueType"] = ["Укажите тип замечания."];
        }

        var routePointList = routePoints?.OrderBy(point => point.SequenceNo).ToList() ?? [];
        var requiredRoutePoints = routePointList.Where(point => point.IsRequired).ToList();
        if (requiredRoutePoints.Count > 0 && request.PointResults is not { Count: > 0 })
        {
            errors["pointResults"] = ["Заполните чек-лист обязательных точек маршрута перед завершением обхода."];
        }

        if (request.PointResults is { Count: > 0 })
        {
            AddPhotoAttachmentErrors(errors, "photoAttachments", request.PhotoAttachments);

            var knownPointIds = routePointList.Select(point => point.Id).ToHashSet();
            var duplicatePointIds = request.PointResults
                .GroupBy(point => point.RoutePointId)
                .Where(group => group.Count() > 1)
                .ToList();
            if (duplicatePointIds.Count > 0)
            {
                errors["pointResults"] = ["Точки маршрута не должны дублироваться."];
            }

            var hasUnknownPoint = request.PointResults.Any(point => !knownPointIds.Contains(point.RoutePointId));
            if (hasUnknownPoint)
            {
                errors["routePointId"] = ["В чек-листе есть точка не из этого маршрута."];
            }

            var submittedPointIds = request.PointResults.Select(point => point.RoutePointId).ToHashSet();
            var missingRequired = routePointList
                .Where(point => point.IsRequired && !submittedPointIds.Contains(point.Id))
                .Select(point => point.Name)
                .ToList();
            if (missingRequired.Count > 0)
            {
                errors["pointResults"] = [$"Заполните все обязательные точки: {string.Join(", ", missingRequired)}."];
            }

            var missingRequiredPhotos = routePointList
                .Where(point => point.RequiresPhoto)
                .Join(request.PointResults, point => point.Id, pointResult => pointResult.RoutePointId, (point, pointResult) => new { point, pointResult })
                .Where(item => item.pointResult.PhotoAttachments is not { Count: > 0 })
                .Select(item => item.point.Name)
                .ToList();
            if (missingRequiredPhotos.Count > 0)
            {
                errors["photos"] = [$"Для точек с фотофиксацией прикрепите файлы фото: {string.Join(", ", missingRequiredPhotos)}."];
            }

            for (var index = 0; index < request.PointResults.Count; index += 1)
            {
                AddPhotoAttachmentErrors(errors, $"pointResults[{index}].photoAttachments", request.PointResults[index].PhotoAttachments);
            }

            var pointIssueWithoutType = request.PointResults
                .Any(point => NormalizeResultStatus(point.Status) == "Замечание" && string.IsNullOrWhiteSpace(point.IssueType));
            if (pointIssueWithoutType)
            {
                errors["issueType"] = ["Для замечаний по точкам укажите тип замечания."];
            }
        }

        return errors;
    }

    private static void AddPhotoAttachmentErrors(
        Dictionary<string, string[]> errors,
        string field,
        IReadOnlyList<CompleteAssignmentPhotoDto>? attachments)
    {
        if (attachments is null || attachments.Count == 0)
        {
            return;
        }

        if (attachments.Count > 20)
        {
            errors[field] = ["За один результат можно прикрепить не больше 20 фото."];
            return;
        }

        for (var index = 0; index < attachments.Count; index += 1)
        {
            var attachment = attachments[index];
            var itemField = $"{field}[{index}]";
            if (string.IsNullOrWhiteSpace(attachment.FileName))
            {
                errors[itemField] = ["У файла фото должно быть имя."];
                continue;
            }

            var contentType = NormalizePhotoContentType(attachment.ContentType);
            if (!AllowedPatrolPhotoContentTypes.Contains(contentType, StringComparer.OrdinalIgnoreCase))
            {
                errors[itemField] = ["Разрешены только фото JPEG, PNG, WebP, HEIC или HEIF."];
                continue;
            }

            if (!TryDecodePhotoBase64(attachment.DataBase64, out var bytes))
            {
                errors[itemField] = ["Фото должно быть передано как base64."];
                continue;
            }

            if (bytes.Length == 0)
            {
                errors[itemField] = ["Фото не должно быть пустым."];
                continue;
            }

            if (bytes.Length > MaxPatrolPhotoSizeBytes)
            {
                errors[itemField] = ["Размер одного фото не должен превышать 10 МБ."];
            }
        }
    }

    private void AddPatrolResultAttachments(
        PatrolResultEntity result,
        IReadOnlyList<CompleteAssignmentPhotoDto>? attachments,
        DateTimeOffset operationAt)
    {
        if (attachments is null || attachments.Count == 0)
        {
            return;
        }

        var storageDirectory = Path.Combine(AppContext.BaseDirectory, "mobile-files");
        Directory.CreateDirectory(storageDirectory);

        foreach (var attachment in attachments)
        {
            if (!TryDecodePhotoBase64(attachment.DataBase64, out var bytes))
            {
                continue;
            }

            var fileName = SanitizeAttachmentFileName(attachment.FileName);
            var storageFileName = $"desktop-{result.Id:N}-{Guid.NewGuid():N}-{fileName}";
            File.WriteAllBytes(Path.Combine(storageDirectory, storageFileName), bytes);

            result.Attachments.Add(new PatrolResultAttachmentEntity
            {
                Id = Guid.NewGuid(),
                FileName = storageFileName,
                ContentType = NormalizePhotoContentType(attachment.ContentType),
                SizeBytes = bytes.LongLength,
                CreatedAt = operationAt
            });
        }
    }

    private static bool TryDecodePhotoBase64(string? value, out byte[] bytes)
    {
        bytes = [];
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var payload = value.Trim();
        var commaIndex = payload.IndexOf(',');
        if (payload.StartsWith("data:", StringComparison.OrdinalIgnoreCase) && commaIndex >= 0)
        {
            payload = payload[(commaIndex + 1)..];
        }

        try
        {
            bytes = Convert.FromBase64String(payload);
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
    }

    private static string NormalizePhotoContentType(string? value)
    {
        var contentType = NormalizeOptionalText(value, "application/octet-stream").ToLowerInvariant();
        return contentType == "image/jpg" ? "image/jpeg" : contentType;
    }

    private static string SanitizeAttachmentFileName(string value)
    {
        var fileName = Path.GetFileName(value);
        foreach (var character in Path.GetInvalidFileNameChars())
        {
            fileName = fileName.Replace(character, '-');
        }

        return string.IsNullOrWhiteSpace(fileName) ? "photo.jpg" : fileName;
    }

    private static string NormalizeResultStatus(string? status)
    {
        var value = NormalizeOptionalText(status, "Подтверждено");
        return value.Equals("ok", StringComparison.OrdinalIgnoreCase)
            || value.Equals("completed", StringComparison.OrdinalIgnoreCase)
            || value.Equals("success", StringComparison.OrdinalIgnoreCase)
            ? "Подтверждено"
            : value;
    }

    private static string FormatDeviation(DateTimeOffset plannedAt, DateTimeOffset actualAt)
    {
        var minutes = (int)Math.Round((actualAt - plannedAt).TotalMinutes);
        if (minutes == 0)
        {
            return "0 мин";
        }

        var sign = minutes > 0 ? "+" : "-";
        return $"{sign}{Math.Abs(minutes)} мин";
    }

    private Dictionary<string, string[]> ValidateCreateAssignment(
        CreateAssignmentDto request,
        PatrolRequestEntity? patrolRequest,
        EmployeeEntity? employee,
        RouteEntity? route)
    {
        var errors = new Dictionary<string, string[]>();

        if (request.PatrolRequestId is null || request.PatrolRequestId == Guid.Empty)
        {
            errors["patrolRequestId"] = ["Укажите заявку для назначения."];
        }
        else if (patrolRequest is null)
        {
            errors["patrolRequestId"] = ["Заявка не найдена."];
        }
        else if (IsClosedPatrolRequestStatus(patrolRequest.Status))
        {
            errors["patrolRequestId"] = ["Закрытую или отмененную заявку нельзя назначить повторно."];
        }
        else if (dbContext.Assignments.Any(assignment => assignment.PatrolRequestId == request.PatrolRequestId.Value))
        {
            errors["patrolRequestId"] = ["Для заявки уже есть назначение."];
        }

        if (request.EmployeeId is null || request.EmployeeId == Guid.Empty)
        {
            errors["employeeId"] = ["Выберите сотрудника."];
        }
        else if (employee is null)
        {
            errors["employeeId"] = ["Сотрудник не найден."];
        }

        if (request.RouteId is null || request.RouteId == Guid.Empty)
        {
            errors["routeId"] = ["Выберите маршрут."];
        }
        else if (route is null)
        {
            errors["routeId"] = ["Маршрут не найден или перенесен в архив."];
        }
        else if (!RouteHasActivePoints(route.Id))
        {
            errors["routeId"] = ["В маршруте нет активных точек обхода."];
        }

        if (request.PlannedAt is null || request.PlannedAt == default)
        {
            errors["plannedAt"] = ["Укажите дату и время старта."];
        }
        else if (request.PlannedEndAt is not null && request.PlannedEndAt <= request.PlannedAt)
        {
            errors["plannedEndAt"] = ["Крайний срок выполнения должен быть позже времени старта."];
        }

        if (request.Comment?.Length > 300)
        {
            errors["comment"] = ["Комментарий не должен превышать 300 символов."];
        }

        if (request.NotificationText?.Length > 1000)
        {
            errors["notificationText"] = ["Уведомление не должно превышать 1000 символов."];
        }

        var shift = string.IsNullOrWhiteSpace(request.Shift) ? employee?.Shift : request.Shift;
        if (string.IsNullOrWhiteSpace(shift))
        {
            errors["shift"] = ["Укажите смену назначения."];
        }

        if (employee is not null && request.PlannedAt is not null && !string.IsNullOrWhiteSpace(shift))
        {
            AddEmployeeAssignmentConflictError(errors, "employeeId", employee.Id, request.PlannedAt.Value, shift);
        }

        return errors;
    }

    private void AddEmployeeAssignmentConflictError(
        Dictionary<string, string[]> errors,
        string fieldName,
        Guid employeeId,
        DateTimeOffset plannedAt,
        string shift)
    {
        var plannedDateStart = new DateTimeOffset(plannedAt.Year, plannedAt.Month, plannedAt.Day, 0, 0, 0, plannedAt.Offset).ToUniversalTime();
        var plannedDateEnd = plannedDateStart.AddDays(1);
        var hasEmployeeConflict = dbContext.Assignments.Any(assignment =>
            assignment.EmployeeId == employeeId
            && assignment.Status != AssignmentStatusValues.Completed
            && assignment.Status != AssignmentStatusValues.Cancelled
            && assignment.Shift == shift
            && assignment.PlannedAt >= plannedDateStart
            && assignment.PlannedAt < plannedDateEnd);

        if (hasEmployeeConflict)
        {
            errors[fieldName] = ["У сотрудника уже есть активное назначение на эту смену."];
        }
    }

    private static bool IsClosedPatrolRequestStatus(string status)
    {
        var normalized = status.Trim();
        return normalized == "Закрыта"
            || normalized == "Закрыто"
            || normalized == "Завершена"
            || normalized == "Завершено"
            || normalized == "Отменена"
            || normalized == AssignmentStatusValues.Completed
            || normalized == AssignmentStatusValues.Cancelled;
    }

    private static AssignmentDto MapAssignment(AssignmentEntity assignment) =>
        new(
            assignment.Id,
            assignment.PatrolRequestId,
            assignment.EmployeeId,
            assignment.Employee?.FullName ?? assignment.PatrolRequest?.EmployeeName ?? string.Empty,
            assignment.RouteId,
            assignment.Route?.Name ?? assignment.PatrolRequest?.RouteName ?? string.Empty,
            assignment.Shift,
            assignment.Status,
            assignment.PlannedAt,
            assignment.StartedAt,
            assignment.FinishedAt,
            assignment.ProgressPercent,
            assignment.PlannedAt.ToLocalTime().ToString("HH:mm"));

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
        dbContext.SaveChanges();

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
                Interval = NormalizeOptionalText(pointRequest.Interval, "00:10"),
                ExpectedTime = NormalizeOptionalText(pointRequest.ExpectedTime, "00:05"),
                Status = NormalizeOptionalText(pointRequest.Status, "Активна"),
                NfcCode = NormalizeOptionalText(pointRequest.Tag),
                IsRequired = IsActivePointStatus(pointRequest.Status),
                RequiresPhoto = pointRequest.RequiresPhoto
            };

            route.Points.Add(point);
        }

        route.VersionNo += points.Count;
        dbContext.SaveChanges();
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

        dbContext.SaveChanges();

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
        dbContext.SaveChanges();

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
            Interval = NormalizeOptionalText(request.Interval, "00:10"),
            ExpectedTime = NormalizeOptionalText(request.ExpectedTime, "00:05"),
            Status = NormalizeOptionalText(request.Status, "Активна"),
            NfcCode = NormalizeOptionalText(request.Tag),
            IsRequired = IsActivePointStatus(request.Status),
            RequiresPhoto = request.RequiresPhoto
        };

        dbContext.RoutePoints.Add(point);
        route.VersionNo += 1;
        dbContext.SaveChanges();

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
        point.Interval = NormalizeOptionalText(request.Interval, "00:10");
        point.ExpectedTime = NormalizeOptionalText(request.ExpectedTime, "00:05");
        point.Status = NormalizeOptionalText(request.Status, "Активна");
        point.NfcCode = NormalizeOptionalText(request.Tag);
        point.IsRequired = IsActivePointStatus(request.Status);
        point.RequiresPhoto = request.RequiresPhoto;
        route.VersionNo += 1;

        dbContext.SaveChanges();

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
        dbContext.SaveChanges();

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

        var ordered = route.Points.OrderBy(item => item.SequenceNo).ToList();
        ordered.Remove(point);
        var nextIndex = Math.Clamp(request.SequenceNo, 1, ordered.Count + 1) - 1;
        ordered.Insert(nextIndex, point);

        ReorderPoints(ordered);
        route.VersionNo += 1;
        dbContext.SaveChanges();

        return new UpdateRoutePointResult(MapRoute(route), MapRoutePoint(point), new Dictionary<string, string[]>());
    }

    public IReadOnlyList<EmployeeDto> GetEmployees() =>
        dbContext.Employees
            .AsNoTracking()
            .OrderBy(employee => employee.FullName)
            .AsEnumerable()
            .Select(employee => MapEmployee(employee))
            .ToList();

    public EmployeeDto? GetEmployee(Guid id)
    {
        var employee = dbContext.Employees.AsNoTracking().FirstOrDefault(item => item.Id == id);
        return employee is null ? null : MapEmployee(employee);
    }

    public CreateEmployeeResult CreateEmployee(CreateEmployeeDto request)
    {
        var errors = ValidateEmployee(request.FullName, request.PersonnelNo);
        AddPersonnelNoUniquenessError(errors, request.PersonnelNo);
        if (errors.Count > 0)
        {
            return new CreateEmployeeResult(null, errors);
        }

        var employee = new EmployeeEntity
        {
            Id = Guid.NewGuid(),
            FullName = request.FullName.Trim(),
            PersonnelNo = request.PersonnelNo.Trim(),
            Position = NormalizeOptionalText(request.Position, "Маршрутный обходчик"),
            Department = NormalizeOptionalText(request.Department, "Территория"),
            EmployeeGroup = NormalizeOptionalText(request.EmployeeGroup),
            HiredAt = request.HiredAt,
            BirthDate = request.BirthDate,
            Status = NormalizeOptionalText(request.Status, "Активен"),
            Shift = NormalizeOptionalText(request.Shift, "День"),
            HasMobileAccount = request.HasMobileAccount,
            LastSeenAt = DateTimeOffset.UtcNow
        };

        dbContext.Employees.Add(employee);
        dbContext.SaveChanges();

        return new CreateEmployeeResult(MapEmployee(employee), new Dictionary<string, string[]>());
    }

    public UpdateEmployeeResult UpdateEmployee(Guid id, UpdateEmployeeDto request)
    {
        var employee = dbContext.Employees.FirstOrDefault(item => item.Id == id);
        if (employee is null)
        {
            return new UpdateEmployeeResult(null, new Dictionary<string, string[]> { ["employee"] = ["Сотрудник не найден."] });
        }

        var errors = ValidateEmployee(request.FullName, request.PersonnelNo);
        AddPersonnelNoUniquenessError(errors, request.PersonnelNo, id);
        if (errors.Count > 0)
        {
            return new UpdateEmployeeResult(null, errors);
        }

        employee.FullName = request.FullName.Trim();
        employee.PersonnelNo = request.PersonnelNo.Trim();
        employee.Position = NormalizeOptionalText(request.Position, "Маршрутный обходчик");
        employee.Department = NormalizeOptionalText(request.Department, "Территория");
        employee.EmployeeGroup = NormalizeOptionalText(request.EmployeeGroup);
        employee.HiredAt = request.HiredAt;
        employee.BirthDate = request.BirthDate;
        employee.Status = NormalizeOptionalText(request.Status, "Активен");
        employee.Shift = NormalizeOptionalText(request.Shift, "День");
        employee.HasMobileAccount = request.HasMobileAccount;
        employee.LastSeenAt = DateTimeOffset.UtcNow;

        dbContext.SaveChanges();

        return new UpdateEmployeeResult(MapEmployee(employee), new Dictionary<string, string[]>());
    }

    public bool DeleteEmployee(Guid id)
    {
        var employee = dbContext.Employees.FirstOrDefault(item => item.Id == id);
        if (employee is null)
        {
            return false;
        }

        employee.Status = "Офлайн";
        employee.HasMobileAccount = false;
        employee.LastSeenAt = DateTimeOffset.UtcNow;
        dbContext.SaveChanges();

        return true;
    }

    public IReadOnlyList<MobileAccountDto> GetAccounts() =>
        dbContext.MobileAccounts
            .AsNoTracking()
            .Include(account => account.EmployeeBindings)
            .OrderBy(account => account.Login)
            .AsEnumerable()
            .Select(account => MapMobileAccount(account))
            .ToList();

    public MobileAccountDto? GetAccount(Guid id)
    {
        var account = dbContext.MobileAccounts
            .AsNoTracking()
            .Include(item => item.EmployeeBindings)
            .FirstOrDefault(item => item.Id == id);
        return account is null ? null : MapMobileAccount(account);
    }

    public CreateMobileAccountResult CreateAccount(CreateMobileAccountDto request)
    {
        var errors = ValidateMobileAccount(request);
        var employeeScope = NormalizeEmployeeScope(request.EmployeeScope);
        var boundEmployees = employeeScope == "all" ? [] : NormalizeEmployeeNames(request.Employee);
        var login = MakeMobileLogin(request.Login, request.Employee, dbContext.MobileAccounts.Select(account => account.Login));

        if (errors.Count == 0 && dbContext.MobileAccounts.Any(account => account.Login == login))
        {
            errors["login"] = ["Мобильный аккаунт с таким логином уже есть."];
        }

        if (errors.Count > 0)
        {
            return new CreateMobileAccountResult(null, null, errors);
        }

        var shouldBind = employeeScope == "all" || (request.BindEmployee && boundEmployees.Length > 0);
        var explicitPassword = NormalizeOptionalText(request.Password);
        var hasExplicitPassword = !string.IsNullOrWhiteSpace(explicitPassword);
        var temporaryPassword = !hasExplicitPassword && request.TemporaryPassword ? CreateTemporaryPassword() : null;
        var passwordForHash = hasExplicitPassword ? explicitPassword : temporaryPassword ?? CreateTemporaryPassword();
        var now = DateTimeOffset.UtcNow;
        var accountEntity = new MobileAccountEntity
        {
            Id = Guid.NewGuid(),
            Login = login,
            EmployeeScope = employeeScope,
            BoundEmployees = shouldBind ? boundEmployees : [],
            Role = NormalizeOptionalText(request.Role, "Маршрутный обходчик"),
            Status = NormalizeCreateMobileAccountStatus(request.Status, shouldBind),
            Session = "-",
            LastSeenAt = null,
            Device = (request.RestrictToLinkedDevices ?? request.RestrictToBoundDevice) ? "Ожидает привязки" : "Любое устройство",
            Version = "-",
            CreatedAt = now,
            PasswordHash = string.Empty,
            PasswordResetRequired = request.RequirePasswordChange ?? !hasExplicitPassword,
            LastPasswordResetAt = temporaryPassword is null ? null : now
        };
        accountEntity.PasswordHash = MobilePasswordHasher.HashPassword(accountEntity, passwordForHash);
        AddInitialMobileAccountBindings(accountEntity);

        dbContext.MobileAccounts.Add(accountEntity);
        AddMobileAccountAuditEvent(
            accountEntity.Id,
            temporaryPassword is null ? "mobile_account.created_without_password" : "mobile_account.created_with_temporary_password",
            temporaryPassword is null ? "Account created; password must be set before first login." : "Temporary password generated and returned once.");
        SyncEmployeeMobileFlags(accountEntity);
        dbContext.SaveChanges();

        return new CreateMobileAccountResult(MapMobileAccount(accountEntity), temporaryPassword, new Dictionary<string, string[]>());
    }

    public UpdateMobileAccountResult UpdateAccount(Guid id, UpdateMobileAccountDto request)
    {
        var account = dbContext.MobileAccounts
            .Include(item => item.EmployeeBindings)
            .FirstOrDefault(item => item.Id == id);
        if (account is null)
        {
            return MissingMobileAccountResult();
        }

        var errors = ValidateUpdateMobileAccount(id, request);
        if (errors.Count > 0)
        {
            return new UpdateMobileAccountResult(null, errors);
        }

        var nextStatus = NormalizeOptionalText(request.Status);
        account.Login = NormalizeLogin(request.Login);
        account.Role = NormalizeOptionalText(request.Role);
        account.Status = nextStatus;

        if (nextStatus == "Не привязан")
        {
            DetachAllBindings(account);
        }

        AddMobileAccountAuditEvent(account.Id, "mobile_account.updated", "Login, role or status updated.");
        SyncMobileAccountDerivedState(account);
        SaveChangesAndRebuildEmployeeMobileFlags();

        return new UpdateMobileAccountResult(MapMobileAccount(account), new Dictionary<string, string[]>());
    }

    public UpdateMobileAccountResult AttachEmployee(Guid id, AttachMobileAccountEmployeeDto request)
    {
        var account = dbContext.MobileAccounts
            .Include(item => item.EmployeeBindings)
            .FirstOrDefault(item => item.Id == id);
        if (account is null)
        {
            return MissingMobileAccountResult();
        }

        var employee = ResolveMobileBindingEmployee(request);
        if (employee is null)
        {
            return new UpdateMobileAccountResult(null, new Dictionary<string, string[]>
            {
                ["employeeId"] = ["Выберите сотрудника из справочника."],
            });
        }

        var activeBindings = GetActiveBindings(account).ToList();
        var displayNames = GetDisplayBoundEmployeeNames(account);
        var isAlreadyBound = activeBindings.Any(binding => binding.EmployeeId == employee.Id)
            || displayNames.Contains(employee.FullName, StringComparer.OrdinalIgnoreCase);
        if (displayNames.Length >= 5 && !isAlreadyBound)
        {
            return new UpdateMobileAccountResult(null, new Dictionary<string, string[]>
            {
                ["employeeId"] = ["К одному мобильному аккаунту можно привязать до 5 сотрудников."],
            });
        }

        account.EmployeeScope = "selected";
        var existingBinding = account.EmployeeBindings.FirstOrDefault(binding => binding.EmployeeId == employee.Id);
        if (existingBinding is null)
        {
            var binding = new MobileAccountEmployeeBindingEntity
            {
                Id = Guid.NewGuid(),
                MobileAccountId = account.Id,
                EmployeeId = employee.Id,
                DisplayName = employee.FullName,
                CreatedAt = DateTimeOffset.UtcNow
            };
            account.EmployeeBindings.Add(binding);
            dbContext.Entry(binding).State = EntityState.Added;
        }
        else
        {
            existingBinding.DisplayName = employee.FullName;
            existingBinding.DetachedAt = null;
        }

        if (account.Status != "Заблокирован")
        {
            account.Status = "Активен";
        }

        AddMobileAccountAuditEvent(account.Id, "mobile_account.employee_attached", $"Employee {employee.Id} attached.");
        SyncMobileAccountDerivedState(account);
        SaveChangesAndRebuildEmployeeMobileFlags();

        return new UpdateMobileAccountResult(MapMobileAccount(account), new Dictionary<string, string[]>());
    }

    public UpdateMobileAccountResult DetachEmployee(Guid id, Guid employeeId)
    {
        var account = dbContext.MobileAccounts
            .Include(item => item.EmployeeBindings)
            .FirstOrDefault(item => item.Id == id);
        if (account is null)
        {
            return MissingMobileAccountResult();
        }

        var binding = GetActiveBindings(account).FirstOrDefault(item => item.EmployeeId == employeeId);
        if (binding is null)
        {
            var employee = dbContext.Employees.FirstOrDefault(item => item.Id == employeeId);
            if (employee is null || !account.BoundEmployees.Contains(employee.FullName, StringComparer.OrdinalIgnoreCase))
            {
                return new UpdateMobileAccountResult(null, new Dictionary<string, string[]>
                {
                    ["employeeId"] = ["Сотрудник не привязан к этому аккаунту."],
                });
            }

            account.BoundEmployees = account.BoundEmployees
                .Where(name => !string.Equals(name, employee.FullName, StringComparison.OrdinalIgnoreCase))
                .ToArray();
        }
        else
        {
            binding.DetachedAt = DateTimeOffset.UtcNow;
        }

        AddMobileAccountAuditEvent(account.Id, "mobile_account.employee_detached", $"Employee {employeeId} detached.");
        SyncMobileAccountDerivedState(account);
        if (account.Status == "Активен" && GetActiveBindings(account).Count == 0)
        {
            account.Status = "Не привязан";
        }

        SaveChangesAndRebuildEmployeeMobileFlags();

        return new UpdateMobileAccountResult(MapMobileAccount(account), new Dictionary<string, string[]>());
    }

    public UpdateMobileAccountResult BlockAccount(Guid id)
    {
        var account = dbContext.MobileAccounts
            .Include(item => item.EmployeeBindings)
            .FirstOrDefault(item => item.Id == id);
        if (account is null)
        {
            return MissingMobileAccountResult();
        }

        account.Status = "Заблокирован";
        account.Session = "-";
        AddMobileAccountAuditEvent(account.Id, "mobile_account.blocked", "Mobile account blocked.");
        dbContext.SaveChanges();

        return new UpdateMobileAccountResult(MapMobileAccount(account), new Dictionary<string, string[]>());
    }

    public UpdateMobileAccountResult UnblockAccount(Guid id)
    {
        var account = dbContext.MobileAccounts
            .Include(item => item.EmployeeBindings)
            .FirstOrDefault(item => item.Id == id);
        if (account is null)
        {
            return MissingMobileAccountResult();
        }

        account.Status = account.EmployeeScope == "all" || GetDisplayBoundEmployeeNames(account).Length > 0 ? "Активен" : "Не привязан";
        AddMobileAccountAuditEvent(account.Id, "mobile_account.unblocked", "Mobile account unblocked.");
        dbContext.SaveChanges();

        return new UpdateMobileAccountResult(MapMobileAccount(account), new Dictionary<string, string[]>());
    }

    public ResetMobileAccountPasswordDto? ResetPassword(Guid id)
    {
        var account = dbContext.MobileAccounts.FirstOrDefault(item => item.Id == id);
        if (account is null)
        {
            return null;
        }

        var password = CreateTemporaryPassword();
        account.PasswordHash = MobilePasswordHasher.HashPassword(account, password);
        account.PasswordResetRequired = true;
        account.LastPasswordResetAt = DateTimeOffset.UtcNow;
        AddMobileAccountAuditEvent(account.Id, "mobile_account.password_reset", "Temporary password generated and returned once.");
        dbContext.SaveChanges();

        return new ResetMobileAccountPasswordDto(password, account.LastPasswordResetAt.Value);
    }

    public bool DeleteAccount(Guid id)
    {
        var account = dbContext.MobileAccounts.FirstOrDefault(item => item.Id == id);
        if (account is null)
        {
            return false;
        }

        AddMobileAccountAuditEvent(account.Id, "mobile_account.deleted", "Mobile account deleted.");
        dbContext.MobileAccounts.Remove(account);
        dbContext.SaveChanges();

        RebuildEmployeeMobileFlags();
        dbContext.SaveChanges();

        return true;
    }

    public IReadOnlyList<MobileAccountSessionDto> GetSessions(Guid id)
    {
        if (!dbContext.MobileAccounts.Any(account => account.Id == id))
        {
            return [];
        }

        return dbContext.MobileAccountSessions
            .AsNoTracking()
            .Where(session => session.MobileAccountId == id)
            .OrderByDescending(session => session.LastSeenAt)
            .Select(session => new MobileAccountSessionDto(
                session.Id,
                session.MobileAccountId,
                session.Status,
                session.DeviceId,
                session.Device,
                session.Platform,
                session.AppVersion,
                session.IpAddress,
                session.LastSeenAt))
            .ToList();
    }

    public IReadOnlyList<MobileAccountSecurityEventDto> GetSecurityEvents(Guid id)
    {
        if (!dbContext.MobileAccounts.Any(account => account.Id == id))
        {
            return [];
        }

        return dbContext.MobileAccountAuditEvents
            .AsNoTracking()
            .Where(auditEvent => auditEvent.MobileAccountId == id)
            .OrderByDescending(auditEvent => auditEvent.CreatedAt)
            .Select(auditEvent => new MobileAccountSecurityEventDto(
                auditEvent.Id,
                auditEvent.MobileAccountId,
                auditEvent.Action,
                auditEvent.Details,
                auditEvent.CreatedAt,
                auditEvent.Actor))
            .ToList();
    }

    public IReadOnlyList<PatrolRequestDto> GetRequests() =>
        dbContext.PatrolRequests
            .AsNoTracking()
            .OrderByDescending(request => request.CreatedAt)
            .AsEnumerable()
            .Select(request => MapPatrolRequest(request))
            .ToList();

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
            Status = "Назначена",
            CreatedAt = now,
            Description = NormalizeOptionalText(request.Description)
        };

        dbContext.PatrolRequests.Add(requestEntity);

        dbContext.Assignments.Add(new AssignmentEntity
        {
            Id = Guid.NewGuid(),
            PatrolRequestId = requestEntity.Id,
            EmployeeId = employee.Id,
            RouteId = route.Id,
            Shift = NormalizeOptionalText(request.Shift, employee.Shift),
            Status = request.NotifyEmployee ? AssignmentStatusValues.Waiting : AssignmentStatusValues.Assigned,
            PlannedAt = plannedAt!.Value,
            ProgressPercent = 0,
            LockVersion = 0
        });

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

        dbContext.SaveChanges();

        return new CreatePatrolRequestResult(MapPatrolRequest(requestEntity), new Dictionary<string, string[]>());
    }

    private int CalculateShiftCoveragePercent()
    {
        var employeesOnShift = dbContext.Employees.Count(employee => employee.Status == "На смене" || employee.Status == "Активен");
        if (employeesOnShift == 0)
        {
            return 0;
        }

        var assignedEmployees = dbContext.Assignments
            .Where(assignment => AssignmentStatusValues.Active.Contains(assignment.Status))
            .Select(assignment => assignment.EmployeeId)
            .Distinct()
            .Count();

        return Math.Clamp((int)Math.Round(assignedEmployees / (double)employeesOnShift * 100), 0, 100);
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
            && point.Status != "Черновик");

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

    private static Dictionary<string, string[]> ValidateEmployee(string? fullName, string? personnelNo)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(fullName))
        {
            errors["fullName"] = ["Укажите ФИО сотрудника."];
        }

        if (string.IsNullOrWhiteSpace(personnelNo))
        {
            errors["personnelNo"] = ["Укажите табельный номер сотрудника."];
        }

        return errors;
    }

    private void AddPersonnelNoUniquenessError(Dictionary<string, string[]> errors, string? personnelNo, Guid? employeeId = null)
    {
        if (string.IsNullOrWhiteSpace(personnelNo))
        {
            return;
        }

        var normalized = personnelNo.Trim();
        var exists = dbContext.Employees.Any(employee =>
            employee.PersonnelNo == normalized && (employeeId == null || employee.Id != employeeId.Value));
        if (exists)
        {
            errors["personnelNo"] = ["Сотрудник с таким табельным номером уже есть."];
        }
    }

    private static Dictionary<string, string[]> ValidateMobileAccount(CreateMobileAccountDto request)
    {
        var errors = new Dictionary<string, string[]>();
        var scope = NormalizeEmployeeScope(request.EmployeeScope);
        var login = NormalizeLogin(request.Login);
        var password = NormalizeOptionalText(request.Password);
        var hasExplicitPassword = !string.IsNullOrWhiteSpace(password);

        if (string.IsNullOrWhiteSpace(login))
        {
            errors["login"] = ["Введите логин"];
        }

        if (hasExplicitPassword && password.Length < 8)
        {
            errors["password"] = ["Пароль должен содержать минимум 8 символов"];
        }

        if (hasExplicitPassword && password != NormalizeOptionalText(request.ConfirmPassword))
        {
            errors["password"] = ["Пароли должны совпадать"];
        }

        if (!string.IsNullOrWhiteSpace(request.Status) && NormalizeCreateMobileAccountStatus(request.Status, shouldBind: true) == string.Empty)
        {
            errors["status"] = ["Некорректный статус аккаунта"];
        }

        if (!string.IsNullOrWhiteSpace(request.Language) && request.Language is not ("ru" or "en"))
        {
            errors["language"] = ["Некорректный язык интерфейса"];
        }

        if (scope != "all" && request.BindEmployee && NormalizeEmployeeNames(request.Employee).Length == 0)
        {
            errors["employee"] = ["Укажите сотрудника для привязки или выберите доступ ко всем сотрудникам."];
        }

        return errors;
    }

    private static string NormalizeCreateMobileAccountStatus(string? status, bool shouldBind)
    {
        var normalized = NormalizeOptionalText(status).ToLowerInvariant();
        return normalized switch
        {
            "" => shouldBind ? "Активен" : "Не привязан",
            "active" or "активен" => "Активен",
            "inactive" or "неактивен" or "не привязан" => "Не привязан",
            "blocked" or "заблокирован" => "Заблокирован",
            _ => string.Empty
        };
    }

    private Dictionary<string, string[]> ValidateUpdateMobileAccount(Guid accountId, UpdateMobileAccountDto request)
    {
        var errors = new Dictionary<string, string[]>();
        var login = NormalizeLogin(request.Login);
        var role = NormalizeOptionalText(request.Role);
        var status = NormalizeOptionalText(request.Status);

        if (string.IsNullOrWhiteSpace(login))
        {
            errors["login"] = ["Укажите логин мобильного аккаунта."];
        }
        else if (login.Length > 120)
        {
            errors["login"] = ["Логин мобильного аккаунта не должен быть длиннее 120 символов."];
        }
        else if (dbContext.MobileAccounts.Any(account => account.Id != accountId && account.Login == login))
        {
            errors["login"] = ["Мобильный аккаунт с таким логином уже есть."];
        }

        if (string.IsNullOrWhiteSpace(role))
        {
            errors["role"] = ["Укажите роль мобильного аккаунта."];
        }

        if (string.IsNullOrWhiteSpace(status) || !EditableMobileAccountStatuses.Contains(status))
        {
            errors["status"] = ["Выберите допустимый статус аккаунта."];
        }

        return errors;
    }

    private EmployeeEntity? ResolveMobileBindingEmployee(AttachMobileAccountEmployeeDto request)
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

    private static IReadOnlyList<MobileAccountEmployeeBindingEntity> GetActiveBindings(MobileAccountEntity account) =>
        account.EmployeeBindings
            .Where(binding => binding.DetachedAt is null)
            .OrderBy(binding => binding.CreatedAt)
            .ToList();

    private static string[] GetDisplayBoundEmployeeNames(MobileAccountEntity account)
    {
        var activeBindingNames = GetActiveBindings(account)
            .Select(binding => binding.DisplayName)
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return activeBindingNames.Length > 0 ? activeBindingNames : account.BoundEmployees;
    }

    private void AddInitialMobileAccountBindings(MobileAccountEntity account)
    {
        if (account.BoundEmployees.Length == 0)
        {
            return;
        }

        foreach (var employeeName in account.BoundEmployees)
        {
            var employee = dbContext.Employees.FirstOrDefault(item => item.FullName == employeeName);
            if (employee is null || account.EmployeeBindings.Any(binding => binding.EmployeeId == employee.Id))
            {
                continue;
            }

            account.EmployeeBindings.Add(new MobileAccountEmployeeBindingEntity
            {
                Id = Guid.NewGuid(),
                MobileAccountId = account.Id,
                EmployeeId = employee.Id,
                DisplayName = employee.FullName,
                CreatedAt = account.CreatedAt
            });
        }
    }

    private static void SyncMobileAccountDerivedState(MobileAccountEntity account)
    {
        account.BoundEmployees = GetDisplayBoundEmployeeNames(account);
        if (account.EmployeeScope != "all" && account.Status == "Активен" && account.BoundEmployees.Length == 0)
        {
            account.Status = "Не привязан";
        }
    }

    private static void DetachAllBindings(MobileAccountEntity account)
    {
        var detachedAt = DateTimeOffset.UtcNow;
        foreach (var binding in account.EmployeeBindings.Where(binding => binding.DetachedAt is null))
        {
            binding.DetachedAt = detachedAt;
        }
    }

    private static UpdateMobileAccountResult MissingMobileAccountResult() =>
        new(null, new Dictionary<string, string[]>
        {
            ["account"] = ["Мобильный аккаунт не найден."],
        });

    private static string NormalizeEmployeeScope(string? scope) =>
        string.Equals(scope, "all", StringComparison.OrdinalIgnoreCase) ? "all" : "selected";

    private static string[] NormalizeEmployeeNames(string? employee)
    {
        return NormalizeOptionalText(employee)
            .Split([',', ';', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static string MakeMobileLogin(string? requestedLogin, string? employee, IEnumerable<string> existingLogins)
    {
        var baseLogin = NormalizeLogin(requestedLogin);
        if (string.IsNullOrWhiteSpace(baseLogin))
        {
            baseLogin = NormalizeLogin(employee);
        }

        if (string.IsNullOrWhiteSpace(baseLogin))
        {
            baseLogin = "mobile";
        }

        var used = existingLogins.ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (!used.Contains(baseLogin))
        {
            return baseLogin;
        }

        var index = 2;
        var candidate = $"{baseLogin}{index}";
        while (used.Contains(candidate))
        {
            index += 1;
            candidate = $"{baseLogin}{index}";
        }

        return candidate;
    }

    private static string NormalizeLogin(string? value)
    {
        var chars = NormalizeOptionalText(value)
            .ToLowerInvariant()
            .Replace(' ', '.')
            .Where(character => char.IsAsciiLetterOrDigit(character) || character is '.' or '_' or '-')
            .ToArray();

        return new string(chars);
    }

    private void SyncEmployeeMobileFlags(MobileAccountEntity account)
    {
        if (account.EmployeeScope == "all")
        {
            foreach (var employee in dbContext.Employees.ToList())
            {
                employee.HasMobileAccount = true;
            }

            return;
        }

        var activeBindingEmployeeIds = GetActiveBindings(account)
            .Select(binding => binding.EmployeeId)
            .ToArray();
        if (activeBindingEmployeeIds.Length > 0)
        {
            foreach (var employee in dbContext.Employees.Where(employee => activeBindingEmployeeIds.Contains(employee.Id)).ToList())
            {
                employee.HasMobileAccount = true;
            }

            return;
        }

        foreach (var employee in dbContext.Employees.Where(employee => account.BoundEmployees.Contains(employee.FullName)).ToList())
        {
            employee.HasMobileAccount = true;
        }
    }

    private void RebuildEmployeeMobileFlags()
    {
        foreach (var employee in dbContext.Employees.ToList())
        {
            employee.HasMobileAccount = false;
        }

        foreach (var account in dbContext.MobileAccounts.Include(account => account.EmployeeBindings).ToList())
        {
            SyncEmployeeMobileFlags(account);
        }
    }

    private void SaveChangesAndRebuildEmployeeMobileFlags()
    {
        dbContext.SaveChanges();
        RebuildEmployeeMobileFlags();
        dbContext.SaveChanges();
    }

    private void AddMobileAccountAuditEvent(Guid accountId, string action, string details)
    {
        dbContext.MobileAccountAuditEvents.Add(new MobileAccountAuditEventEntity
        {
            Id = Guid.NewGuid(),
            MobileAccountId = accountId,
            Action = action,
            Details = details,
            Actor = "system",
            CreatedAt = DateTimeOffset.UtcNow
        });
    }

    private void AddMobileNotificationForEmployee(
        Guid employeeId,
        string type,
        string title,
        string message,
        string entityType,
        string entityId,
        string idempotencyKey)
    {
        var now = DateTimeOffset.UtcNow;
        var accounts = dbContext.MobileAccounts
            .Include(account => account.EmployeeBindings)
            .Include(account => account.Sessions)
            .Where(account => account.Status != "Заблокирован")
            .Where(account => account.EmployeeBindings.Any(binding => binding.EmployeeId == employeeId && binding.DetachedAt == null))
            .ToList();

        foreach (var account in accounts)
        {
            if (dbContext.MobileNotifications.Any(notification =>
                notification.MobileAccountId == account.Id && notification.IdempotencyKey == idempotencyKey))
            {
                continue;
            }

            var pushToken = account.Sessions
                .Where(session => session.RevokedAt == null && session.PushTokenRevokedAt == null)
                .OrderByDescending(session => session.PushTokenRegisteredAt)
                .Select(session => session.PushToken)
                .FirstOrDefault(token => !string.IsNullOrWhiteSpace(token)) ?? string.Empty;

            dbContext.MobileNotifications.Add(new MobileNotificationEntity
            {
                Id = Guid.NewGuid(),
                MobileAccountId = account.Id,
                EmployeeId = employeeId,
                Type = NormalizeOptionalText(type, "patrolRequest"),
                Title = NormalizeOptionalText(title, "Уведомление"),
                Message = NormalizeOptionalText(message, "Появилась новая заявка."),
                EntityType = NormalizeOptionalText(entityType),
                EntityId = NormalizeOptionalText(entityId),
                IdempotencyKey = NormalizeOptionalText(idempotencyKey),
                PushStatus = string.IsNullOrWhiteSpace(pushToken) ? "waitingSync" : "queued",
                PushTokenSnapshot = pushToken,
                CreatedAt = now
            });
        }
    }

    private static string CreateTemporaryPassword()
    {
        const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
        Span<byte> bytes = stackalloc byte[10];
        Random.Shared.NextBytes(bytes);

        return string.Create(bytes.Length, bytes.ToArray(), (chars, source) =>
        {
            for (var index = 0; index < source.Length; index += 1)
            {
                chars[index] = alphabet[source[index] % alphabet.Length];
            }
        });
    }

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
            point.RequiresPhoto);

    private static EmployeeDto MapEmployee(EmployeeEntity employee) =>
        new(
            employee.Id,
            employee.FullName,
            employee.PersonnelNo,
            employee.Position,
            employee.Department,
            employee.EmployeeGroup,
            employee.HiredAt,
            employee.BirthDate,
            employee.Status,
            employee.Shift,
            employee.HasMobileAccount,
            employee.LastSeenAt);

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
            request.Description);

    private static MobileAccountDto MapMobileAccount(MobileAccountEntity account)
    {
        var boundEmployeeIds = GetActiveBindings(account)
            .Select(binding => binding.EmployeeId)
            .ToList();
        var boundEmployees = GetDisplayBoundEmployeeNames(account);
        var employee = account.EmployeeScope == "all"
            ? "Все сотрудники"
            : boundEmployees.Length == 0
                ? "Не привязан"
                : boundEmployees.Length == 1
                    ? boundEmployees[0]
                    : $"{boundEmployees[0]} +{boundEmployees.Length - 1}";

        return new MobileAccountDto(
            account.Id,
            account.Login,
            account.PasswordResetRequired ? "Требует смены пароля" : "Пароль задан",
            employee,
            account.EmployeeScope,
            boundEmployeeIds,
            boundEmployees,
            account.Role,
            account.Status,
            account.Session,
            account.LastSeenAt?.ToLocalTime().ToString("dd.MM.yyyy HH:mm") ?? "Не входил",
            account.Device,
            account.Version);
    }

    private static string NormalizeOptionalText(string? value) =>
        NormalizeOptionalText(value, string.Empty);

    private static string NormalizeOptionalText(string? value, string fallback) =>
        string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();

    private static string BuildAssignmentNotificationText(string employeeName, string routeName, DateTimeOffset plannedAt) =>
        $"{employeeName}, назначен обход \"{routeName}\" на {plannedAt.ToLocalTime():dd.MM.yyyy HH:mm}. Подтвердите получение задания в мобильном приложении.";

    private static bool IsArchivedStatus(string? status) =>
        string.Equals(NormalizeOptionalText(status), "Архив", StringComparison.OrdinalIgnoreCase);

    private static bool IsActivePointStatus(string? status) =>
        !string.Equals(NormalizeOptionalText(status), "Черновик", StringComparison.OrdinalIgnoreCase);

    private static void ReorderPoints(IEnumerable<RoutePointEntity> points)
    {
        var index = 1;
        foreach (var point in points)
        {
            point.SequenceNo = index++;
        }
    }
}
