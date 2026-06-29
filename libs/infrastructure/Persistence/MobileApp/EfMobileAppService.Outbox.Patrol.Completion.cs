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

        var resultsByPoint = pointResults
            .GroupBy(result => result.PointId)
            .ToDictionary(group => group.Key, group => group.Last());
        foreach (var point in assignment.Route.Points.Where(point => point.IsRequired))
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
            if (assignment.Route.Points.All(point => point.Id != result.PointId))
            {
                return Conflict(command.ClientOperationId, "Point result does not belong to assignment route.");
            }

            if (result.Status.Equals("issue", StringComparison.OrdinalIgnoreCase)
                && string.IsNullOrWhiteSpace(result.Comment))
            {
                return Rejected(command.ClientOperationId, "Issue point result requires a comment.");
            }

            foreach (var clientFileId in result.PhotoClientFileIds)
            {
                var uploaded = dbContext.MobileUploadedFiles.Any(file =>
                    file.MobileAccountId == account.Id
                    && file.AssignmentId == assignment.Id
                    && file.PointId == result.PointId
                    && file.ClientFileId == clientFileId);
                if (!uploaded)
                {
                    return Rejected(command.ClientOperationId, "All attached photos must be uploaded before report submit.");
                }
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

        var submittedResults = pointResults.ToArray();

        if (submittedResults.Length != existingResults.Count)
        {
            return new ExistingCompleteReportValidation(true, false);
        }

        var submittedIssueCount = submittedResults.Count(item =>
            item.Status.Equals("issue", StringComparison.OrdinalIgnoreCase) || IsSkippedPointResult(item));
        var existingIssueCount = existingResults.Count(item => item.Status.Equals("issue", StringComparison.OrdinalIgnoreCase));
        if (submittedIssueCount != existingIssueCount)
        {
            return new ExistingCompleteReportValidation(true, false);
        }

        var submittedPointIds = submittedResults.Select(item => item.PointId).ToHashSet();
        var submittedAttachmentCount = dbContext.MobileUploadedFiles.Count(file =>
            file.MobileAccountId == account.Id
            && file.AssignmentId == assignment.Id
            && file.PointId != null
            && submittedPointIds.Contains(file.PointId.Value));
        var existingAttachmentCount = existingResults.Sum(item => item.Attachments.Count);
        if (submittedAttachmentCount != existingAttachmentCount)
        {
            return new ExistingCompleteReportValidation(true, false);
        }

        return new ExistingCompleteReportValidation(true, true);
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

        var routePointsById = assignment.Route?.Points.ToDictionary(point => point.Id) ?? [];
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
                RoutePointId = routePoint?.Id,
                Status = isIssue || isSkipped ? "issue" : "ok",
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
                Photos = pointResult.PhotoClientFileIds.Count,
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

            foreach (var file in uploadedFiles.Where(file => file.PointId == pointResult.PointId))
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

    private sealed record ExistingCompleteReportValidation(bool HasExistingReport, bool PayloadMatches);
}
