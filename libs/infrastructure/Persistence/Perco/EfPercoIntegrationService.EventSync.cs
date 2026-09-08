using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfPercoIntegrationService
{
    public async Task<PercoSyncResultDto> SyncEventsAsync(
        Guid? actorUserId,
        CancellationToken cancellationToken = default)
    {
        var settings = await GetOrCreateSettingsAsync(cancellationToken);
        var startedAt = DateTimeOffset.UtcNow;

        try
        {
            using var session = await CreateAuthenticatedSessionAsync(settings, cancellationToken);
            var syncState = await GetOrCreateSyncStateAsync(EventsSyncType, cancellationToken);
            var lastCursor = long.TryParse(syncState.LastCursor, out var parsedCursor) ? parsedCursor : 0;
            var activeProjectEmployeeIds = (await dbContext.Employees.AsNoTracking().ToListAsync(cancellationToken))
                .Where(IsActiveProjectEmployee)
                .Select(employee => employee.Id)
                .ToHashSet();
            var links = await dbContext.PercoEmployeeLinks
                .AsNoTracking()
                .Where(link => link.EmployeeId != null && (link.MatchStatus == "MATCHED" || link.MatchStatus == "AUTO_MATCHED"))
                .ToListAsync(cancellationToken);
            links = links.Where(link => link.EmployeeId is not null && activeProjectEmployeeIds.Contains(link.EmployeeId.Value)).ToList();
            var linksByPercoId = links.ToDictionary(link => link.PercoEmployeeId, StringComparer.OrdinalIgnoreCase);
            var linksByName = links
                .Where(link => !string.IsNullOrWhiteSpace(link.FullName))
                .GroupBy(link => NormalizeName(link.FullName))
                .Where(group => !string.IsNullOrWhiteSpace(group.Key) && group.Count() == 1)
                .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);
            // Deduplication intentionally looks up only the current PERCo page.
            // Loading every historical event ID/natural key was the dominant cost
            // of a normal sync on long-lived installations.
            var seenEventIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var seenNaturalKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            var loaded = 0;
            var inserted = 0;
            var duplicates = 0;
            var unmatched = 0;
            var skippedNotFactory = 0;
            var skippedInvalidTimestamp = 0;
            long maxCursor = lastCursor;
            var now = DateTimeOffset.UtcNow;
            var isReportEndpoint = IsAccessReportEventsEndpoint(settings.EventsEndpoint);

            for (var page = 1; page <= 50; page++)
            {
                var endpoint = BuildEventsEndpoint(settings, syncState, page, 100, now);
                var response = await GetJsonAsync<PercoEventsResponse>(session, endpoint, cancellationToken);
                var rows = response?.Rows ?? [];
                if (rows.Count == 0)
                {
                    break;
                }

                var candidates = new List<PendingPercoAccessEvent>();
                foreach (var row in rows
                    .OrderBy(row => IsTechnicalIndicationEvent(row) ? 1 : 0)
                    .ThenBy(row => row.Id))
                {
                    loaded++;
                    if (!IsRealAccessPassEvent(row))
                    {
                        skippedNotFactory++;
                        continue;
                    }

                    var direction = DetectDirection(row);
                    if (direction == "UNKNOWN")
                    {
                        skippedNotFactory++;
                        continue;
                    }

                    if (!TryParsePercoDate(row.TimeLabel, settings.Timezone, out var eventAt))
                    {
                        skippedInvalidTimestamp++;
                        continue;
                    }
                    var percoEmployeeId = row.UserId?.ToString(CultureInfo.InvariantCulture) ?? string.Empty;
                    var percoEventId = BuildPercoEventId(row, direction, eventAt, isReportEndpoint);
                    if (!isReportEndpoint)
                    {
                        maxCursor = Math.Max(maxCursor, row.Id);
                    }

                    if (!isReportEndpoint && row.Id <= lastCursor)
                    {
                        duplicates++;
                        continue;
                    }

                    var normalizedEventName = NormalizeName(row.Fio ?? string.Empty);
                    var link = !string.IsNullOrWhiteSpace(percoEmployeeId) && linksByPercoId.TryGetValue(percoEmployeeId, out var byId)
                        ? byId
                        : null;
                    if (!string.IsNullOrWhiteSpace(normalizedEventName)
                        && linksByName.TryGetValue(normalizedEventName, out var byName)
                        && (link is null || NormalizeName(link.FullName) != normalizedEventName))
                    {
                        link = byName;
                    }
                    var employeeId = link?.EmployeeId;
                    if (employeeId is null)
                    {
                        unmatched++;
                    }

                    var naturalKey = BuildAccessEventNaturalKey(direction, eventAt, percoEmployeeId, employeeId);
                    candidates.Add(new PendingPercoAccessEvent(row, direction, eventAt, percoEmployeeId, percoEventId, employeeId, naturalKey));
                }

                var candidateEventIds = candidates
                    .Select(candidate => candidate.PercoEventId)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToArray();
                var existingPageEventIds = candidateEventIds.Length == 0
                    ? new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                    : (await dbContext.PercoAccessEvents
                        .AsNoTracking()
                        .Where(eventRow => candidateEventIds.Contains(eventRow.PercoEventId))
                        .Select(eventRow => eventRow.PercoEventId)
                        .ToListAsync(cancellationToken))
                    .ToHashSet(StringComparer.OrdinalIgnoreCase);
                var nonEmptyPercoEmployeeIds = candidates
                    .Where(candidate => !string.IsNullOrWhiteSpace(candidate.PercoEmployeeId))
                    .Select(candidate => candidate.PercoEmployeeId)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToArray();
                var fallbackEmployeeIds = candidates
                    .Where(candidate => string.IsNullOrWhiteSpace(candidate.PercoEmployeeId) && candidate.EmployeeId is not null)
                    .Select(candidate => candidate.EmployeeId ?? Guid.Empty)
                    .Distinct()
                    .ToArray();
                var candidateStart = candidates.Count == 0 ? now : candidates.Min(candidate => candidate.EventAt);
                var candidateEnd = candidates.Count == 0 ? now : candidates.Max(candidate => candidate.EventAt);
                var existingPageNaturalKeys = candidates.Count == 0
                    ? new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                    : (await dbContext.PercoAccessEvents
                        .AsNoTracking()
                        .Where(eventRow =>
                            (eventRow.Direction == "IN" || eventRow.Direction == "OUT") &&
                            eventRow.EventAt >= candidateStart && eventRow.EventAt <= candidateEnd &&
                            (nonEmptyPercoEmployeeIds.Contains(eventRow.PercoEmployeeId) ||
                             (string.IsNullOrEmpty(eventRow.PercoEmployeeId) && eventRow.EmployeeId != null && fallbackEmployeeIds.Contains(eventRow.EmployeeId.Value))))
                        .Select(eventRow => new { eventRow.Direction, eventRow.EventAt, eventRow.PercoEmployeeId, eventRow.EmployeeId })
                        .ToListAsync(cancellationToken))
                    .Select(eventRow => BuildAccessEventNaturalKey(eventRow.Direction, eventRow.EventAt, eventRow.PercoEmployeeId, eventRow.EmployeeId))
                    .ToHashSet(StringComparer.OrdinalIgnoreCase);

                foreach (var candidate in candidates)
                {
                    if (existingPageEventIds.Contains(candidate.PercoEventId) || !seenEventIds.Add(candidate.PercoEventId))
                    {
                        duplicates++;
                        continue;
                    }

                    if (existingPageNaturalKeys.Contains(candidate.NaturalKey) || !seenNaturalKeys.Add(candidate.NaturalKey))
                    {
                        duplicates++;
                        continue;
                    }

                    var entity = new PercoAccessEventEntity
                    {
                        Id = Guid.NewGuid(),
                        PercoEventId = candidate.PercoEventId,
                        PercoEmployeeId = candidate.PercoEmployeeId,
                        EmployeeId = candidate.EmployeeId,
                        DeviceId = BuildPercoDeviceId(candidate.Row),
                        DeviceName = BuildPercoDeviceName(candidate.Row),
                        Direction = candidate.Direction,
                        EventAt = candidate.EventAt,
                        RawPayload = JsonSerializer.Serialize(candidate.Row, JsonOptions),
                        CreatedAt = now
                    };
                    dbContext.PercoAccessEvents.Add(entity);
                    inserted++;
                }

                if (response is null || page >= response.Total)
                {
                    break;
                }
            }

            var queuedEmployeeIds = dbContext.ChangeTracker.Entries<PercoAccessEventEntity>()
                .Where(entry => entry.State == EntityState.Added && entry.Entity.EmployeeId is not null)
                .Select(entry => entry.Entity.EmployeeId!.Value)
                .ToHashSet();
            await using (var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken))
            {
                await dbContext.Database.ExecuteSqlInterpolatedAsync(
                    $"SELECT pg_advisory_xact_lock({PresenceMutationLockKey})",
                    cancellationToken);
                await dbContext.SaveChangesAsync(cancellationToken);
                await EnqueuePresenceRebuildAsync(queuedEmployeeIds, cancellationToken);
                await dbContext.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
            }
            var rebuilt = await RebuildQueuedPresenceIntervalsAsync(cancellationToken);

            var finishedAt = DateTimeOffset.UtcNow;
            await UpsertSyncStateAsync(EventsSyncType, finishedAt, maxCursor.ToString(CultureInfo.InvariantCulture), string.Empty, cancellationToken);
            await AddLogAsync(
                "SYNC_EVENTS",
                "SUCCESS",
                $"Синхронизация проходов PERCo завершена: добавлено {inserted}.",
                $"endpoint={settings.EventsEndpoint}; mode={(isReportEndpoint ? "accessReports" : "cursor")}; loaded={loaded}; duplicates={duplicates}; skippedNotFactory={skippedNotFactory}; skippedInvalidTimestamp={skippedInvalidTimestamp}; unmatched={unmatched}; rebuiltEmployees={rebuilt.Employees}; rebuiltIntervals={rebuilt.Intervals}",
                actorUserId,
                startedAt,
                finishedAt,
                cancellationToken);
            await dbContext.SaveChangesAsync(cancellationToken);

            return new PercoSyncResultDto(true, "success", "Проходы PERCo синхронизированы.", loaded, 0, 0, inserted, duplicates, unmatched, 0, finishedAt);
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException or JsonException or InvalidOperationException)
        {
            var finishedAt = DateTimeOffset.UtcNow;
            await UpsertSyncStateAsync(EventsSyncType, null, string.Empty, exception.Message, cancellationToken);
            await AddLogAsync("SYNC_EVENTS", "ERROR", "Ошибка синхронизации проходов PERCo.", exception.Message, actorUserId, startedAt, finishedAt, cancellationToken);
            await dbContext.SaveChangesAsync(cancellationToken);
            return new PercoSyncResultDto(false, "error", "Ошибка синхронизации проходов PERCo.", 0, 0, 0, 0, 0, 0, 1, finishedAt);
        }
    }

    public async Task<int> RunAutomaticSyncIfDueAsync(
        DateTimeOffset now,
        CancellationToken cancellationToken = default)
    {
        var settings = await GetOrCreateSettingsAsync(cancellationToken);
        if (!settings.IsEnabled)
        {
            if ((await GetPresenceQueueDiagnosticsAsync(cancellationToken)).PendingEmployees > 0)
            {
                await RebuildQueuedPresenceIntervalsAsync(cancellationToken);
            }
            return 0;
        }

        var (secretStatus, secretError) = EvaluatePrimarySecret(settings);
        UpdateSecretCheck(settings, "worker", secretStatus, secretError, now);
        await dbContext.SaveChangesAsync(cancellationToken);
        if (secretStatus != "OK")
        {
            return 0;
        }

        var employeesState = await dbContext.PercoSyncStates
            .AsNoTracking()
            .FirstOrDefaultAsync(row => row.SyncType == EmployeesSyncType, cancellationToken);
        var eventsState = await dbContext.PercoSyncStates
            .AsNoTracking()
            .FirstOrDefaultAsync(row => row.SyncType == EventsSyncType, cancellationToken);

        var started = 0;
        var employeesDue = employeesState?.LastSuccessAt is null || IsSyncDue(employeesState.LastSuccessAt.Value, now, settings.EmployeesSyncMinutes);
        var employeesSucceeded = true;
        if (employeesDue)
        {
            var result = await SyncEmployeesAsync(null, cancellationToken);
            employeesSucceeded = result.Success;
            if (result.Success)
            {
                started++;
            }
        }

        var eventsDue = eventsState?.LastSuccessAt is null || IsSyncDue(eventsState.LastSuccessAt.Value, now, settings.EventsSyncMinutes);
        if (employeesSucceeded && eventsDue)
        {
            var result = await SyncEventsAsync(null, cancellationToken);
            if (result.Success)
            {
                started++;
            }
        }

        // A process can stop after event/link staging but before its presence
        // rebuild commits. Retry that durable work on every worker cycle instead
        // of waiting for the next remote PERCo synchronization interval.
        var pendingPresence = await GetPresenceQueueDiagnosticsAsync(cancellationToken);
        if (pendingPresence.PendingEmployees > 0)
        {
            await RebuildQueuedPresenceIntervalsAsync(cancellationToken);
        }

        return started;
    }

    private async Task<HashSet<Guid>> ReassignAccessEventEmployeesAsync(
        IReadOnlyCollection<PercoEmployeeLinkEntity> changedLinks,
        CancellationToken cancellationToken)
    {
        var normalizedLinks = changedLinks
            .Where(link => !string.IsNullOrWhiteSpace(link.PercoEmployeeId))
            .GroupBy(link => link.PercoEmployeeId, StringComparer.OrdinalIgnoreCase)
            .Select(group => group.Last())
            .ToList();
        if (normalizedLinks.Count == 0)
        {
            return [];
        }

        var activeEmployeeIds = await dbContext.Employees.AsNoTracking()
            .Where(employee => normalizedLinks.Select(link => link.EmployeeId).Contains(employee.Id))
            .Select(employee => employee.Id)
            .ToHashSetAsync(cancellationToken);
        var employeeByPercoId = normalizedLinks.ToDictionary(
            link => link.PercoEmployeeId,
            link => link.EmployeeId is not null &&
                link.MatchStatus is "MATCHED" or "AUTO_MATCHED" &&
                activeEmployeeIds.Contains(link.EmployeeId.Value)
                ? link.EmployeeId
                : null,
            StringComparer.OrdinalIgnoreCase);
        var percoEmployeeIds = employeeByPercoId.Keys.ToArray();
        var events = await dbContext.PercoAccessEvents
            .Where(row => percoEmployeeIds.Contains(row.PercoEmployeeId) &&
                (row.Direction == "IN" || row.Direction == "OUT"))
            .ToListAsync(cancellationToken);
        var affectedEmployeeIds = new HashSet<Guid>();

        foreach (var accessEvent in events)
        {
            if (!employeeByPercoId.TryGetValue(accessEvent.PercoEmployeeId, out var employeeId))
            {
                continue;
            }

            if (accessEvent.EmployeeId != employeeId)
            {
                if (accessEvent.EmployeeId is not null)
                {
                    affectedEmployeeIds.Add(accessEvent.EmployeeId.Value);
                }
                if (employeeId is not null)
                {
                    affectedEmployeeIds.Add(employeeId.Value);
                }
                accessEvent.EmployeeId = employeeId;
            }
        }

        return affectedEmployeeIds;
    }

    private async Task EnqueuePresenceRebuildAsync(
        IEnumerable<Guid> employeeIds,
        CancellationToken cancellationToken)
    {
        var distinctEmployeeIds = employeeIds.Distinct().ToArray();
        if (distinctEmployeeIds.Length == 0)
        {
            return;
        }

        var alreadyQueued = await dbContext.PercoPresenceRebuildQueue
            .Where(row => distinctEmployeeIds.Contains(row.EmployeeId))
            .Select(row => row.EmployeeId)
            .ToHashSetAsync(cancellationToken);
        var now = DateTimeOffset.UtcNow;
        dbContext.PercoPresenceRebuildQueue.AddRange(distinctEmployeeIds
            .Where(employeeId => !alreadyQueued.Contains(employeeId))
            .Select(employeeId => new PercoPresenceRebuildQueueEntity
            {
                EmployeeId = employeeId,
                EnqueuedAt = now
            }));
    }

    private async Task<PercoSyncStateEntity> GetOrCreateSyncStateAsync(string syncType, CancellationToken cancellationToken)
    {
        var state = await dbContext.PercoSyncStates
            .Where(row => row.SyncType == syncType)
            .OrderBy(row => row.Id)
            .FirstOrDefaultAsync(cancellationToken);
        if (state is not null)
        {
            return state;
        }

        state = new PercoSyncStateEntity
        {
            Id = Guid.NewGuid(),
            SyncType = syncType,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        dbContext.PercoSyncStates.Add(state);
        return state;
    }

    private async Task UpsertSyncStateAsync(
        string syncType,
        DateTimeOffset? lastSuccessAt,
        string lastCursor,
        string lastError,
        CancellationToken cancellationToken)
    {
        var state = await GetOrCreateSyncStateAsync(syncType, cancellationToken);
        if (lastSuccessAt is not null)
        {
            state.LastSuccessAt = lastSuccessAt;
        }

        if (!string.IsNullOrWhiteSpace(lastCursor))
        {
            state.LastCursor = lastCursor;
        }

        state.LastError = lastError;
        state.UpdatedAt = DateTimeOffset.UtcNow;
    }

    private static string NormalizePercoDirection(string value)
    {
        var normalized = value.Trim().ToUpperInvariant();
        return normalized is "IN" or "OUT" ? normalized : "UNKNOWN";
    }

    private static string BuildAccessEventNaturalKey(
        string direction,
        DateTimeOffset eventAt,
        string? percoEmployeeId,
        Guid? employeeId)
    {
        var personKey = !string.IsNullOrWhiteSpace(percoEmployeeId)
            ? percoEmployeeId.Trim()
            : employeeId?.ToString("D") ?? string.Empty;
        return $"{NormalizePercoDirection(direction)}|{eventAt.ToUnixTimeSeconds()}|{personKey}";
    }

    private sealed record PendingPercoAccessEvent(
        PercoEventRow Row,
        string Direction,
        DateTimeOffset EventAt,
        string PercoEmployeeId,
        string PercoEventId,
        Guid? EmployeeId,
        string NaturalKey);

    private static string BuildPercoEventId(
        PercoEventRow row,
        string direction,
        DateTimeOffset eventAt,
        bool isReportEndpoint)
    {
        if (!isReportEndpoint)
        {
            return row.Id.ToString(CultureInfo.InvariantCulture);
        }

        var personKey = row.UserId?.ToString(CultureInfo.InvariantCulture) ?? NormalizeName(row.Fio ?? string.Empty);
        var identifier = (row.Identifier ?? string.Empty).Trim();
        var transition = $"{row.ZoneExitId?.ToString(CultureInfo.InvariantCulture) ?? string.Empty}->{row.ZoneEnterId?.ToString(CultureInfo.InvariantCulture) ?? string.Empty}";
        return $"accessReports|{eventAt.ToUnixTimeSeconds()}|{NormalizePercoDirection(direction)}|{personKey}|{identifier}|{transition}";
    }

    private static bool IsRealAccessPassEvent(PercoEventRow row)
    {
        var eventName = NormalizeName(row.EventName ?? string.Empty);
        if (string.IsNullOrWhiteSpace(eventName))
        {
            return true;
        }

        return eventName.Contains("проход", StringComparison.OrdinalIgnoreCase)
            || eventName.Contains("access", StringComparison.OrdinalIgnoreCase)
            || eventName.Contains("pass", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsTechnicalIndicationEvent(PercoEventRow row)
    {
        var eventName = NormalizeName(row.EventName ?? string.Empty);
        return eventName.Contains("индикац", StringComparison.OrdinalIgnoreCase)
            && eventName.Contains("проход", StringComparison.OrdinalIgnoreCase);
    }

    internal static bool IsStoredTechnicalIndicationEvent(string? rawPayload)
    {
        if (string.IsNullOrWhiteSpace(rawPayload))
        {
            return false;
        }

        try
        {
            using var document = JsonDocument.Parse(rawPayload);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                return false;
            }

            if (!root.TryGetProperty("event_name", out var eventNameElement) &&
                !root.TryGetProperty("eventName", out eventNameElement))
            {
                return false;
            }

            if (eventNameElement.ValueKind != JsonValueKind.String)
            {
                return false;
            }

            var eventName = NormalizeName(eventNameElement.GetString() ?? string.Empty);
            return eventName.Contains("индикац", StringComparison.OrdinalIgnoreCase)
                && eventName.Contains("проход", StringComparison.OrdinalIgnoreCase);
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static string DetectDirection(PercoEventRow row)
    {
        var enter = (row.ZoneEnter ?? string.Empty).ToLowerInvariant();
        var exit = (row.ZoneExit ?? string.Empty).ToLowerInvariant();
        if (IsFactoryZone(enter) && IsUncontrolledZone(exit))
        {
            return "IN";
        }

        if (IsFactoryZone(exit) && IsUncontrolledZone(enter))
        {
            return "OUT";
        }

        var point = (row.VerifyPoint ?? string.Empty).ToLowerInvariant();
        if (IsFactoryPoint(point) && point.Contains("вход", StringComparison.OrdinalIgnoreCase))
        {
            return "IN";
        }

        if (IsFactoryPoint(point) && point.Contains("выход", StringComparison.OrdinalIgnoreCase))
        {
            return "OUT";
        }

        return "UNKNOWN";
    }

    private static bool IsFactoryZone(string value) =>
        value.Contains("завод", StringComparison.OrdinalIgnoreCase);

    private static bool IsUncontrolledZone(string value) =>
        value.Contains("неконтрол", StringComparison.OrdinalIgnoreCase);

    private static bool IsFactoryPoint(string value) =>
        value.Contains("завод", StringComparison.OrdinalIgnoreCase);

    private static string BuildPercoDeviceId(PercoEventRow row)
    {
        if (!string.IsNullOrWhiteSpace(row.VerifyPoint))
        {
            return row.VerifyPoint.Trim();
        }

        var exitId = row.ZoneExitId?.ToString(CultureInfo.InvariantCulture) ?? string.Empty;
        var enterId = row.ZoneEnterId?.ToString(CultureInfo.InvariantCulture) ?? string.Empty;
        return string.IsNullOrWhiteSpace(exitId + enterId) ? string.Empty : $"{exitId}->{enterId}";
    }

    private static string BuildPercoDeviceName(PercoEventRow row)
    {
        if (!string.IsNullOrWhiteSpace(row.VerifyPoint))
        {
            return row.VerifyPoint.Trim();
        }

        var exit = row.ZoneExit?.Trim() ?? string.Empty;
        var enter = row.ZoneEnter?.Trim() ?? string.Empty;
        if (!string.IsNullOrWhiteSpace(exit) && !string.IsNullOrWhiteSpace(enter))
        {
            return $"{exit} -> {enter}";
        }

        return exit + enter;
    }

    internal static bool TryParsePercoDate(string? value, string timezone, out DateTimeOffset parsedUtc)
    {
        parsedUtc = default;
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        if (!DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AllowWhiteSpaces, out var parsed))
        {
            return false;
        }

        var zone = ResolveTimezone(timezone);
        var unspecified = DateTime.SpecifyKind(parsed, DateTimeKind.Unspecified);
        parsedUtc = new DateTimeOffset(unspecified, zone.GetUtcOffset(unspecified)).ToUniversalTime();
        return true;
    }
}
