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
            var existingEventIds = await dbContext.PercoAccessEvents
                .AsNoTracking()
                .Select(row => row.PercoEventId)
                .ToListAsync(cancellationToken);
            var existingSet = existingEventIds.ToHashSet(StringComparer.OrdinalIgnoreCase);
            var existingNaturalKeys = (await dbContext.PercoAccessEvents
                    .AsNoTracking()
                    .Where(row => row.Direction == "IN" || row.Direction == "OUT")
                    .Select(row => new { row.Direction, row.EventAt, row.PercoEmployeeId, row.EmployeeId })
                    .ToListAsync(cancellationToken))
                .Select(row => BuildAccessEventNaturalKey(row.Direction, row.EventAt, row.PercoEmployeeId, row.EmployeeId))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

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

                    if ((!isReportEndpoint && row.Id <= lastCursor) || existingSet.Contains(percoEventId))
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
                    if (existingNaturalKeys.Contains(naturalKey))
                    {
                        duplicates++;
                        existingSet.Add(percoEventId);
                        continue;
                    }

                    var entity = new PercoAccessEventEntity
                    {
                        Id = Guid.NewGuid(),
                        PercoEventId = percoEventId,
                        PercoEmployeeId = percoEmployeeId,
                        EmployeeId = employeeId,
                        DeviceId = BuildPercoDeviceId(row),
                        DeviceName = BuildPercoDeviceName(row),
                        Direction = direction,
                        EventAt = eventAt,
                        RawPayload = JsonSerializer.Serialize(row, JsonOptions),
                        CreatedAt = now
                    };
                    dbContext.PercoAccessEvents.Add(entity);
                    existingSet.Add(percoEventId);
                    existingNaturalKeys.Add(naturalKey);
                    inserted++;
                }

                if (response is null || page >= response.Total)
                {
                    break;
                }
            }

            await dbContext.SaveChangesAsync(cancellationToken);
            var backfilledEvents = await BackfillAccessEventEmployeesAsync(cancellationToken);
            await RebuildPresenceIntervalsForNewEventsAsync(cancellationToken);

            var finishedAt = DateTimeOffset.UtcNow;
            await UpsertSyncStateAsync(EventsSyncType, finishedAt, maxCursor.ToString(CultureInfo.InvariantCulture), string.Empty, cancellationToken);
            await AddLogAsync(
                "SYNC_EVENTS",
                "SUCCESS",
                $"Синхронизация проходов PERCo завершена: добавлено {inserted}.",
                $"endpoint={settings.EventsEndpoint}; mode={(isReportEndpoint ? "accessReports" : "cursor")}; loaded={loaded}; duplicates={duplicates}; skippedNotFactory={skippedNotFactory}; skippedInvalidTimestamp={skippedInvalidTimestamp}; unmatched={unmatched}; backfilledEvents={backfilledEvents}",
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
        if (employeesState?.LastSuccessAt is null || IsSyncDue(employeesState.LastSuccessAt.Value, now, settings.EmployeesSyncMinutes))
        {
            var result = await SyncEmployeesAsync(null, cancellationToken);
            if (result.Success)
            {
                started++;
            }
        }

        if (eventsState?.LastSuccessAt is null || IsSyncDue(eventsState.LastSuccessAt.Value, now, settings.EventsSyncMinutes))
        {
            var result = await SyncEventsAsync(null, cancellationToken);
            if (result.Success)
            {
                started++;
            }
        }

        return started;
    }

    private async Task<int> BackfillAccessEventEmployeesAsync(CancellationToken cancellationToken)
    {
        var activeProjectEmployeeIds = (await dbContext.Employees.AsNoTracking().ToListAsync(cancellationToken))
            .Where(IsActiveProjectEmployee)
            .Select(employee => employee.Id)
            .ToHashSet();
        var links = await dbContext.PercoEmployeeLinks
            .AsNoTracking()
            .Where(row => row.EmployeeId != null && (row.MatchStatus == "MATCHED" || row.MatchStatus == "AUTO_MATCHED"))
            .Select(row => new { row.PercoEmployeeId, row.EmployeeId })
            .ToListAsync(cancellationToken);
        var employeeByPercoId = links
            .Where(row => !string.IsNullOrWhiteSpace(row.PercoEmployeeId) && row.EmployeeId is not null && activeProjectEmployeeIds.Contains(row.EmployeeId.Value))
            .GroupBy(row => row.PercoEmployeeId, StringComparer.OrdinalIgnoreCase)
            .Where(group => group.Count() == 1)
            .ToDictionary(group => group.Key, group => group.First().EmployeeId, StringComparer.OrdinalIgnoreCase);

        if (employeeByPercoId.Count == 0)
        {
            return 0;
        }

        var events = await dbContext.PercoAccessEvents
            .Where(row => row.PercoEmployeeId != string.Empty && (row.Direction == "IN" || row.Direction == "OUT"))
            .ToListAsync(cancellationToken);
        var updated = 0;

        foreach (var accessEvent in events)
        {
            if (!employeeByPercoId.TryGetValue(accessEvent.PercoEmployeeId, out var employeeId) || employeeId is null)
            {
                continue;
            }

            if (accessEvent.EmployeeId != employeeId)
            {
                accessEvent.EmployeeId = employeeId;
                updated++;
            }
        }

        if (updated > 0)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return updated;
    }

    private async Task<PercoSyncStateEntity> GetOrCreateSyncStateAsync(string syncType, CancellationToken cancellationToken)
    {
        var state = await dbContext.PercoSyncStates.FirstOrDefaultAsync(row => row.SyncType == syncType, cancellationToken);
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
