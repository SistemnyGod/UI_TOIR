using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

// Server side of mobile report auto-send (docs/mobile-report-autosend-2026-10-19.md):
// late report review queue, photos uploaded after the report, outbox heartbeat
// and the bootstrap settings the phone needs for its timers.
internal sealed partial class EfMobileAppService
{
    private const string AssignmentClosedReasonCode = "assignmentClosed";
    private const string AssignmentNeedsDecisionReasonCode = "assignmentNeedsDecision";
    private const string AssignmentNotInProgressReasonCode = "assignmentNotInProgress";
    private const string LateReportQueuedReasonCode = "lateReportQueued";
    private const string LateReportQueuedMessage = "Обход уже закрыт. Отчёт сохранён на сервере и передан диспетчеру на проверку.";
    private const int DefaultReportAutoSubmitDelayMinutes = 15;
    private const int DefaultPatrolDueGraceMinutes = 30;
    private const int DefaultHeartbeatIntervalSeconds = 300;
    private static readonly TimeSpan DefaultRouteDuration = TimeSpan.FromMinutes(30);

    private int ReportAutoSubmitDelayMinutes =>
        Math.Clamp(ReadIntSetting("Patrol360:Mobile:ReportAutoSubmitDelayMinutes", DefaultReportAutoSubmitDelayMinutes), 1, 24 * 60);

    // A negative value switches dueAt off.
    private int PatrolDueGraceMinutes =>
        Math.Min(ReadIntSetting("Patrol360:Mobile:PatrolDueGraceMinutes", DefaultPatrolDueGraceMinutes), 24 * 60);

    private int HeartbeatIntervalSeconds =>
        Math.Clamp(ReadIntSetting("Patrol360:Mobile:HeartbeatIntervalSeconds", DefaultHeartbeatIntervalSeconds), 60, 24 * 60 * 60);

    private int ReadIntSetting(string key, int fallback) =>
        int.TryParse(configuration[key], NumberStyles.Integer, CultureInfo.InvariantCulture, out var value) ? value : fallback;

    private DateTimeOffset? ComputePatrolDueAt(DateTimeOffset plannedAt, string? routeDuration)
    {
        var grace = PatrolDueGraceMinutes;
        if (grace < 0)
        {
            return null;
        }

        var duration = TimeSpan.TryParse(routeDuration, CultureInfo.InvariantCulture, out var parsed) && parsed > TimeSpan.Zero
            ? parsed
            : DefaultRouteDuration;
        return plannedAt + duration + TimeSpan.FromMinutes(grace);
    }

    private static bool IsLateReportReviewRequested(Dictionary<string, object?> payload) =>
        string.Equals(NormalizeOptionalText(ReadString(payload, "lateReportPolicy")), "review", StringComparison.OrdinalIgnoreCase);

    private static bool IsDeferredPhotoUploadRequested(Dictionary<string, object?> payload) =>
        string.Equals(NormalizeOptionalText(ReadString(payload, "photoUploadMode")), "deferred", StringComparison.OrdinalIgnoreCase);

    private static string? ReadReportSubmissionMode(Dictionary<string, object?> payload) =>
        NormalizeOptionalText(ReadString(payload, "submissionMode")).ToLowerInvariant() switch
        {
            "auto" => "auto",
            "manual" => "manual",
            _ => null
        };

