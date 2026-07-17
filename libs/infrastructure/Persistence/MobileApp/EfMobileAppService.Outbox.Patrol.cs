using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfMobileAppService
{
    public IReadOnlyList<MobileOutboxResponseDto> SaveOutbox(string accessToken, MobileOutboxBatchDto request)
    {
        var session = FindActiveSession(accessToken);
        if (session?.MobileAccount is null)
        {
            return [];
        }

        TouchSession(session);
        var responses = new List<MobileOutboxResponseDto>();
        foreach (var command in request.Commands)
        {
            responses.Add(SaveOutboxCommand(session, command));
        }

        return responses;
    }

    private MobileOutboxResponseDto SaveOutboxCommand(
        MobileAccountSessionEntity session,
        MobileOutboxCommandDto command)
    {
        var account = session.MobileAccount
            ?? throw new InvalidOperationException("Authenticated mobile session is missing its account.");
        if (string.IsNullOrWhiteSpace(command.ClientOperationId))
        {
            return new MobileOutboxResponseDto(
                string.Empty,
                "rejected",
                null,
                null,
                "clientOperationId is required.",
                null,
                null);
        }

        using var transaction = dbContext.Database.BeginTransaction();
        if (dbContext.Database.IsNpgsql())
        {
            var lockKey = $"mobile-outbox:{session.MobileAccountId:N}:{command.ClientOperationId}";
            dbContext.Database.ExecuteSqlInterpolated(
                $"SELECT pg_advisory_xact_lock(hashtextextended({lockKey}, 0))");
        }

        var existing = dbContext.MobileOutboxOperations
            .AsNoTracking()
            .FirstOrDefault(item =>
                item.MobileAccountId == session.MobileAccountId
                && item.ClientOperationId == command.ClientOperationId);
        if (existing is not null)
        {
            return BuildRepeatedOutboxResponse(existing);
        }

        // Serialize commands that touch the same patrol assignment. The
        // clientOperationId lock prevents a duplicate retry of one command,
        // but two different operation ids can still be produced by a double
        // tap, a restored queue, or two app processes. Without an assignment
        // lock both completion requests could observe an empty report and
        // create two server results before either transaction commits.
        if (dbContext.Database.IsNpgsql())
        {
            var patrolLockKey = BuildPatrolCommandLockKey(command);
            if (patrolLockKey is not null)
            {
                dbContext.Database.ExecuteSqlInterpolated(
                    $"SELECT pg_advisory_xact_lock(hashtextextended({patrolLockKey}, 0))");
            }
        }

        var response = command.CommandType switch
            {
                var type when type.Equals("takePatrolRequest", StringComparison.OrdinalIgnoreCase) =>
                    ProcessTakePatrolRequest(account, command),
                var type when type.Equals("acceptPatrolRequest", StringComparison.OrdinalIgnoreCase) =>
                    ProcessAcceptPatrolRequest(account, command),
                var type when type.Equals("releasePatrolRequest", StringComparison.OrdinalIgnoreCase) =>
                    ProcessReleasePatrolRequest(account, command),
                var type when type.Equals("startPatrolAssignment", StringComparison.OrdinalIgnoreCase) =>
                    ProcessStartPatrolAssignment(account, command),
                var type when type.Equals("pausePatrolAssignment", StringComparison.OrdinalIgnoreCase) =>
                    ProcessPausePatrolAssignment(account, command),
                var type when type.Equals("resumePatrolAssignment", StringComparison.OrdinalIgnoreCase) =>
                    ProcessResumePatrolAssignment(account, command),
                var type when type.Equals("handoffPatrolAssignment", StringComparison.OrdinalIgnoreCase) =>
                    ProcessHandoffPatrolAssignment(account, command),
                var type when type.Equals("scanPatrolPointNfc", StringComparison.OrdinalIgnoreCase) =>
                    ProcessScanPatrolPointNfc(account, command),
                var type when type.Equals("scanPatrolPointQr", StringComparison.OrdinalIgnoreCase) =>
                    ProcessScanPatrolPointQr(account, command),
                var type when type.Equals("markPatrolPointOk", StringComparison.OrdinalIgnoreCase) =>
                    ProcessMarkPatrolPoint(account, command, isIssue: false),
                var type when type.Equals("markPatrolPointIssue", StringComparison.OrdinalIgnoreCase) =>
                    ProcessMarkPatrolPoint(account, command, isIssue: true),
                var type when type.Equals("completePatrolAssignment", StringComparison.OrdinalIgnoreCase) =>
                    ProcessCompletePatrolAssignment(account, command),
                var type when type.Equals("createWorkTask", StringComparison.OrdinalIgnoreCase) =>
                    ProcessCreateWorkTask(account, command),
                var type when type.Equals("updateWorkTask", StringComparison.OrdinalIgnoreCase) =>
                    ProcessUpdateWorkTask(account, command),
                var type when type.Equals("pauseWorkTask", StringComparison.OrdinalIgnoreCase) =>
                    ProcessPauseWorkTask(account, command),
                var type when type.Equals("resumeWorkTask", StringComparison.OrdinalIgnoreCase) =>
                    ProcessResumeWorkTask(account, command),
                var type when type.Equals("completeWorkTask", StringComparison.OrdinalIgnoreCase) =>
                    ProcessCompleteWorkTask(account, command),
                var type when type.Equals("startPlannedWork", StringComparison.OrdinalIgnoreCase) =>
                    ProcessStartPlannedWork(account, command),
                var type when type.Equals("joinWorkTask", StringComparison.OrdinalIgnoreCase) =>
                    ProcessJoinWorkTask(account, command),
                var type when type.Equals("replaceWorkTaskParticipant", StringComparison.OrdinalIgnoreCase) =>
                    ProcessReplaceWorkTaskParticipant(account, command),
                var type when type.Equals("createShiftRemark", StringComparison.OrdinalIgnoreCase) =>
                    ProcessCreateShiftRemark(account, command),
                var type when type.Equals("attachShiftRemarkMedia", StringComparison.OrdinalIgnoreCase) =>
                    ProcessAttachShiftRemarkMedia(account, command),
                _ => new MobileOutboxResponseDto(
                    command.ClientOperationId,
                    "rejected",
                    command.EntityServerId,
                    null,
                    $"Unsupported mobile outbox command type: {command.CommandType}.",
                    null,
                    null)
            };

        dbContext.MobileOutboxOperations.Add(new MobileOutboxOperationEntity
        {
            ClientOperationId = command.ClientOperationId,
            MobileAccountId = session.MobileAccountId,
            CommandType = NormalizeOptionalText(command.CommandType),
            EntityType = NormalizeOptionalText(command.EntityType),
            EntityLocalId = NormalizeNullableText(command.EntityLocalId),
            EntityServerId = NormalizeNullableText(response.ServerEntityId ?? command.EntityServerId),
            PayloadJson = JsonSerializer.Serialize(command.Payload, JsonOptions),
            PayloadFingerprint = command.CommandType.Equals("completePatrolAssignment", StringComparison.OrdinalIgnoreCase)
                ? GetCompleteReportPayloadFingerprint(command.Payload)
                : null,
            CreatedAtLocal = command.CreatedAtLocal,
            CreatedAtServer = DateTimeOffset.UtcNow,
            AttemptCount = Math.Max(0, command.AttemptCount),
            Status = response.Status,
            ResponseJson = JsonSerializer.Serialize(response, JsonOptions),
        });

        try
        {
            dbContext.SaveChanges();
            transaction.Commit();
            return response;
        }
        catch (DbUpdateException exception) when (IsUniqueConstraintViolation(exception))
        {
            transaction.Rollback();
            dbContext.ChangeTracker.Clear();
            var racedOperation = dbContext.MobileOutboxOperations
                .AsNoTracking()
                .FirstOrDefault(item =>
                    item.MobileAccountId == session.MobileAccountId
                    && item.ClientOperationId == command.ClientOperationId);
            if (racedOperation is not null)
            {
                return BuildRepeatedOutboxResponse(racedOperation);
            }

            var racedAssignmentResponse = TryBuildRacedPatrolRequestResponse(account, command);
            if (racedAssignmentResponse is not null)
            {
                return racedAssignmentResponse;
            }

            var activePatrolResponse = TryBuildActivePatrolConflictResponse(account, command);
            if (activePatrolResponse is not null)
            {
                return activePatrolResponse;
            }

            throw;
        }
    }

    private MobileOutboxResponseDto? TryBuildActivePatrolConflictResponse(
        MobileAccountEntity account,
        MobileOutboxCommandDto command)
    {
        var isStartOrResume = command.CommandType.Equals("startPatrolAssignment", StringComparison.OrdinalIgnoreCase)
            || command.CommandType.Equals("resumePatrolAssignment", StringComparison.OrdinalIgnoreCase);
        var isLegacyTake = command.CommandType.Equals("takePatrolRequest", StringComparison.OrdinalIgnoreCase);

        if (!isStartOrResume && !isLegacyTake)
        {
            return null;
        }

        Guid? currentAssignmentId = null;
        Guid? employeeId = null;
        if (isStartOrResume)
        {
            currentAssignmentId = ReadGuid(command.Payload, "assignmentId");
            if (currentAssignmentId is null)
            {
                return null;
            }

            employeeId = dbContext.Assignments
                .AsNoTracking()
                .Where(item => item.Id == currentAssignmentId.Value)
                .Select(item => (Guid?)item.EmployeeId)
                .FirstOrDefault();
        }
        else
        {
            var requestId = ReadGuid(command.Payload, "requestId");
            if (requestId is null)
            {
                return null;
            }

            var request = dbContext.PatrolRequests
                .AsNoTracking()
                .Where(item => item.Id == requestId.Value)
                .Select(item => new { item.EmployeeId, AssignmentEmployeeId = item.Assignment == null ? (Guid?)null : item.Assignment.EmployeeId })
                .FirstOrDefault();
            employeeId = request?.EmployeeId ?? request?.AssignmentEmployeeId;
            employeeId ??= GetBoundEmployeeIds(account).FirstOrDefault();
        }

        if (employeeId is null)
        {
            return null;
        }

        var hasAnotherActivePatrol = dbContext.Assignments
            .AsNoTracking()
            .Any(item => item.EmployeeId == employeeId.Value
                && (item.Status == AssignmentStatusValues.InProgress
                    || item.Status == AssignmentStatusValues.Paused)
                && (!currentAssignmentId.HasValue || item.Id != currentAssignmentId.Value));

        return hasAnotherActivePatrol
            ? Conflict(command.ClientOperationId, "Employee already has another started or paused patrol.", "activePatrolExists")
            : null;
    }

    private MobileOutboxResponseDto? TryBuildRacedPatrolRequestResponse(
        MobileAccountEntity account,
        MobileOutboxCommandDto command)
    {
        if (!command.CommandType.Equals("acceptPatrolRequest", StringComparison.OrdinalIgnoreCase)
            && !command.CommandType.Equals("takePatrolRequest", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var requestId = ReadGuid(command.Payload, "requestId");
        if (requestId is null)
        {
            return null;
        }

        var assignment = dbContext.Assignments
            .AsNoTracking()
            .Include(item => item.PatrolRequest)
            .FirstOrDefault(item => item.PatrolRequestId == requestId.Value);
        if (assignment is null || !GetBoundEmployeeIds(account).Contains(assignment.EmployeeId))
        {
            return null;
        }

        if (assignment.Status == AssignmentStatusValues.Cancelled
            || assignment.PatrolRequest?.Status == AssignmentStatusValues.Cancelled)
        {
            return Conflict(command.ClientOperationId, "Patrol request was cancelled by dispatcher.", "assignmentCancelled");
        }

        if (assignment.Status == AssignmentStatusValues.Completed
            || assignment.PatrolRequest?.Status == AssignmentStatusValues.Completed)
        {
            return Conflict(command.ClientOperationId, "Patrol request is already completed.");
        }

        return new MobileOutboxResponseDto(
            command.ClientOperationId,
            "duplicate",
            assignment.Id.ToString(),
            assignment.LockVersion,
            "Patrol request was already accepted.",
            null,
            null);
    }

    private static bool IsUniqueConstraintViolation(DbUpdateException exception) =>
        exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation };

    private static string? BuildPatrolCommandLockKey(MobileOutboxCommandDto command)
    {
        if (!command.CommandType.Contains("Patrol", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var assignmentId = ReadGuid(command.Payload, "assignmentId");
        if (assignmentId is not null)
        {
            return $"mobile-patrol-assignment:{assignmentId.Value:N}";
        }

        var requestId = ReadGuid(command.Payload, "requestId");
        if (requestId is not null)
        {
            return $"mobile-patrol-request:{requestId.Value:N}";
        }

        return Guid.TryParse(command.EntityLocalId, out var entityId)
            ? $"mobile-patrol-assignment:{entityId:N}"
            : null;
    }

    private static MobileOutboxResponseDto BuildRepeatedOutboxResponse(MobileOutboxOperationEntity existing)
    {
        MobileOutboxResponseDto? storedResponse = null;
        try
        {
            storedResponse = JsonSerializer.Deserialize<MobileOutboxResponseDto>(existing.ResponseJson, JsonOptions);
        }
        catch (JsonException)
        {
            // Older or manually repaired rows may not have a readable response snapshot.
        }

        var status = storedResponse?.Status ?? existing.Status;
        if (status.Equals("accepted", StringComparison.OrdinalIgnoreCase)
            || status.Equals("duplicate", StringComparison.OrdinalIgnoreCase))
        {
            return new MobileOutboxResponseDto(
                existing.ClientOperationId,
                "duplicate",
                storedResponse?.ServerEntityId ?? existing.EntityServerId,
                storedResponse?.ServerRevision,
                "Command was already accepted.",
                null,
                null);
        }

        return storedResponse ?? new MobileOutboxResponseDto(
            existing.ClientOperationId,
            string.IsNullOrWhiteSpace(existing.Status) ? "rejected" : existing.Status,
            existing.EntityServerId,
            null,
            "Command was already processed.",
            null,
            null);
    }
}
