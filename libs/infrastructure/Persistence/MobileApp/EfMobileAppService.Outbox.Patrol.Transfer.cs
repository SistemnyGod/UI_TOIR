using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

// Handover of an unfinished patrol to another employee of the shift.
// Contract: docs/patrol-handover-2026-10-19.md.
internal sealed partial class EfMobileAppService
{
    internal const string TransferSameDevice = "sameDevice";
    internal const string TransferOtherDevice = "otherDevice";
    private const int TransferReasonMaxLength = 500;

    private MobileOutboxResponseDto ProcessTransferPatrolAssignment(MobileAccountEntity account, MobileOutboxCommandDto command)
    {
        var assignmentId = ReadGuid(command.Payload, "assignmentId");
        var fromEmployeeId = ReadGuid(command.Payload, "fromEmployeeId");
        var toEmployeeId = ReadGuid(command.Payload, "toEmployeeId");
        if (assignmentId is null || fromEmployeeId is null || toEmployeeId is null)
            return Rejected(command.ClientOperationId, "transferPatrolAssignment payload is incomplete.");
        if (fromEmployeeId == toEmployeeId)
            return Rejected(command.ClientOperationId, "Choose another employee to hand the patrol over to.", "transferSameEmployee");

        IReadOnlyList<MobilePointResultPayload> carried;
        try
        {
            carried = ReadPointResults(command.Payload);
        }
        catch (JsonException)
        {
            return Rejected(command.ClientOperationId, "transferPatrolAssignment pointResults are malformed.");
        }

        // The colleague may be starting a patrol on another phone right now.
        // Start/resume/switch take the same per-employee lock.
        if (dbContext.Database.IsNpgsql())
            foreach (var employeeId in new[] { fromEmployeeId.Value, toEmployeeId.Value }.OrderBy(id => id))
            {
                var key = $"patrol-start:{employeeId:N}";
                dbContext.Database.ExecuteSqlInterpolated($"SELECT pg_advisory_xact_lock(hashtextextended({key}, 0))");
            }

        var assignment = dbContext.Assignments
            .Include(item => item.PatrolRequest)
            .Include(item => item.Employee)
            .Include(item => item.Route)
                .ThenInclude(route => route!.Points)
            .Include(item => item.RouteRevision)
                .ThenInclude(revision => revision!.Points)
            .FirstOrDefault(item => item.Id == assignmentId.Value);
        if (assignment is null || assignment.PatrolRequest is null)
            return Conflict(command.ClientOperationId, "Assignment is not available.");

        var boundEmployeeIds = GetBoundEmployeeIds(account);
        if (!boundEmployeeIds.Contains(assignment.EmployeeId) || assignment.EmployeeId != fromEmployeeId.Value)
            return Conflict(command.ClientOperationId,
                "Patrol performer changed on the server. Refresh before handing it over.", "transferPerformerChanged");

        var status = assignment.Status;
        if (status == AssignmentStatusValues.Completed || status == AssignmentStatusValues.Cancelled
            || assignment.PatrolRequest.Status == AssignmentStatusValues.Completed
            || assignment.PatrolRequest.Status == AssignmentStatusValues.Cancelled)
            return Conflict(command.ClientOperationId, "Patrol is already closed.", AssignmentClosedReasonCode);
        if (status == AssignmentStatusValues.NeedsDispatcherDecision)
            return Conflict(command.ClientOperationId, "Patrol request requires dispatcher decision.", AssignmentNeedsDecisionReasonCode);
        if (status != AssignmentStatusValues.InProgress && status != AssignmentStatusValues.Paused)
            return Conflict(command.ClientOperationId, "Only a started patrol can be handed over.", AssignmentNotInProgressReasonCode);

        var target = dbContext.Employees.FirstOrDefault(item => item.Id == toEmployeeId.Value);
        var targetAccountIds = target is null ? [] : FindActiveAccountIdsForEmployee(target.Id);
        if (target is null || targetAccountIds.Count == 0)
            return Conflict(command.ClientOperationId,
                "The colleague has no active mobile account.", "transferTargetUnavailable");

        var sameAccount = boundEmployeeIds.Contains(target.Id);
        // On a shared phone the colleague continues at once. On another phone
        // the patrol waits paused until the colleague resumes it there.
        var statusAfter = sameAccount ? status : AssignmentStatusValues.Paused;
        if (statusAfter == AssignmentStatusValues.InProgress
            && dbContext.Assignments.Any(item => item.EmployeeId == target.Id && item.Id != assignment.Id
                && item.Status == AssignmentStatusValues.InProgress))
            return Conflict(command.ClientOperationId,
                "The colleague already has another patrol in progress.", "transferTargetBusy");

        var routePoints = GetAssignedRoutePoints(assignment).Where(IsMobileRoutePointVisible).Select(point => point.Id).ToHashSet();
        if (carried.GroupBy(result => result.PointId).Any(group => group.Count() > 1))
            return Rejected(command.ClientOperationId, "Point results must not contain duplicate patrol points.");
        foreach (var result in carried)
        {
            if (!routePoints.Contains(result.PointId))
                return Conflict(command.ClientOperationId, "Point result does not belong to assignment route.");
            if (!IsAllowedCompletePointStatus(result.Status))
                return Rejected(command.ClientOperationId, "Only filled points can be handed over.");
        }

        if (!sameAccount)
        {
            // The new performer's phone cannot upload these photos later, so
            // they must already be on the server. The phone uploads files
            // referenced by this command before sending it.
            var requestedFiles = carried
                .SelectMany(result => result.PhotoClientFileIds.Select(fileId => (result.PointId, FileId: NormalizeOptionalText(fileId))))
                .Where(item => item.FileId.Length > 0)
                .ToArray();
            if (requestedFiles.Length > 0)
            {
                var fileIds = requestedFiles.Select(item => item.FileId).ToHashSet(StringComparer.Ordinal);
                var uploaded = dbContext.MobileUploadedFiles.AsNoTracking()
                    .Where(file => file.MobileAccountId == account.Id && file.AssignmentId == assignment.Id
                        && file.PointId.HasValue && fileIds.Contains(file.ClientFileId))
                    .Select(file => new { PointId = file.PointId!.Value, file.ClientFileId })
                    .AsEnumerable()
                    .Select(file => (file.PointId, file.ClientFileId))
                    .ToHashSet();
                if (requestedFiles.Any(item => !uploaded.Contains((item.PointId, item.FileId))))
                    return Rejected(command.ClientOperationId,
                        "Upload the photos of the filled points before handing the patrol over.", "transferPhotosMissing");
            }
        }

        var now = DateTimeOffset.UtcNow;
        var fromName = assignment.Employee?.FullName ?? assignment.PatrolRequest.EmployeeName;
        var transfer = new PatrolAssignmentTransferEntity
        {
            Id = Guid.NewGuid(),
            AssignmentId = assignment.Id,
            PatrolRequestId = assignment.PatrolRequestId,
            FromEmployeeId = assignment.EmployeeId,
            FromEmployeeName = NormalizeBoundedOptionalText(fromName, "-", 300),
            ToEmployeeId = target.Id,
            ToEmployeeName = NormalizeBoundedOptionalText(target.FullName, "-", 300),
            FromMobileAccountId = account.Id,
            Mode = sameAccount ? TransferSameDevice : TransferOtherDevice,
            Reason = NormalizeBoundedOptionalText(ReadString(command.Payload, "reason"), string.Empty, TransferReasonMaxLength),
            ClientOperationId = command.ClientOperationId,
            StatusBefore = status,
            StatusAfter = statusAfter,
            CarriedPointResultsJson = JsonSerializer.Serialize(carried, JsonOptions),
            CarriedPointCount = carried.Count,
            TransferredAtLocal = (ReadDateTimeOffset(command.Payload, "transferredAtLocal") ?? now).ToUniversalTime(),
            CreatedAt = now,
        };

        if (statusAfter != status)
        {
            // Leave the unique in-progress slot of the previous performer before
            // the row changes employee.
            assignment.Status = statusAfter;
            assignment.PatrolRequest.Status = statusAfter;
            dbContext.SaveChanges();
        }

        assignment.EmployeeId = target.Id;
        assignment.Employee = target;
        assignment.LockVersion++;
        assignment.PatrolRequest.EmployeeId = target.Id;
        assignment.PatrolRequest.EmployeeName = target.FullName;
        dbContext.PatrolAssignmentTransfers.Add(transfer);
        dbContext.PatrolRequestHistoryEvents.Add(new PatrolRequestHistoryEventEntity
        {
            Id = Guid.NewGuid(),
            PatrolRequestId = assignment.PatrolRequestId,
            EventType = "performerTransferred",
            FromStatus = status,
            ToStatus = statusAfter,
            Details = string.IsNullOrWhiteSpace(transfer.Reason)
                ? $"{transfer.FromEmployeeName} → {transfer.ToEmployeeName}"
                : $"{transfer.FromEmployeeName} → {transfer.ToEmployeeName}: {transfer.Reason}",
            ActorName = transfer.FromEmployeeName,
            CreatedAt = now,
        });

        if (!sameAccount)
        {
            var routeName = assignment.Route?.Name ?? assignment.PatrolRequest.RouteName;
            foreach (var targetAccountId in targetAccountIds)
            {
                dbContext.MobileNotifications.Add(new MobileNotificationEntity
                {
                    Id = Guid.NewGuid(),
                    MobileAccountId = targetAccountId,
                    EmployeeId = target.Id,
                    Type = "patrolTransferred",
                    Title = "Вам передан обход",
                    Message = $"{transfer.FromEmployeeName} передаёт вам обход «{routeName}». Выполнено точек: {carried.Count}. Продолжите его после синхронизации.",
                    EntityType = "assignment",
                    EntityId = assignment.Id.ToString(),
                    IdempotencyKey = $"patrol-transfer:{transfer.Id}:{targetAccountId}",
                    PushStatus = "pending",
                    CreatedAt = now,
                });
            }
        }

        return new MobileOutboxResponseDto(command.ClientOperationId, "accepted", assignment.Id.ToString(),
            assignment.LockVersion, sameAccount ? "Patrol handed over on this phone." : "Patrol handed over to another phone.", null, null);
    }

