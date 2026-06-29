using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfEmuService
{
    private sealed record LunchDecisionPayload(int OverlapMinutes, DateTimeOffset? LunchStartAt, DateTimeOffset? LunchEndAt);

    private sealed record EmployeeConflictDecisionPayload(int SessionCount, IReadOnlyList<EmployeeConflictSessionPayload> Sessions);

    private sealed record EmployeeConflictSessionPayload(Guid WorkSessionId, string WorkNumber, string SectionName);

    private sealed record PercoExitDuringWorkDecisionPayload(
        Guid PercoEventId,
        string PercoExternalEventId,
        DateTimeOffset EventAt,
        string DeviceName,
        string WorkNumber,
        string SectionName);

    private sealed record PercoMissingPresenceDecisionPayload(
        Guid ParticipationIntervalId,
        DateTimeOffset StartedAt,
        string WorkNumber,
        string SectionName);

    private sealed record PercoLunchExitDecisionPayload(
        Guid PercoEventId,
        string PercoExternalEventId,
        DateTimeOffset EventAt,
        string DeviceName,
        int OverlapMinutes,
        DateTimeOffset? LunchStartAt,
        DateTimeOffset? LunchEndAt,
        string WorkNumber,
        string SectionName)
    {
        public LunchDecisionPayload ToLunchPayload() =>
            new(OverlapMinutes, LunchStartAt, LunchEndAt);
    }

    private sealed record PercoAbsentAfterShiftDecisionPayload(
        Guid ParticipationIntervalId,
        DateTimeOffset ShiftEndAt,
        string WorkNumber,
        string SectionName);
}
