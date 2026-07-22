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
    public async Task<PercoDiagnosticsDto> GetDiagnosticsAsync(
        int take = 100,
        CancellationToken cancellationToken = default)
    {
        var normalizedTake = Clamp(take, 10, 500);
        var now = DateTimeOffset.UtcNow;
        var settings = await GetOrCreateSettingsAsync(cancellationToken);
        var (windowStart, windowEnd) = GetDiagnosticsWindow(now, settings.Timezone);

        if (!await PercoDiagnosticsTablesExistAsync(cancellationToken))
        {
            return new PercoDiagnosticsDto(now, windowStart, windowEnd, 0, 0, 0, 0, 0, [], []);
        }

        var recentEventRows = await dbContext.PercoAccessEvents
            .AsNoTracking()
            .Include(row => row.Employee)
            .Where(row =>
                (row.Direction == "IN" || row.Direction == "OUT") &&
                row.EventAt >= windowStart &&
                row.EventAt <= windowEnd)
            .OrderByDescending(row => row.EventAt)
            .Take(normalizedTake * 3)
            .ToListAsync(cancellationToken);
        var recentEvents = recentEventRows
            .Where(row => !IsStoredTechnicalIndicationEvent(row.RawPayload))
            .GroupBy(row => BuildAccessEventNaturalKey(row.Direction, row.EventAt, row.PercoEmployeeId, row.EmployeeId), StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .Take(normalizedTake)
            .ToList();

        var currentPresenceIntervals = await dbContext.EmployeePresenceIntervals
            .AsNoTracking()
            .Include(row => row.Employee)
            .Where(row =>
                row.StartedAt >= windowStart ||
                (row.EndedAt != null && row.EndedAt >= windowStart))
            .OrderByDescending(row => row.EndedAt == null)
            .ThenByDescending(row => row.DurationMinutes >= MaxReliablePresenceMinutes)
            .ThenByDescending(row => row.StartedAt)
            .Take(normalizedTake)
            .ToListAsync(cancellationToken);

        var oldOpenPresenceCount = await dbContext.EmployeePresenceIntervals
            .AsNoTracking()
            .CountAsync(row =>
                row.Source == "PERCO" &&
                row.EndedAt == null &&
                row.StartedAt < windowStart,
                cancellationToken);

        var oldOpenPresenceIntervals = await dbContext.EmployeePresenceIntervals
            .AsNoTracking()
            .Include(row => row.Employee)
            .Where(row =>
                row.Source == "PERCO" &&
                row.EndedAt == null &&
                row.StartedAt < windowStart)
            .OrderByDescending(row => row.StartedAt)
            .Take(Math.Min(50, normalizedTake))
            .ToListAsync(cancellationToken);

        var presenceIntervals = currentPresenceIntervals
            .Concat(oldOpenPresenceIntervals)
            .GroupBy(row => row.Id)
            .Select(group => group.First())
            .ToList();

        var unmatchedEventRows = await dbContext.PercoAccessEvents
            .AsNoTracking()
            .Where(row =>
                row.EmployeeId == null &&
                (row.Direction == "IN" || row.Direction == "OUT") &&
                row.EventAt >= windowStart &&
                row.EventAt <= windowEnd)
            .Select(row => new { row.Direction, row.EventAt, row.PercoEmployeeId, row.EmployeeId, row.RawPayload })
            .ToListAsync(cancellationToken);
        var unmatchedEventsCount = unmatchedEventRows
            .Where(row => !IsStoredTechnicalIndicationEvent(row.RawPayload))
            .Select(row => BuildAccessEventNaturalKey(row.Direction, row.EventAt, row.PercoEmployeeId, row.EmployeeId))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Count();

        var openPresenceIntervals = await dbContext.EmployeePresenceIntervals
            .AsNoTracking()
            .Where(row => row.EndedAt == null && row.StartedAt >= windowStart)
            .ToListAsync(cancellationToken);
        var openPresenceCount = openPresenceIntervals.Count(row => IsCurrentOpenPresenceInterval(row, now, settings.Timezone));
        var closedPresenceCount = await dbContext.EmployeePresenceIntervals
            .AsNoTracking()
            .Where(row =>
                row.Source == "PERCO" &&
                row.EndedAt != null &&
                row.EndedAt >= windowStart &&
                row.EndedAt <= windowEnd &&
                row.DurationMinutes < MaxReliablePresenceMinutes)
            .Select(row => row.EmployeeId)
            .Distinct()
            .CountAsync(cancellationToken);

        return new PercoDiagnosticsDto(
            now,
            windowStart,
            windowEnd,
            recentEvents.Count,
            openPresenceCount,
            closedPresenceCount,
            oldOpenPresenceCount,
            unmatchedEventsCount,
            recentEvents.Select(row => ToAccessEventDiagnosticsDto(row, settings.Timezone)).ToList(),
            presenceIntervals.Select(row => ToPresenceDiagnosticsDto(row, now, settings.Timezone, presenceIntervals)).ToList());
    }

    private static (DateTimeOffset Start, DateTimeOffset End) GetDiagnosticsWindow(DateTimeOffset nowUtc, string timezone)
    {
        var zone = ResolveTimezone(timezone);
        var localNow = TimeZoneInfo.ConvertTime(nowUtc, zone);
        var localStart = localNow.Date.AddHours(-12);
        var localEnd = localNow.Date.AddDays(1).AddHours(12);
        var startOffset = new DateTimeOffset(localStart, zone.GetUtcOffset(localStart)).ToUniversalTime();
        var endOffset = new DateTimeOffset(localEnd, zone.GetUtcOffset(localEnd)).ToUniversalTime();
        return (startOffset, endOffset);
    }

    private async Task<bool> PercoDiagnosticsTablesExistAsync(CancellationToken cancellationToken)
    {
        var tableNames = await dbContext.Database.SqlQueryRaw<string>(
                """
                SELECT table_name AS "Value"
                FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_name IN ('perco_access_events', 'employee_presence_intervals')
                """)
            .ToListAsync(cancellationToken);

        return tableNames.Contains("perco_access_events", StringComparer.OrdinalIgnoreCase) &&
               tableNames.Contains("employee_presence_intervals", StringComparer.OrdinalIgnoreCase);
    }

    private static PercoAccessEventDiagnosticsDto ToAccessEventDiagnosticsDto(PercoAccessEventEntity row, string timezone)
    {
        var direction = NormalizePercoDirection(row.Direction);
        return new PercoAccessEventDiagnosticsDto(
            row.Id,
            row.PercoEventId,
            row.PercoEmployeeId,
            row.EmployeeId,
            row.Employee?.FullName ?? string.Empty,
            row.Employee?.PersonnelNo ?? string.Empty,
            string.IsNullOrWhiteSpace(row.DeviceName) ? row.DeviceId : row.DeviceName,
            direction,
            FormatDirectionLabel(direction),
            FormatZoneTransition(direction),
            FormatShiftMarker(direction, row.EventAt, timezone),
            row.EventAt);
    }

    private static PercoPresenceIntervalDiagnosticsDto ToPresenceDiagnosticsDto(
        EmployeePresenceIntervalEntity row,
        DateTimeOffset now,
        string timezone,
        IReadOnlyCollection<EmployeePresenceIntervalEntity> visibleIntervals)
    {
        var duration = row.EndedAt is null
            ? Math.Max(0, (int)Math.Round((now - row.StartedAt).TotalMinutes))
            : Math.Max(0, (int)Math.Round((row.EndedAt.Value - row.StartedAt).TotalMinutes));
        var state = BuildPresenceState(row, now, timezone, visibleIntervals);
        var stateCode = BuildPresenceStateCode(row, now, timezone, visibleIntervals);
        var analysis = BuildPresenceAnalysis(row, now, timezone, visibleIntervals, stateCode);

        return new PercoPresenceIntervalDiagnosticsDto(
            row.Id,
            row.EmployeeId,
            row.Employee.FullName,
            row.Employee.PersonnelNo,
            row.StartedAt,
            row.EndedAt,
            duration,
            row.Source,
            state,
            stateCode,
            stateCode is "stale" or "old_open",
            analysis.Reason,
            analysis.SuggestedAction,
            analysis.Confidence);
    }

    private static PercoPresenceAnalysis BuildPresenceAnalysis(
        EmployeePresenceIntervalEntity row,
        DateTimeOffset now,
        string timezone,
        IReadOnlyCollection<EmployeePresenceIntervalEntity> visibleIntervals,
        string stateCode)
    {
        if (string.Equals(row.Source, "PERCO_REVIEW", StringComparison.OrdinalIgnoreCase))
        {
            return new PercoPresenceAnalysis(
                "PERCo прислал подтвержденный выход, но длительность интервала больше допустимых 18 часов.",
                "Интервал автоматически закрыт по подтвержденному выходу; оставить предупреждение для разбора аномальной длительности.",
                95);
        }

        if (stateCode == "old_open")
        {
            return new PercoPresenceAnalysis(
                "Открытый вход старше предыдущих суток, подтвержденный выход в PERCo не найден.",
                "Не закрывать автоматически. Сверить с журналом охраны и закрыть вручную с причиной.",
                35);
        }

        if (stateCode == "stale")
        {
            return new PercoPresenceAnalysis(
                row.EndedAt is null
                    ? "Открытый вход превысил допустимую длительность смены, выход не найден."
                    : "Интервал закрыт, но длительность превышает допустимые 18 часов.",
                "Отправить оператору на проверку, не использовать как обычную смену в текущей явке.",
                55);
        }

        if (stateCode == "lunch_break")
        {
            return new PercoPresenceAnalysis(
                "Найден дневной выход и повторный вход в течение 3 часов, это похоже на обеденный перерыв.",
                "Не закрывать смену, учитывать как временное отсутствие.",
                80);
        }

        if (stateCode == "inside")
        {
            return new PercoPresenceAnalysis(
                "Есть вход на завод, выхода пока нет, интервал укладывается в допустимую смену.",
                "Показывать сотрудника в блоке «Сейчас на заводе».",
                90);
        }

        return new PercoPresenceAnalysis(
            "Есть подтвержденные вход и выход в пределах допустимой длительности смены.",
            "Показывать в блоке завершенных смен.",
            95);
    }

    private static string BuildPresenceStateCode(
        EmployeePresenceIntervalEntity row,
        DateTimeOffset now,
        string timezone,
        IReadOnlyCollection<EmployeePresenceIntervalEntity> visibleIntervals)
    {
        if (row.EndedAt is null)
        {
            return IsCurrentOpenPresenceInterval(row, now, timezone)
                ? "inside"
                : IsOldOpenPresenceInterval(row, now, timezone)
                    ? "old_open"
                    : "stale";
        }

        var durationMinutes = Math.Max(0, (int)Math.Round((row.EndedAt.Value - row.StartedAt).TotalMinutes));
        if (string.Equals(row.Source, "PERCO_REVIEW", StringComparison.OrdinalIgnoreCase))
        {
            return "outside_review";
        }

        if (durationMinutes >= MaxReliablePresenceMinutes)
        {
            return "stale";
        }

        var endedAt = row.EndedAt.GetValueOrDefault();
        if (IsLikelyLunchEvent(endedAt, timezone))
        {
            var returnedAfterLunch = visibleIntervals.Any(other =>
                other.EmployeeId == row.EmployeeId &&
                other.Id != row.Id &&
                other.StartedAt >= endedAt &&
                other.StartedAt <= endedAt.AddHours(3) &&
                IsLikelyLunchEvent(other.StartedAt, timezone));

            if (returnedAfterLunch)
            {
                return "lunch_break";
            }
        }

        return "outside";
    }

    private static string BuildPresenceState(
        EmployeePresenceIntervalEntity row,
        DateTimeOffset now,
        string timezone,
        IReadOnlyCollection<EmployeePresenceIntervalEntity> visibleIntervals)
    {
        if (row.EndedAt is null)
        {
            var localStarted = TimeZoneInfo.ConvertTime(row.StartedAt, ResolveTimezone(timezone));
            var localNow = TimeZoneInfo.ConvertTime(now, ResolveTimezone(timezone));
            if (localStarted.Date < localNow.Date.AddDays(-1))
            {
                return "Старый открытый интервал, не входит в текущую смену";
            }

            return IsCurrentOpenPresenceInterval(row, now, timezone)
                ? "На территории"
                : "Нет выхода, требует проверки";
        }

        var durationMinutes = row.EndedAt is null
            ? Math.Max(0, (int)Math.Round((now - row.StartedAt).TotalMinutes))
            : Math.Max(0, (int)Math.Round((row.EndedAt.Value - row.StartedAt).TotalMinutes));

        if (string.Equals(row.Source, "PERCO_REVIEW", StringComparison.OrdinalIgnoreCase))
        {
            return "Вышел по подтвержденному событию PERCo, длительность требует разбора";
        }

        if (durationMinutes >= MaxReliablePresenceMinutes)
        {
            return "Длительный интервал, требует проверки";
        }

        var endedAt = row.EndedAt.GetValueOrDefault();
        if (!IsLikelyLunchEvent(endedAt, timezone))
        {
            return "Вышел";
        }

        var returnedAfterLunch = visibleIntervals.Any(other =>
            other.EmployeeId == row.EmployeeId &&
            other.Id != row.Id &&
            other.StartedAt >= endedAt &&
            other.StartedAt <= endedAt.AddHours(3) &&
            IsLikelyLunchEvent(other.StartedAt, timezone));

        return returnedAfterLunch
            ? "Обеденный выход, смена продолжается"
            : "Вышел на обед";
    }

    private static bool IsCurrentOpenPresenceInterval(EmployeePresenceIntervalEntity row, DateTimeOffset now, string timezone)
    {
        if (row.EndedAt is not null)
        {
            return false;
        }

        var zone = ResolveTimezone(timezone);
        var localStarted = TimeZoneInfo.ConvertTime(row.StartedAt, zone);
        var localNow = TimeZoneInfo.ConvertTime(now, zone);

        if (localStarted.Date == localNow.Date)
        {
            return now - row.StartedAt <= MaxReliablePresenceDuration;
        }

        var previousNightShift =
            localStarted.Date == localNow.Date.AddDays(-1) &&
            localStarted.TimeOfDay >= TimeSpan.FromHours(18) &&
            localNow.TimeOfDay <= TimeSpan.FromHours(12);

        return previousNightShift && now - row.StartedAt <= MaxReliablePresenceDuration;
    }

    private static bool IsOldOpenPresenceInterval(EmployeePresenceIntervalEntity row, DateTimeOffset now, string timezone)
    {
        if (row.EndedAt is not null)
        {
            return false;
        }

        var zone = ResolveTimezone(timezone);
        var localStarted = TimeZoneInfo.ConvertTime(row.StartedAt, zone);
        var localNow = TimeZoneInfo.ConvertTime(now, zone);
        return localStarted.Date < localNow.Date.AddDays(-1);
    }
}
