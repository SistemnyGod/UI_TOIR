using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Caching.Memory;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfPatrolStore
{
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
        var routePoints = GetCompletionRoutePoints(assignment)
            .Where(IsRoutePointVisibleForCompletion)
            .OrderBy(point => point.SequenceNo)
            .ToList() ?? [];
        var selectedPoint = routePoints
            .FirstOrDefault(point => request.RoutePointId is not null && point.Id == request.RoutePointId.Value)
            ?? routePoints.FirstOrDefault();
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
            TrackObsoleteAttachments(result.Attachments);
            dbContext.Set<PatrolResultIssueEntity>().RemoveRange(result.Issues);
            dbContext.Set<PatrolResultAttachmentEntity>().RemoveRange(result.Attachments);
        }

        result.AssignmentId = assignment.Id;
        result.EmployeeId = assignment.EmployeeId;
        result.RouteId = assignment.RouteId;
        result.RoutePointId = selectedPoint is not null && dbContext.RoutePoints.Any(point => point.Id == selectedPoint.Id)
            ? selectedPoint.Id
            : null;
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
            .Include(item => item.Attachments)
            .Where(item => item.AssignmentId == assignment.Id)
            .ToList();
        TrackObsoleteAttachments(existingResults.SelectMany(result => result.Attachments));
        dbContext.Set<PatrolResultIssueEntity>().RemoveRange(existingResults.SelectMany(result => result.Issues));
        dbContext.PatrolResults.RemoveRange(existingResults);

        var routePoints = GetCompletionRoutePoints(assignment)
            .Where(IsRoutePointVisibleForCompletion)
            .OrderBy(point => point.SequenceNo)
            .ToDictionary(point => point.Id) ?? [];
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
                RoutePointId = selectedPoint is not null && dbContext.RoutePoints.Any(point => point.Id == selectedPoint.Id)
                    ? selectedPoint.Id
                    : null,
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

        var routePointList = routePoints?
            .Where(IsRoutePointVisibleForCompletion)
            .OrderBy(point => point.SequenceNo)
            .ToList() ?? [];
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

        foreach (var attachment in attachments)
        {
            if (!TryDecodePhotoBase64(attachment.DataBase64, out var bytes))
            {
                continue;
            }

            var fileName = SanitizeAttachmentFileName(attachment.FileName);
            var storageFileName = $"desktop-{result.Id:N}-{Guid.NewGuid():N}-{fileName}";
            stagedAttachments.Add(attachmentStore.Stage(storageFileName, bytes));

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

    private void TrackObsoleteAttachments(IEnumerable<PatrolResultAttachmentEntity> attachments)
    {
        foreach (var attachment in attachments)
        {
            var storageKey = Path.GetFileName(attachment.FileName);
            if (!string.IsNullOrWhiteSpace(storageKey))
            {
                obsoleteAttachmentKeys.Add(storageKey);
            }
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

    private static bool IsRoutePointVisibleForCompletion(RoutePointEntity point) =>
        !point.Status.Equals("Черновик", StringComparison.OrdinalIgnoreCase)
        && !point.Status.Equals("Draft", StringComparison.OrdinalIgnoreCase);

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
}