    private MobileOutboxResponseDto QueueLateReport(
        MobileAccountEntity account,
        MobileOutboxCommandDto command,
        AssignmentEntity assignment,
        string reasonCode,
        IReadOnlyList<MobilePointResultPayload> pointResults,
        IReadOnlyList<PendingReportPhoto> missingPhotos,
        DateTimeOffset completedAtLocal,
        string? submissionMode)
    {
        var fingerprint = GetCompleteReportPayloadFingerprint(pointResults);
        var alreadyQueued = dbContext.PatrolLateReports
            .AsNoTracking()
            .Any(item => item.AssignmentId == assignment.Id
                && item.MobileAccountId == account.Id
                && item.PayloadFingerprint == fingerprint);
        if (alreadyQueued)
        {
            return new MobileOutboxResponseDto(
                command.ClientOperationId,
                "duplicate",
                assignment.Id.ToString(),
                assignment.LockVersion,
                LateReportQueuedMessage,
                null,
                null,
                LateReportQueuedReasonCode);
        }

        var now = DateTimeOffset.UtcNow;
        var lateReport = new PatrolLateReportEntity
        {
            Id = Guid.NewGuid(),
            AssignmentId = assignment.Id,
            MobileAccountId = account.Id,
            ClientOperationId = command.ClientOperationId,
            ReasonCode = reasonCode,
            AssignmentStatusAtReceipt = assignment.Status,
            SubmissionMode = submissionMode,
            PayloadJson = JsonSerializer.Serialize(command.Payload, JsonOptions),
            PayloadFingerprint = fingerprint,
            CompletedAtLocal = completedAtLocal.ToUniversalTime(),
            ReceivedAt = now,
            Status = "pending",
        };
        dbContext.PatrolLateReports.Add(lateReport);
        RegisterPendingReportPhotos(account.Id, assignment.Id, missingPhotos, lateReport.Id, now);

        return new MobileOutboxResponseDto(
            command.ClientOperationId,
            "accepted",
            assignment.Id.ToString(),
            assignment.LockVersion,
            LateReportQueuedMessage,
            null,
            null,
            LateReportQueuedReasonCode);
    }

    private void RegisterPendingReportPhotos(
        Guid mobileAccountId,
        Guid assignmentId,
        IReadOnlyList<PendingReportPhoto> photos,
        Guid? lateReportId,
        DateTimeOffset now)
    {
        if (photos.Count == 0)
        {
            return;
        }

        var fileIds = photos.Select(photo => photo.ClientFileId).ToArray();
        var known = dbContext.PatrolReportPendingPhotos
            .Where(item => item.MobileAccountId == mobileAccountId
                && item.AssignmentId == assignmentId
                && fileIds.Contains(item.ClientFileId))
            .ToDictionary(item => item.ClientFileId, StringComparer.Ordinal);
        foreach (var photo in photos.DistinctBy(photo => photo.ClientFileId, StringComparer.Ordinal))
        {
            if (known.TryGetValue(photo.ClientFileId, out var existing))
            {
                // The same photo named again by a newer report follows that report.
                if (existing.UploadedFileId is null)
                {
                    existing.PointId = photo.PointId;
                    existing.LateReportId = lateReportId;
                }

                continue;
            }

            dbContext.PatrolReportPendingPhotos.Add(new PatrolReportPendingPhotoEntity
            {
                Id = Guid.NewGuid(),
                MobileAccountId = mobileAccountId,
                AssignmentId = assignmentId,
                PointId = photo.PointId,
                ClientFileId = photo.ClientFileId,
                LateReportId = lateReportId,
                CreatedAt = now,
            });
        }
    }

    private bool HasPendingReportPhoto(Guid mobileAccountId, Guid assignmentId, Guid pointId, string clientFileId) =>
        dbContext.PatrolReportPendingPhotos
            .AsNoTracking()
            .Any(item => item.MobileAccountId == mobileAccountId
                && item.AssignmentId == assignmentId
                && item.PointId == pointId
                && item.ClientFileId == clientFileId
                && item.UploadedFileId == null);

    // Runs after the uploaded file row is committed. The assignment lock is the
    // one completePatrolAssignment holds, so a report registering this photo as
    // pending and the upload linking it cannot miss each other.
    private async Task LinkPendingReportPhotoAsync(Guid uploadedFileId, CancellationToken cancellationToken)
    {
        var file = await dbContext.MobileUploadedFiles
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.Id == uploadedFileId, cancellationToken);
        if (file?.AssignmentId is null || file.PointId is null)
        {
            return;
        }

        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        if (dbContext.Database.IsNpgsql())
        {
            var lockKey = $"mobile-patrol-assignment:{file.AssignmentId.Value:N}";
            await dbContext.Database.ExecuteSqlInterpolatedAsync(
                $"SELECT pg_advisory_xact_lock(hashtextextended({lockKey}, 0))",
                cancellationToken);
        }

