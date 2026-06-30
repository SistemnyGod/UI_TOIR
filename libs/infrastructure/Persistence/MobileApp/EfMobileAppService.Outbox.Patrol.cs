using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
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
            if (string.IsNullOrWhiteSpace(command.ClientOperationId))
            {
                responses.Add(new MobileOutboxResponseDto(
                    string.Empty,
                    "rejected",
                    null,
                    null,
                    "clientOperationId is required.",
                    null,
                    null));
                continue;
            }

            var existing = dbContext.MobileOutboxOperations
                .AsNoTracking()
                .FirstOrDefault(item =>
                    item.MobileAccountId == session.MobileAccountId
                    && item.ClientOperationId == command.ClientOperationId);
            if (existing is not null)
            {
                responses.Add(BuildRepeatedOutboxResponse(existing));
                continue;
            }

            var response = command.CommandType switch
            {
                var type when type.Equals("takePatrolRequest", StringComparison.OrdinalIgnoreCase) =>
                    ProcessTakePatrolRequest(session.MobileAccount, command),
                var type when type.Equals("acceptPatrolRequest", StringComparison.OrdinalIgnoreCase) =>
                    ProcessAcceptPatrolRequest(session.MobileAccount, command),
                var type when type.Equals("releasePatrolRequest", StringComparison.OrdinalIgnoreCase) =>
                    ProcessReleasePatrolRequest(session.MobileAccount, command),
                var type when type.Equals("startPatrolAssignment", StringComparison.OrdinalIgnoreCase) =>
                    ProcessStartPatrolAssignment(session.MobileAccount, command),
                var type when type.Equals("pausePatrolAssignment", StringComparison.OrdinalIgnoreCase) =>
                    ProcessPausePatrolAssignment(session.MobileAccount, command),
                var type when type.Equals("resumePatrolAssignment", StringComparison.OrdinalIgnoreCase) =>
                    ProcessResumePatrolAssignment(session.MobileAccount, command),
                var type when type.Equals("handoffPatrolAssignment", StringComparison.OrdinalIgnoreCase) =>
                    ProcessHandoffPatrolAssignment(session.MobileAccount, command),
                var type when type.Equals("scanPatrolPointNfc", StringComparison.OrdinalIgnoreCase) =>
                    ProcessScanPatrolPointNfc(session.MobileAccount, command),
                var type when type.Equals("scanPatrolPointQr", StringComparison.OrdinalIgnoreCase) =>
                    ProcessScanPatrolPointQr(session.MobileAccount, command),
                var type when type.Equals("markPatrolPointOk", StringComparison.OrdinalIgnoreCase) =>
                    ProcessMarkPatrolPoint(session.MobileAccount, command, isIssue: false),
                var type when type.Equals("markPatrolPointIssue", StringComparison.OrdinalIgnoreCase) =>
                    ProcessMarkPatrolPoint(session.MobileAccount, command, isIssue: true),
                var type when type.Equals("completePatrolAssignment", StringComparison.OrdinalIgnoreCase) =>
                    ProcessCompletePatrolAssignment(session.MobileAccount, command),
                var type when type.Equals("createWorkTask", StringComparison.OrdinalIgnoreCase) =>
                    ProcessCreateWorkTask(session.MobileAccount, command),
                var type when type.Equals("updateWorkTask", StringComparison.OrdinalIgnoreCase) =>
                    ProcessUpdateWorkTask(session.MobileAccount, command),
                var type when type.Equals("pauseWorkTask", StringComparison.OrdinalIgnoreCase) =>
                    ProcessPauseWorkTask(session.MobileAccount, command),
                var type when type.Equals("resumeWorkTask", StringComparison.OrdinalIgnoreCase) =>
                    ProcessResumeWorkTask(session.MobileAccount, command),
                var type when type.Equals("completeWorkTask", StringComparison.OrdinalIgnoreCase) =>
                    ProcessCompleteWorkTask(session.MobileAccount, command),
                var type when type.Equals("createShiftRemark", StringComparison.OrdinalIgnoreCase) =>
                    ProcessCreateShiftRemark(session.MobileAccount, command),
                var type when type.Equals("attachShiftRemarkMedia", StringComparison.OrdinalIgnoreCase) =>
                    ProcessAttachShiftRemarkMedia(session.MobileAccount, command),
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
                CreatedAtLocal = command.CreatedAtLocal,
                CreatedAtServer = DateTimeOffset.UtcNow,
                AttemptCount = Math.Max(0, command.AttemptCount),
                Status = response.Status,
                ResponseJson = JsonSerializer.Serialize(response, JsonOptions),
            });
            responses.Add(response);
        }

        dbContext.SaveChanges();
        return responses;
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