    private IReadOnlyList<Guid> FindActiveAccountIdsForEmployee(Guid employeeId) =>
        dbContext.MobileAccountEmployeeBindings.AsNoTracking()
            .Where(binding => binding.EmployeeId == employeeId && binding.DetachedAt == null)
            .Select(binding => new { binding.MobileAccountId, Status = binding.MobileAccount!.Status })
            .AsEnumerable()
            .Where(item => IsActiveStatus(item.Status))
            .Select(item => item.MobileAccountId)
            .Distinct()
            .ToArray();

    public IReadOnlyList<MobileTransferCandidateDto>? GetPatrolTransferCandidates(string accessToken)
    {
        var session = FindActiveSession(accessToken);
        if (session?.MobileAccount is null) return null;
        var bound = GetBoundEmployeeIds(session.MobileAccount);
        var rows = dbContext.MobileAccountEmployeeBindings.AsNoTracking()
            .Where(binding => binding.DetachedAt == null && binding.Employee != null)
            .Select(binding => new
            {
                binding.EmployeeId,
                AccountStatus = binding.MobileAccount!.Status,
                binding.Employee!.FullName,
                binding.Employee.Position,
                binding.Employee.Department,
            })
            .AsEnumerable()
            .Where(row => IsActiveStatus(row.AccountStatus))
            .GroupBy(row => row.EmployeeId)
            .Select(group => group.First())
            .ToArray();
        var ids = rows.Select(row => row.EmployeeId).ToArray();
        var busy = dbContext.Assignments.AsNoTracking()
            .Where(item => ids.Contains(item.EmployeeId) && item.Status == AssignmentStatusValues.InProgress)
            .Select(item => item.EmployeeId)
            .ToHashSet();
        return rows
            .Select(row => new MobileTransferCandidateDto(row.EmployeeId, row.FullName,
                NormalizeNullableText(row.Position), NormalizeNullableText(row.Department),
                bound.Contains(row.EmployeeId), busy.Contains(row.EmployeeId)))
            .OrderByDescending(item => item.SameAccount)
            .ThenBy(item => item.FullName, StringComparer.CurrentCultureIgnoreCase)
            .ToArray();
    }