        var pending = await dbContext.PatrolReportPendingPhotos
            .FirstOrDefaultAsync(item => item.MobileAccountId == file.MobileAccountId
                && item.AssignmentId == file.AssignmentId.Value
                && item.PointId == file.PointId.Value
                && item.ClientFileId == file.ClientFileId
                && item.UploadedFileId == null, cancellationToken);
        if (pending is null)
        {
            return;
        }

        pending.UploadedFileId = file.Id;
        if (pending.LateReportId is null)
        {
            var result = await dbContext.PatrolResults
                .Include(item => item.Attachments)
                .Where(item => item.AssignmentId == file.AssignmentId.Value
                    && item.RoutePointId == file.PointId.Value)
                .OrderByDescending(item => item.CreatedAt)
                .FirstOrDefaultAsync(cancellationToken);
            if (result is not null)
            {
                AttachUploadedFile(result, file);
                pending.LinkedAt = DateTimeOffset.UtcNow;
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    private void AttachUploadedFile(PatrolResultEntity result, MobileUploadedFileEntity file)
    {
        if (result.Attachments.Any(item => item.FileName == file.StorageFileName))
        {
            return;
        }

        var attachment = new PatrolResultAttachmentEntity
        {
            Id = Guid.NewGuid(),
            PatrolResultId = result.Id,
            FileName = file.StorageFileName,
            ContentType = file.ContentType,
            SizeBytes = file.SizeBytes,
            CreatedAt = file.UploadedAt,
        };
        var attachedBefore = result.Attachments.Count;
        // Explicit Add: a child with a preset key found through the navigation
        // alone would be treated as an existing row.
        dbContext.PatrolResultAttachments.Add(attachment);
        result.Photos = Math.Max(result.Photos, attachedBefore + 1);
    }

    public MobileHeartbeatReceiptDto? SaveHeartbeat(string accessToken, MobileHeartbeatRequestDto request)
    {
        var session = FindActiveSession(accessToken);
        if (session is null)
        {
            return null;
        }

        var deviceId = NormalizeOptionalText(request.DeviceId);
        if (!string.IsNullOrWhiteSpace(deviceId)
            && !string.Equals(deviceId, session.DeviceId, StringComparison.Ordinal))
        {
            throw new ArgumentException("Heartbeat deviceId does not match the session device.");
        }

        TouchSession(session);
        var now = DateTimeOffset.UtcNow;
        session.HeartbeatAt = now;
        session.HeartbeatPendingCount = Math.Clamp(request.PendingCommandCount, 0, 100_000);
        session.HeartbeatFailedCount = request.FailedCommandCount is { } failed ? Math.Clamp(failed, 0, 100_000) : null;
        session.HeartbeatOldestPendingAgeSeconds = request.OldestPendingCommandAgeSeconds is { } age && session.HeartbeatPendingCount > 0
            ? Math.Clamp(age, 0, 365 * 24 * 60 * 60)
            : null;
        dbContext.SaveChanges();
        return new MobileHeartbeatReceiptDto(now, HeartbeatIntervalSeconds);
    }

    public IReadOnlyList<PatrolLateReportDto> GetLateReports(string? status, int limit)
    {
        var take = Math.Clamp(limit, 1, 200);
        var normalizedStatus = NormalizeOptionalText(status).ToLowerInvariant();
        var query = dbContext.PatrolLateReports
            .AsNoTracking()
            .Include(item => item.MobileAccount)
            .Include(item => item.Assignment)!.ThenInclude(item => item!.Route)
            .Include(item => item.Assignment)!.ThenInclude(item => item!.Employee)
            .Include(item => item.Assignment)!.ThenInclude(item => item!.PatrolRequest)
            .AsQueryable();
        if (!string.IsNullOrWhiteSpace(normalizedStatus))
        {
            query = query.Where(item => item.Status == normalizedStatus);
        }

        var rows = query
            .OrderBy(item => item.Status == "pending" ? 0 : 1)
            .ThenByDescending(item => item.ReceivedAt)
            .Take(take)
            .AsSplitQuery()
            .ToList();
        return MapLateReports(rows);
    }

    public PatrolLateReportResolutionResult ResolveLateReport(
        Guid lateReportId,
        PatrolLateReportResolutionRequestDto request,
        string actor)
    {
        var decision = NormalizeOptionalText(request.Decision).ToLowerInvariant();
        if (decision is not ("apply" or "dismiss"))
        {
            return new(null, "invalidDecision", "Решение должно быть apply или dismiss.");
        }

        var assignmentId = dbContext.PatrolLateReports
            .AsNoTracking()
            .Where(item => item.Id == lateReportId)
            .Select(item => (Guid?)item.AssignmentId)
            .FirstOrDefault();
        if (assignmentId is null)
        {
            return new(null, "notFound", "Поздний отчёт не найден.");
        }

        using var transaction = dbContext.Database.BeginTransaction();
        if (dbContext.Database.IsNpgsql())
        {
            var lockKey = $"mobile-patrol-assignment:{assignmentId.Value:N}";
            dbContext.Database.ExecuteSqlInterpolated(
                $"SELECT pg_advisory_xact_lock(hashtextextended({lockKey}, 0))");
        }

        var comment = NormalizeOptionalText(request.Comment);
        if (comment.Length > 2000)
        {
            return new(null, "invalidComment", "Комментарий длиннее 2000 символов.");
        }

        var lateReport = dbContext.PatrolLateReports.AsNoTracking().First(item => item.Id == lateReportId);
        if (lateReport.Status != "pending")
        {
            return new(null, "alreadyResolved", "Поздний отчёт уже обработан.");
        }

        // Archived results are kept too: applying would overwrite them.
        if (decision == "apply" && dbContext.PatrolResults.Any(item => item.AssignmentId == lateReport.AssignmentId))
        {
            return new(null, "assignmentHasReport",
                "По обходу уже есть принятый отчёт. Поздний отчёт можно только отклонить.");
        }

        var now = DateTimeOffset.UtcNow;
        lateReport = dbContext.PatrolLateReports.First(item => item.Id == lateReportId);
        lateReport.ResolutionComment = comment;
        lateReport.ResolvedBy = string.IsNullOrWhiteSpace(actor) ? "operator" : actor.Trim();
        lateReport.ResolvedAt = now;
        if (decision == "dismiss")
        {
            lateReport.Status = "dismissed";
            dbContext.SaveChanges();
            transaction.Commit();
            return new(MapLateReports([ReloadLateReport(lateReportId)]).Single(), null, null);
        }

        var assignment = dbContext.Assignments
            .Include(item => item.PatrolRequest)
            .Include(item => item.Employee)
            .Include(item => item.Route)
                .ThenInclude(route => route!.Points)
            .Include(item => item.RouteRevision)
                .ThenInclude(revision => revision!.Points)
            .First(item => item.Id == lateReport.AssignmentId);
        var account = dbContext.MobileAccounts.First(item => item.Id == lateReport.MobileAccountId);
        var payload = JsonSerializer.Deserialize<Dictionary<string, object?>>(lateReport.PayloadJson, JsonOptions) ?? [];
        var transferredPoints = LoadTransferredPoints(assignment.Id);
        var pointResults = MergeTransferredPointResults(ReadPointResults(payload), transferredPoints, account.Id);
        var photoAccountIds = transferredPoints.Select(item => item.SourceAccountId).Append(account.Id).ToHashSet();
        var requestedFileIds = pointResults
            .SelectMany(result => result.PhotoClientFileIds)
            .Select(fileId => NormalizeOptionalText(fileId))
            .Where(fileId => !string.IsNullOrWhiteSpace(fileId))
            .ToHashSet(StringComparer.Ordinal);
        var uploadedFiles = requestedFileIds.Count == 0
            ? []
            : dbContext.MobileUploadedFiles
                .AsNoTracking()
                .Where(file => photoAccountIds.Contains(file.MobileAccountId)
                    && file.AssignmentId == assignment.Id
                    && file.PointId.HasValue
                    && requestedFileIds.Contains(file.ClientFileId))
                .ToArray();

        SaveMobilePointResults(account, assignment, pointResults, lateReport.CompletedAtLocal, now, uploadedFiles,
            transferredPoints.ToDictionary(item => item.Result.PointId, item => (item.PerformerEmployeeId, item.PerformerName)));
        MarkAssignmentReportCompleted(assignment, pointResults, lateReport.CompletedAtLocal, lateReport.SubmissionMode, now);
        assignment.ReportLateAppliedAt = now;
        lateReport.Status = "applied";

        var uploadedIds = uploadedFiles.Select(file => file.Id).ToHashSet();
        foreach (var pending in dbContext.PatrolReportPendingPhotos.Where(item => item.LateReportId == lateReport.Id))
        {
            // Photos still on the phone now belong to the accepted report and
            // are attached by the upload itself.
            pending.LateReportId = null;
            if (pending.UploadedFileId is { } fileId && uploadedIds.Contains(fileId))
            {
                pending.LinkedAt = now;
            }
        }

        dbContext.SaveChanges();
        transaction.Commit();
        return new(MapLateReports([ReloadLateReport(lateReportId)]).Single(), null, null);
    }

    private PatrolLateReportEntity ReloadLateReport(Guid lateReportId)
    {
        dbContext.ChangeTracker.Clear();
        return dbContext.PatrolLateReports
            .AsNoTracking()
            .Include(item => item.MobileAccount)
            .Include(item => item.Assignment)!.ThenInclude(item => item!.Route)
            .Include(item => item.Assignment)!.ThenInclude(item => item!.Employee)
            .Include(item => item.Assignment)!.ThenInclude(item => item!.PatrolRequest)
            .AsSplitQuery()
            .First(item => item.Id == lateReportId);
    }

    private IReadOnlyList<PatrolLateReportDto> MapLateReports(IReadOnlyList<PatrolLateReportEntity> rows)
    {
        if (rows.Count == 0)
        {
            return [];
        }

        var lateReportIds = rows.Select(item => item.Id).ToArray();
        var assignmentIds = rows.Select(item => item.AssignmentId).Distinct().ToArray();
        var pendingPhotoCounts = dbContext.PatrolReportPendingPhotos
            .AsNoTracking()
            .Where(item => item.LateReportId.HasValue
                && lateReportIds.Contains(item.LateReportId.Value)
                && item.UploadedFileId == null)
            .GroupBy(item => item.LateReportId!.Value)
            .Select(group => new { group.Key, Count = group.Count() })
            .ToDictionary(item => item.Key, item => item.Count);
        var assignmentsWithReport = dbContext.PatrolResults
            .AsNoTracking()
            .Where(item => item.AssignmentId.HasValue && assignmentIds.Contains(item.AssignmentId.Value))
            .Select(item => item.AssignmentId!.Value)
            .Distinct()
            .ToHashSet();

        return rows.Select(item =>
        {
            Dictionary<string, object?> payload;
            try
            {
                payload = JsonSerializer.Deserialize<Dictionary<string, object?>>(item.PayloadJson, JsonOptions) ?? [];
            }
            catch (JsonException)
            {
                payload = [];
            }

            var pointResults = ReadPointResults(payload);
            var assignment = item.Assignment;
            return new PatrolLateReportDto(
                item.Id,
                item.AssignmentId,
                assignment?.PatrolRequestId ?? Guid.Empty,
                assignment?.Route?.Name ?? assignment?.PatrolRequest?.RouteName ?? string.Empty,
                assignment?.Employee?.FullName ?? assignment?.PatrolRequest?.EmployeeName ?? string.Empty,
                item.MobileAccount?.Login ?? string.Empty,
                item.ReasonCode,
                AssignmentStatusValues.ToDisplayLabel(item.AssignmentStatusAtReceipt),
                AssignmentStatusValues.ToDisplayLabel(assignment?.Status),
                item.SubmissionMode,
                item.CompletedAtLocal,
                item.ReceivedAt,
                item.Status,
                pointResults.Count,
                pointResults.Count(result => !result.Status.Equals("ok", StringComparison.OrdinalIgnoreCase)),
                pointResults.Sum(result => result.PhotoClientFileIds.Count),
                pendingPhotoCounts.GetValueOrDefault(item.Id),
                item.Status == "pending" && !assignmentsWithReport.Contains(item.AssignmentId),
                item.ResolutionComment,
                item.ResolvedBy,
                item.ResolvedAt,
                ParseLateReportPayload(item.PayloadJson));
        }).ToArray();
    }

    private static object? ParseLateReportPayload(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<JsonElement>(json);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private sealed record PendingReportPhoto(Guid PointId, string ClientFileId);
}
