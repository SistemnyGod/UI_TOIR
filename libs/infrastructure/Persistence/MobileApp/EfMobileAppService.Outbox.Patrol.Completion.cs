using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;
namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfMobileAppService
{
    private MobileOutboxResponseDto ProcessCompletePatrolAssignment(MobileAccountEntity account, MobileOutboxCommandDto command)
    {
        var assignmentId = ReadGuid(command.Payload, "assignmentId");
        var requestId = ReadGuid(command.Payload, "requestId");
        var baseRevision = ReadLong(command.Payload, "baseRevision");
        var completedAtLocal = ReadDateTimeOffset(command.Payload, "completedAtLocal") ?? DateTimeOffset.UtcNow;
        var pointResults = ReadPointResults(command.Payload);
        if (assignmentId is null || requestId is null || pointResults.Count == 0)
        {
            return Rejected(command.ClientOperationId, "completePatrolAssignment payload is incomplete.");
        }

        var boundEmployeeIds = GetBoundEmployeeIds(account);
        var assignment = dbContext.Assignments
            .Include(item => item.PatrolRequest)
            .Include(item => item.Employee)
            .Include(item => item.Route)
                .ThenInclude(route => route!.Points)
            .Include(item => item.RouteRevision)
                .ThenInclude(revision => revision!.Points)
            .FirstOrDefault(item => item.Id == assignmentId.Value);
        if (assignment is null || assignment.Route is null || assignment.PatrolRequest is null)
        {
            return Conflict(command.ClientOperationId, "Assignment is not available.");
        }

        if (assignment.PatrolRequestId != requestId.Value || !boundEmployeeIds.Contains(assignment.EmployeeId))
        {
            return Conflict(command.ClientOperationId, "Assignment does not belong to this mobile account.");
        }

        var wasCancelledByDispatcher = assignment.Status == AssignmentStatusValues.Cancelled
            || assignment.PatrolRequest.Status == AssignmentStatusValues.Cancelled;

        if (!wasCancelledByDispatcher
            && (assignment.Status == AssignmentStatusValues.NeedsDispatcherDecision
            || assignment.PatrolRequest.Status == AssignmentStatusValues.NeedsDispatcherDecision)
        )
        {
            return Conflict(command.ClientOperationId, "Patrol request requires dispatcher decision.");
        }

        var duplicatePointIds = pointResults
            .GroupBy(result => result.PointId)
            .Where(group => group.Count() > 1)
            .ToArray();
        if (duplicatePointIds.Length > 0)
        {
            return Rejected(command.ClientOperationId, "Point results must not contain duplicate patrol points.");
        }

        var resultsByPoint = pointResults
            .GroupBy(result => result.PointId)
            .ToDictionary(group => group.Key, group => group.Last());
        var routePointsByIdForValidation = GetAssignedRoutePoints(assignment)
            .Where(IsMobileRoutePointVisible)
            .ToDictionary(point => point.Id);
        foreach (var point in routePointsByIdForValidation.Values.Where(point => point.IsRequired))
        {
            if (!resultsByPoint.TryGetValue(point.Id, out var result)
                || result.Status.Equals("deferred", StringComparison.OrdinalIgnoreCase)
                || result.Status.Equals("pending", StringComparison.OrdinalIgnoreCase))
            {
                return Rejected(command.ClientOperationId, "Required patrol points must be completed before report submit.");
            }
        }

        foreach (var result in pointResults)
        {
            if (!IsAllowedCompletePointStatus(result.Status))
            {
                return Rejected(command.ClientOperationId, "Point result status is not supported.");
            }

            if (!routePointsByIdForValidation.TryGetValue(result.PointId, out var routePoint))
            {
                return Conflict(command.ClientOperationId, "Point result does not belong to assignment route.");
            }

            if (result.Status.Equals("issue", StringComparison.OrdinalIgnoreCase)
                && string.IsNullOrWhiteSpace(result.Comment))
            {
                return Rejected(command.ClientOperationId, "Issue point result requires a comment.");
            }

            if (result.Status.Equals("issue", StringComparison.OrdinalIgnoreCase)
                && string.IsNullOrWhiteSpace(result.IssueTypeId))
            {
                return Rejected(command.ClientOperationId, "Issue point result requires an issue type.");
            }

            if (!wasCancelledByDispatcher && routePoint.RequiresPhoto && result.PhotoClientFileIds.Count == 0)
            {
                return Rejected(command.ClientOperationId, "Required photo point result must include at least one photo.");
            }

            var uploadedFilesForPoint = dbContext.MobileUploadedFiles
                .Where(file =>
                    file.MobileAccountId == account.Id
                    && file.AssignmentId == assignment.Id
                    && file.PointId == result.PointId)
                .ToArray();
            foreach (var clientFileId in result.PhotoClientFileIds)
            {
                var uploaded = uploadedFilesForPoint.Any(file => file.ClientFileId == clientFileId);
                if (!uploaded)
                {
                    return Rejected(command.ClientOperationId, "All attached photos must be uploaded before report submit.");
                }
            }

            if (!wasCancelledByDispatcher
                && routePoint.RequiresPhoto
                && !result.PhotoClientFileIds.Any(clientFileId => uploadedFilesForPoint.Any(file =>
                    file.ClientFileId == clientFileId
                    && file.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))))
            {
                return Rejected(command.ClientOperationId, "Required photo point result must include at least one image file.");
            }
        }

        var existingReportCheck = ValidateExistingCompleteReport(account, assignment, pointResults);
        if (existingReportCheck.HasExistingReport)
        {
            if (!existingReportCheck.PayloadMatches)
            {
                return Conflict(command.ClientOperationId, "Patrol assignment report was already accepted with different point results.");
            }

            return new MobileOutboxResponseDto(
                command.ClientOperationId,
                "duplicate",
                assignment.Id.ToString(),
                assignment.LockVersion,
                "Patrol assignment report was already accepted.",
                null,
                null);
        }

        if (!wasCancelledByDispatcher)
        {
            if (baseRevision is null)
            {
                return Rejected(command.ClientOperationId, "completePatrolAssignment baseRevision is required.");
            }

            if (baseRevision.Value != assignment.LockVersion)
            {
                return Conflict(command.ClientOperationId, "Patrol assignment was changed after mobile sync.");
            }

            if (assignment.RouteRevisionId is null
                && assignment.RouteVersionNo > 0
                && assignment.Route.VersionNo != assignment.RouteVersionNo)
            {
                return Conflict(command.ClientOperationId, "Patrol route was changed after assignment sync.");
            }
        }

        var now = DateTimeOffset.UtcNow;
        SaveMobilePointResults(account, assignment, pointResults, completedAtLocal, now);
        var startedAt = InferCompletedPatrolStartedAt(assignment, pointResults, completedAtLocal);

        if (wasCancelledByDispatcher)
        {
            assignment.Status = AssignmentStatusValues.Cancelled;
            assignment.StartedAt ??= startedAt;
            assignment.FinishedAt = completedAtLocal.ToUniversalTime();
            assignment.ProgressPercent = 100;
            assignment.LockVersion += 1;
            assignment.PatrolRequest.Status = AssignmentStatusValues.Cancelled;

            return new MobileOutboxResponseDto(
                command.ClientOperationId,
                "accepted",
                assignment.Id.ToString(),
                assignment.LockVersion,
                "Patrol assignment completed after dispatcher cancellation.",
                null,
                null);
        }

        assignment.Status = AssignmentStatusValues.Completed;
        assignment.StartedAt ??= startedAt;
        assignment.FinishedAt = completedAtLocal.ToUniversalTime();
        assignment.ProgressPercent = 100;
        assignment.LockVersion += 1;
        assignment.PatrolRequest.Status = AssignmentStatusValues.Completed;

        return new MobileOutboxResponseDto(
            command.ClientOperationId,
            "accepted",
            assignment.Id.ToString(),
            assignment.LockVersion,
            "Patrol assignment completed.",
            null,
            null);
    }

    private static DateTimeOffset InferCompletedPatrolStartedAt(
        AssignmentEntity assignment,
        IReadOnlyList<MobilePointResultPayload> pointResults,
        DateTimeOffset completedAtLocal)
    {
        var completedAt = completedAtLocal.ToUniversalTime();
        var firstPointAt = pointResults
            .Select(result => result.CompletedAtLocal?.ToUniversalTime())
            .Where(value => value is not null)
            .Min();

        if (firstPointAt is not null)
        {
            return firstPointAt.Value;
        }

        return assignment.PlannedAt <= completedAt ? assignment.PlannedAt : completedAt;
    }

    private ExistingCompleteReportValidation ValidateExistingCompleteReport(
        MobileAccountEntity account,
        AssignmentEntity assignment,
        IReadOnlyList<MobilePointResultPayload> pointResults)
    {
        var existingResults = dbContext.PatrolResults
            .Include(item => item.Attachments)
            .Where(item => item.AssignmentId == assignment.Id)
            .ToList();
        if (existingResults.Count == 0)
        {
            return new ExistingCompleteReportValidation(false, true);
        }

        var submittedSnapshots = BuildCompleteReportPayloadSnapshots(pointResults);
        var payloadMatches = dbContext.MobileOutboxOperations
            .AsNoTracking()
            .Where(operation =>
                operation.MobileAccountId == account.Id
                && operation.CommandType == "completePatrolAssignment"
                && operation.EntityServerId == assignment.Id.ToString()
                && (operation.Status == "accepted" || operation.Status == "duplicate"))
            .Select(operation => operation.PayloadJson)
            .AsEnumerable()
            .Any(payloadJson => CompleteReportPayloadMatches(submittedSnapshots, payloadJson));

        return new ExistingCompleteReportValidation(
            true,
            payloadMatches);
    }

    private static bool CompleteReportPayloadMatches(
        IReadOnlyList<CompletePointResultPayloadSnapshot> submittedSnapshots,
        string payloadJson)
    {
        try
        {
            var payload = JsonSerializer.Deserialize<Dictionary<string, object?>>(payloadJson, JsonOptions);
            if (payload is null)
            {
                return false;
            }

            var existingSnapshots = BuildCompleteReportPayloadSnapshots(ReadPointResults(payload));
            return CompleteReportPayloadSnapshotsMatch(submittedSnapshots, existingSnapshots);
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static IReadOnlyList<CompletePointResultPayloadSnapshot> BuildCompleteReportPayloadSnapshots(
        IReadOnlyList<MobilePointResultPayload> pointResults) =>
        pointResults
            .Select(pointResult => new CompletePointResultPayloadSnapshot(
                pointResult.PointId,
                NormalizeOptionalText(pointResult.Status),
                NormalizeOptionalText(pointResult.Comment),
                NormalizeOptionalText(pointResult.IssueTypeId),
                NormalizeOptionalText(pointResult.ConfirmationType),
                NormalizeOptionalText(pointResult.NfcUidHash),
                pointResult.PhotoClientFileIds
                    .Select(fileId => NormalizeOptionalText(fileId))
                    .Where(fileId => !string.IsNullOrWhiteSpace(fileId))
                    .OrderBy(fileId => fileId, StringComparer.Ordinal)
                    .ToArray()))
            .OrderBy(snapshot => snapshot.PointId)
            .ThenBy(snapshot => snapshot.Status, StringComparer.Ordinal)
            .ThenBy(snapshot => snapshot.Comment, StringComparer.Ordinal)
            .ThenBy(snapshot => snapshot.IssueType, StringComparer.Ordinal)
            .ThenBy(snapshot => snapshot.ConfirmationType, StringComparer.Ordinal)
            .ThenBy(snapshot => snapshot.NfcUidHash, StringComparer.Ordinal)
            .ToArray();

    private static bool CompleteReportPayloadSnapshotsMatch(
        IReadOnlyList<CompletePointResultPayloadSnapshot> submittedSnapshots,
        IReadOnlyList<CompletePointResultPayloadSnapshot> existingSnapshots)
    {
        if (submittedSnapshots.Count != existingSnapshots.Count)
        {
            return false;
        }

        for (var index = 0; index < submittedSnapshots.Count; index += 1)
        {
            var submitted = submittedSnapshots[index];
            var existing = existingSnapshots[index];
            if (submitted.PointId != existing.PointId
                || !submitted.Status.Equals(existing.Status, StringComparison.Ordinal)
                || !submitted.Comment.Equals(existing.Comment, StringComparison.Ordinal)
                || !submitted.IssueType.Equals(existing.IssueType, StringComparison.Ordinal)
                || !submitted.ConfirmationType.Equals(existing.ConfirmationType, StringComparison.Ordinal)
                || !submitted.NfcUidHash.Equals(existing.NfcUidHash, StringComparison.Ordinal)
                || !submitted.PhotoClientFileIds.SequenceEqual(existing.PhotoClientFileIds, StringComparer.Ordinal))
            {
                return false;
            }
        }

        return true;
    }

    private void SaveMobilePointResults(
        MobileAccountEntity account,
        AssignmentEntity assignment,
        IReadOnlyList<MobilePointResultPayload> pointResults,
        DateTimeOffset completedAtLocal,
        DateTimeOffset operationAt)
    {
        var existingResults = dbContext.PatrolResults
            .Include(item => item.Issues)
            .Include(item => item.Attachments)
            .Where(item => item.AssignmentId == assignment.Id)
            .ToList();
        dbContext.PatrolResultIssues.RemoveRange(existingResults.SelectMany(result => result.Issues));
        dbContext.PatrolResultAttachments.RemoveRange(existingResults.SelectMany(result => result.Attachments));
        dbContext.PatrolResults.RemoveRange(existingResults);

        var routePointsById = GetAssignedRoutePoints(assignment).ToDictionary(point => point.Id);
        var currentRoutePointIds = dbContext.RoutePoints
            .Where(point => point.RouteId == assignment.RouteId)
            .Select(point => point.Id)
            .ToHashSet();
        var uploadedFiles = dbContext.MobileUploadedFiles
            .Where(file => file.MobileAccountId == account.Id && file.AssignmentId == assignment.Id)
            .ToArray();

        foreach (var pointResult in pointResults)
        {
            routePointsById.TryGetValue(pointResult.PointId, out var routePoint);
            var actualAt = (pointResult.CompletedAtLocal ?? completedAtLocal).ToUniversalTime();
            var isIssue = pointResult.Status.Equals("issue", StringComparison.OrdinalIgnoreCase);
            var isSkipped = IsSkippedPointResult(pointResult);
            var isManual = IsManualPointResult(pointResult);
            var comment = NormalizeOptionalText(pointResult.Comment);
            var requestedPhotoClientFileIds = pointResult.PhotoClientFileIds
                .Select(fileId => NormalizeOptionalText(fileId))
                .Where(fileId => !string.IsNullOrWhiteSpace(fileId))
                .ToHashSet(StringComparer.Ordinal);
            var attachedFiles = uploadedFiles
                .Where(file => file.PointId == pointResult.PointId
                    && requestedPhotoClientFileIds.Contains(file.ClientFileId))
                .ToArray();
            var resultComment = isSkipped
                ? string.IsNullOrWhiteSpace(comment)
                    ? "Метка недоступна"
                    : $"Метка недоступна: {comment}"
                : isManual
                    ? string.IsNullOrWhiteSpace(comment)
                        ? "Заполнено вручную без сканирования"
                        : $"Заполнено вручную без сканирования: {comment}"
                : string.IsNullOrWhiteSpace(comment)
                    ? "-"
                    : comment;
            var resultEntity = new PatrolResultEntity
            {
                Id = Guid.NewGuid(),
                AssignmentId = assignment.Id,
                EmployeeId = assignment.EmployeeId,
                RouteId = assignment.RouteId,
                RoutePointId = routePoint is not null && currentRoutePointIds.Contains(routePoint.Id) ? routePoint.Id : null,
                Status = BuildMobilePointResultStatus(pointResult),
                PointName = routePoint?.Name ?? pointResult.PointId.ToString(),
                EmployeeName = assignment.Employee?.FullName ?? assignment.PatrolRequest?.EmployeeName ?? string.Empty,
                RouteName = assignment.Route?.Name ?? assignment.PatrolRequest?.RouteName ?? string.Empty,
                Territory = assignment.Route?.Territory ?? string.Empty,
                Shift = assignment.Shift,
                PlannedAt = assignment.PlannedAt,
                ActualAt = actualAt,
                Deviation = FormatDeviation(assignment.PlannedAt, actualAt),
                Comment = resultComment,
                IssueType = isSkipped
                    ? "Метка недоступна"
                    : isIssue
                        ? NormalizeOptionalText(pointResult.IssueTypeId, "issue")
                        : "-",
                Severity = isIssue || isSkipped ? "medium" : "-",
                Photos = attachedFiles.Length,
                CreatedAt = operationAt,
            };

            if (isIssue || isSkipped)
            {
                var issueType = isSkipped ? "Метка недоступна" : NormalizeOptionalText(pointResult.IssueTypeId, "issue");
                var issueComment = NormalizeOptionalText(
                    pointResult.Comment,
                    isSkipped ? "Метка утеряна или неисправна" : issueType);
                resultEntity.Issues.Add(new PatrolResultIssueEntity
                {
                    Id = Guid.NewGuid(),
                    Type = issueType,
                    Severity = "medium",
                    Message = issueComment,
                    CreatedAt = operationAt,
                });
            }

            foreach (var file in attachedFiles)
            {
                resultEntity.Attachments.Add(new PatrolResultAttachmentEntity
                {
                    Id = Guid.NewGuid(),
                    FileName = file.StorageFileName,
                    ContentType = file.ContentType,
                    SizeBytes = file.SizeBytes,
                    CreatedAt = file.UploadedAt,
                });
            }

            dbContext.PatrolResults.Add(resultEntity);
        }
    }

    private static string BuildPersistedMobilePointStatus(MobilePointResultPayload pointResult) =>
        pointResult.Status.Equals("issue", StringComparison.OrdinalIgnoreCase) || IsSkippedPointResult(pointResult)
            ? "issue"
            : "ok";

    private static string BuildPersistedMobilePointComment(MobilePointResultPayload pointResult)
    {
        var comment = NormalizeOptionalText(pointResult.Comment);
        if (IsSkippedPointResult(pointResult))
        {
            return string.IsNullOrWhiteSpace(comment)
                ? "РњРµС‚РєР° РЅРµРґРѕСЃС‚СѓРїРЅР°"
                : $"РњРµС‚РєР° РЅРµРґРѕСЃС‚СѓРїРЅР°: {comment}";
        }

        if (IsManualPointResult(pointResult))
        {
            return string.IsNullOrWhiteSpace(comment)
                ? "Р—Р°РїРѕР»РЅРµРЅРѕ РІСЂСѓС‡РЅСѓСЋ Р±РµР· СЃРєР°РЅРёСЂРѕРІР°РЅРёСЏ"
                : $"Р—Р°РїРѕР»РЅРµРЅРѕ РІСЂСѓС‡РЅСѓСЋ Р±РµР· СЃРєР°РЅРёСЂРѕРІР°РЅРёСЏ: {comment}";
        }

        return string.IsNullOrWhiteSpace(comment) ? "-" : comment;
    }

    private static string BuildPersistedMobilePointIssueType(MobilePointResultPayload pointResult)
    {
        if (IsSkippedPointResult(pointResult))
        {
            return "РњРµС‚РєР° РЅРµРґРѕСЃС‚СѓРїРЅР°";
        }

        return pointResult.Status.Equals("issue", StringComparison.OrdinalIgnoreCase)
            ? NormalizeOptionalText(pointResult.IssueTypeId, "issue")
            : "-";
    }

    private static string BuildPersistedMobilePointSeverity(MobilePointResultPayload pointResult) =>
        BuildPersistedMobilePointStatus(pointResult).Equals("issue", StringComparison.Ordinal)
            ? "medium"
            : "-";

    private static string BuildMobilePointResultStatus(MobilePointResultPayload pointResult)
    {
        if (IsSkippedPointResult(pointResult))
        {
            return "skipped";
        }

        if (pointResult.Status.Equals("issue", StringComparison.OrdinalIgnoreCase))
        {
            return "issue";
        }

        return IsManualPointResult(pointResult) ? "manual" : "ok";
    }

    private static bool IsAllowedCompletePointStatus(string status) =>
        status.Equals("ok", StringComparison.OrdinalIgnoreCase)
        || status.Equals("issue", StringComparison.OrdinalIgnoreCase)
        || status.Equals("skipped", StringComparison.OrdinalIgnoreCase);

    private sealed record ExistingCompleteReportValidation(bool HasExistingReport, bool PayloadMatches);

    private sealed record CompletePointResultPayloadSnapshot(
        Guid PointId,
        string Status,
        string Comment,
        string IssueType,
        string ConfirmationType,
        string NfcUidHash,
        IReadOnlyList<string> PhotoClientFileIds);

    private sealed record CompletePointResultSnapshot(
        Guid? PointId,
        string Status,
        string Comment,
        string IssueType,
        string Severity,
        IReadOnlyList<string> AttachmentFileNames);
}