    public IReadOnlyList<PatrolAssignmentTransferDto> GetPatrolTransfers(Guid? assignmentId, int limit)
    {
        var take = Math.Clamp(limit, 1, 200);
        var query = dbContext.PatrolAssignmentTransfers.AsNoTracking();
        if (assignmentId is not null) query = query.Where(item => item.AssignmentId == assignmentId.Value);
        return query
            .OrderByDescending(item => item.CreatedAt)
            .Take(take)
            .Select(item => new
            {
                Transfer = item,
                RequestNumber = item.Assignment!.PatrolRequest == null ? "" : item.Assignment.PatrolRequest.Number,
                RouteName = item.Assignment.Route == null ? "" : item.Assignment.Route.Name,
                RequestRouteName = item.Assignment.PatrolRequest == null ? "" : item.Assignment.PatrolRequest.RouteName,
                CurrentStatus = item.Assignment.Status,
                Login = item.FromMobileAccount == null ? "" : item.FromMobileAccount.Login,
            })
            .AsEnumerable()
            .Select(row => new PatrolAssignmentTransferDto(
                row.Transfer.Id,
                row.Transfer.AssignmentId,
                row.Transfer.PatrolRequestId,
                row.RequestNumber,
                string.IsNullOrWhiteSpace(row.RouteName) ? row.RequestRouteName : row.RouteName,
                row.Transfer.FromEmployeeId,
                row.Transfer.FromEmployeeName,
                row.Transfer.ToEmployeeId,
                row.Transfer.ToEmployeeName,
                row.Transfer.Mode,
                row.Transfer.Reason,
                row.Login,
                AssignmentStatusValues.ToDisplayLabel(row.Transfer.StatusBefore),
                AssignmentStatusValues.ToDisplayLabel(row.Transfer.StatusAfter),
                row.Transfer.CarriedPointCount,
                AssignmentStatusValues.ToDisplayLabel(row.CurrentStatus),
                row.Transfer.TransferredAtLocal,
                row.Transfer.CreatedAt))
            .ToArray();
    }

