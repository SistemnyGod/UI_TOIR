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
    public async Task<PercoSyncResultDto> ClosePresenceIntervalAsync(
        Guid intervalId,
        ClosePercoPresenceIntervalDto request,
        Guid? actorUserId,
        CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow;
        var comment = (request.Comment ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(comment))
        {
            return new PercoSyncResultDto(false, "validation_error", "Укажите причину ручного закрытия прохода.", 0, 0, 0, 0, 0, 0, 1, now);
        }

        var interval = await dbContext.EmployeePresenceIntervals
            .Include(row => row.Employee)
            .FirstOrDefaultAsync(row => row.Id == intervalId, cancellationToken);
        if (interval is null)
        {
            return new PercoSyncResultDto(false, "not_found", "Интервал присутствия не найден.", 0, 0, 0, 0, 0, 0, 1, now);
        }

        if (interval.EndedAt is not null)
        {
            return new PercoSyncResultDto(false, "validation_error", "Интервал уже закрыт.", 0, 0, 0, 0, 0, 0, 1, now);
        }

        if (request.EndedAt < interval.StartedAt)
        {
            return new PercoSyncResultDto(false, "validation_error", "Время выхода не может быть раньше входа.", 0, 0, 0, 0, 0, 0, 1, now);
        }

        if (request.EndedAt > now.AddMinutes(2))
        {
            return new PercoSyncResultDto(false, "validation_error", "Время выхода не может быть позже текущего времени.", 0, 0, 0, 0, 0, 0, 1, now);
        }

        var manualDuration = request.EndedAt - interval.StartedAt;
        if (manualDuration > MaxReliablePresenceDuration)
        {
            return new PercoSyncResultDto(false, "validation_error", "Ручное закрытие не может создавать интервал больше 18 часов. Укажите фактическое время выхода в день входа.", 0, 0, 0, 0, 0, 0, 1, now);
        }

        interval.EndedAt = request.EndedAt;
        interval.DurationMinutes = Math.Max(0, (int)Math.Round(manualDuration.TotalMinutes));
        interval.Source = "PERCO_MANUAL";

        await AddLogAsync(
            "CLOSE_PRESENCE_INTERVAL",
            "SUCCESS",
            "Интервал присутствия PERCo закрыт вручную.",
            $"employee={interval.Employee.FullName}; startedAt={interval.StartedAt:O}; endedAt={request.EndedAt:O}; comment={comment}",
            actorUserId,
            now,
            now,
            cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);

        return new PercoSyncResultDto(true, "success", "Интервал присутствия закрыт вручную.", 0, 0, 1, 0, 0, 0, 0, now);
    }

    private async Task RebuildPresenceIntervalsForNewEventsAsync(CancellationToken cancellationToken)
    {
        var events = (await dbContext.PercoAccessEvents
            .AsNoTracking()
            .Where(row => row.EmployeeId != null && (row.Direction == "IN" || row.Direction == "OUT"))
            .OrderBy(row => row.EmployeeId)
            .ThenBy(row => row.EventAt)
            .ThenBy(row => row.Direction == "OUT")
            .ThenBy(row => row.Id)
            .ToListAsync(cancellationToken))
            .Where(row => !IsStoredTechnicalIndicationEvent(row.RawPayload))
            .GroupBy(row => BuildAccessEventNaturalKey(row.Direction, row.EventAt, row.PercoEmployeeId, row.EmployeeId), StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .ToList();
        var now = DateTimeOffset.UtcNow;
        var rebuilt = new List<EmployeePresenceIntervalEntity>();
        var manuallyClosedOpenedEventIds = await dbContext.EmployeePresenceIntervals
            .AsNoTracking()
            .Where(row => row.Source == "PERCO_MANUAL" && row.OpenedByEventId != null)
            .Select(row => row.OpenedByEventId!.Value)
            .ToHashSetAsync(cancellationToken);

        await dbContext.EmployeePresenceIntervals
            .Where(row => row.Source == "PERCO" || row.Source == "PERCO_REVIEW")
            .ExecuteDeleteAsync(cancellationToken);

        foreach (var group in events.GroupBy(row => row.EmployeeId!.Value))
        {
            EmployeePresenceIntervalEntity? openInterval = null;

            foreach (var accessEvent in group)
            {
                if (accessEvent.Direction == "IN")
                {
                    if (manuallyClosedOpenedEventIds.Contains(accessEvent.Id))
                    {
                        openInterval = null;
                        continue;
                    }

                    if (openInterval is not null)
                    {
                        if (accessEvent.EventAt - openInterval.StartedAt <= MaxReliablePresenceDuration)
                        {
                            continue;
                        }
                    }

                    openInterval = new EmployeePresenceIntervalEntity
                    {
                        Id = Guid.NewGuid(),
                        EmployeeId = group.Key,
                        OpenedByEventId = accessEvent.Id,
                        StartedAt = accessEvent.EventAt,
                        Source = "PERCO",
                        CreatedAt = now
                    };
                    rebuilt.Add(openInterval);
                    continue;
                }

                if (openInterval is null || openInterval.StartedAt > accessEvent.EventAt)
                {
                    continue;
                }

                var duration = accessEvent.EventAt - openInterval.StartedAt;
                if (duration > MaxReliablePresenceDuration)
                {
                    openInterval.ClosedByEventId = accessEvent.Id;
                    openInterval.EndedAt = accessEvent.EventAt;
                    openInterval.DurationMinutes = Math.Max(0, (int)Math.Round(duration.TotalMinutes));
                    openInterval.Source = "PERCO_REVIEW";
                    openInterval = null;
                    continue;
                }

                openInterval.ClosedByEventId = accessEvent.Id;
                openInterval.EndedAt = accessEvent.EventAt;
                openInterval.DurationMinutes = Math.Max(0, (int)Math.Round(duration.TotalMinutes));
                openInterval = null;
            }
        }

        dbContext.EmployeePresenceIntervals.AddRange(rebuilt);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private static string FormatDirectionLabel(string direction) =>
        direction switch
        {
            "IN" => "Вход на завод",
            "OUT" => "Выход с завода",
            _ => "Направление не определено"
        };

    private static string FormatZoneTransition(string direction) =>
        direction switch
        {
            "IN" => "Неконтролируемая зона -> Завод",
            "OUT" => "Завод -> Неконтролируемая зона",
            _ => "Зона не определена"
        };

    private static string FormatShiftMarker(string direction, DateTimeOffset eventAt, string timezone)
    {
        if (IsLikelyLunchEvent(eventAt, timezone))
        {
            return direction switch
            {
                "IN" => "Возврат с обеда, смена продолжается",
                "OUT" => "Выход на обед, не окончание смены",
                _ => "Обеденное событие требует проверки"
            };
        }

        return direction switch
        {
            "IN" => "Возможное начало смены",
            "OUT" => "Возможное окончание смены",
            _ => "Нужна проверка"
        };
    }

    private static bool IsLikelyLunchEvent(DateTimeOffset eventAt, string timezone)
    {
        var zone = ResolveTimezone(timezone);
        var localTime = TimeOnly.FromDateTime(TimeZoneInfo.ConvertTime(eventAt, zone).DateTime);
        return IsTimeBetween(localTime, new TimeOnly(11, 30), new TimeOnly(14, 30))
            || localTime >= new TimeOnly(23, 30)
            || localTime <= new TimeOnly(1, 30);
    }

    private static bool IsTimeBetween(TimeOnly value, TimeOnly start, TimeOnly end) =>
        start <= end
            ? value >= start && value <= end
            : value >= start || value <= end;
}