    // Points a previous performer filled before a handover, earliest handover
    // first. A point keeps the attribution of the first performer who handed
    // it over; later handovers only add the points filled after it.
    private IReadOnlyList<TransferredPoint> LoadTransferredPoints(Guid assignmentId)
    {
        var transfers = dbContext.PatrolAssignmentTransfers.AsNoTracking()
            .Where(item => item.AssignmentId == assignmentId)
            .OrderBy(item => item.CreatedAt)
            .ThenBy(item => item.Id)
            .ToArray();
        var points = new Dictionary<Guid, TransferredPoint>();
        foreach (var transfer in transfers)
        {
            List<MobilePointResultPayload>? results;
            try
            {
                results = JsonSerializer.Deserialize<List<MobilePointResultPayload>>(transfer.CarriedPointResultsJson, JsonOptions);
            }
            catch (JsonException)
            {
                continue;
            }

            foreach (var result in results ?? [])
            {
                points.TryAdd(result.PointId, new TransferredPoint(result, transfer.FromEmployeeId, transfer.FromEmployeeName, transfer.FromMobileAccountId));
            }
        }

        return points.Values.ToArray();
    }

    // The completing phone owns its own results. Points carried from another
    // phone are taken from the handover: that phone holds the photos and the
    // completing phone only has a read-only copy of the result.
    private static IReadOnlyList<MobilePointResultPayload> MergeTransferredPointResults(
        IReadOnlyList<MobilePointResultPayload> submitted,
        IReadOnlyList<TransferredPoint> transferred,
        Guid completingAccountId)
    {
        var foreign = transferred
            .Where(item => item.SourceAccountId != completingAccountId)
            .ToDictionary(item => item.Result.PointId, item => item.Result);
        if (foreign.Count == 0) return submitted;
        var merged = submitted
            .Select(result => foreign.TryGetValue(result.PointId, out var carried) ? carried : result)
            .ToList();
        var present = merged.Select(result => result.PointId).ToHashSet();
        merged.AddRange(foreign.Values.Where(result => !present.Contains(result.PointId)));
        return merged;
    }

    // A phone that receives a patrol from another phone gets the points the
    // previous performer filled, so it can show them and complete the report.
    private IReadOnlyList<MobilePatrolAssignmentDto> AttachTransferredPointResults(
        IReadOnlyList<MobilePatrolAssignmentDto> assignments,
        Guid accountId)
    {
        var ids = assignments.Select(item => item.AssignmentId).ToArray();
        var transferredIds = dbContext.PatrolAssignmentTransfers.AsNoTracking()
            .Where(item => ids.Contains(item.AssignmentId) && item.FromMobileAccountId != accountId)
            .Select(item => item.AssignmentId)
            .Distinct()
            .ToHashSet();
        if (transferredIds.Count == 0) return assignments;
        return assignments
            .Select(assignment => !transferredIds.Contains(assignment.AssignmentId) ? assignment : assignment with
            {
                TransferredPointResults = LoadTransferredPoints(assignment.AssignmentId)
                    .Where(item => item.SourceAccountId != accountId)
                    .Select(item => new MobileTransferredPointResultDto(
                        item.Result.PointId,
                        item.Result.Status,
                        item.Result.Comment,
                        item.Result.IssueTypeId,
                        item.Result.ConfirmationType,
                        item.Result.ManualReason,
                        item.Result.CompletedAtLocal,
                        item.PerformerEmployeeId,
                        item.PerformerName,
                        item.Result.PhotoClientFileIds.Count))
                    .ToArray()
            })
            .ToArray();
    }

    private sealed record TransferredPoint(
        MobilePointResultPayload Result,
        Guid PerformerEmployeeId,
        string PerformerName,
        Guid SourceAccountId);
}
