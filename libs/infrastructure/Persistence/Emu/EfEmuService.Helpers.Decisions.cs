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
    private static string BuildLunchDecisionDedupeKey(Guid employeeId, DateOnly shiftDate, Guid workSessionId, DateTimeOffset lunchStartAt, DateTimeOffset lunchEndAt) =>
        $"emu:decision:lunch-overlap:{employeeId:N}:{shiftDate:yyyyMMdd}:{workSessionId:N}:{lunchStartAt:yyyyMMddHHmm}:{lunchEndAt:yyyyMMddHHmm}";

    private static string BuildEmployeeConflictDecisionDedupeKey(Guid employeeId, IEnumerable<Guid> workSessionIds) =>
        $"emu:decision:employee-conflict:{employeeId:N}:{string.Join("-", workSessionIds.Select(row => row.ToString("N")).OrderBy(row => row))}";

    private static string BuildPercoExitDuringWorkDecisionDedupeKey(Guid percoEventId, Guid workSessionId) =>
        $"emu:decision:perco-exit-during-work:{percoEventId:N}:{workSessionId:N}";

    private static string BuildPercoMissingPresenceDecisionDedupeKey(Guid participationIntervalId) =>
        $"emu:decision:perco-missing-presence:{participationIntervalId:N}";

    private static string BuildPercoLunchExitDuringWorkDecisionDedupeKey(Guid percoEventId, Guid workSessionId) =>
        $"emu:decision:perco-lunch-exit-during-work:{percoEventId:N}:{workSessionId:N}";

    private static string BuildPercoAbsentAfterShiftDecisionDedupeKey(Guid participationIntervalId, DateOnly shiftDate) =>
        $"emu:decision:perco-absent-after-shift:{participationIntervalId:N}:{shiftDate:yyyyMMdd}";

    private static string BuildDecisionNotificationKey(EmuDecisionEntity decision) =>
        $"emu:decision:{decision.DedupeKey}";

    private static string DecisionTypeLabel(string decisionType) =>
        decisionType switch
        {
            "lunch_overlap" => "Обеденное пересечение",
            "employee_conflict" => "Конфликт занятости",
            "perco_exit_during_work" => "Выход во время работы",
            "perco_missing_presence_for_work" => "Нет присутствия по PERCo",
            "perco_lunch_exit_during_work" => "PERCo-выход в обед",
            "perco_absent_after_shift" => "Нет присутствия после смены",
            _ => "Требует решения"
        };

    private static string BuildDecisionNotificationMessage(EmuDecisionEntity decision)
    {
        var employee = DisplayName(decision.Employee?.FullName);
        var workNumber = DisplayName(decision.WorkSession?.WorkNumber, "карточка не указана");
        var section = DisplayName(decision.WorkSession?.Section?.Name, "участок не указан");
        if (decision.DecisionType == "lunch_overlap")
        {
            var payload = ReadLunchPayload(decision);
            return $"{employee} · {workNumber} · {section} · обед пересекается с работой на {payload.OverlapMinutes} мин";
        }

        if (decision.DecisionType == "perco_lunch_exit_during_work")
        {
            var payload = ReadPercoLunchExitPayload(decision);
            var eventTime = payload.EventAt.ToLocalTime().ToString("HH:mm");
            var device = DisplayName(payload.DeviceName, "турникет не указан");
            return $"{employee} · {workNumber} · PERCo-выход в обед в {eventTime} · {device}";
        }

        if (decision.DecisionType == "employee_conflict")
        {
            var payload = ReadEmployeeConflictPayload(decision);
            var sessions = string.Join(", ", payload.Sessions.Select(row => DisplayName(row.WorkNumber)).Where(row => !string.IsNullOrWhiteSpace(row)).Take(3));
            return $"{employee} · одновременно работает в карточках: {payload.SessionCount}" + (sessions.Length > 0 ? $" ({sessions})" : string.Empty);
        }

        if (decision.DecisionType == "perco_exit_during_work")
        {
            var payload = ReadPercoExitDuringWorkPayload(decision);
            var eventTime = payload.EventAt.ToLocalTime().ToString("HH:mm");
            var device = DisplayName(payload.DeviceName, "турникет не указан");
            return $"{employee} · {workNumber} · выход через PERCo в {eventTime} · {device}";
        }

        if (decision.DecisionType == "perco_missing_presence_for_work")
        {
            var payload = ReadPercoMissingPresencePayload(decision);
            var startedAt = payload.StartedAt.ToLocalTime().ToString("HH:mm");
            return $"{employee} · {workNumber} · участие начато в {startedAt}, но присутствие по PERCo не подтверждено";
        }

        if (decision.DecisionType == "perco_absent_after_shift")
        {
            var payload = ReadPercoAbsentAfterShiftPayload(decision);
            var shiftEnd = payload.ShiftEndAt.ToLocalTime().ToString("HH:mm");
            return $"{employee} · {workNumber} · смена закончилась в {shiftEnd}, но карточка остается в работе без присутствия по PERCo";
        }

        return $"{employee} · {workNumber} · {DecisionTypeLabel(decision.DecisionType)}";
    }

    private static LunchDecisionPayload ReadLunchPayload(EmuDecisionEntity row)
    {
        try
        {
            return JsonSerializer.Deserialize<LunchDecisionPayload>(row.PayloadJson) ?? new LunchDecisionPayload(0, null, null);
        }
        catch (JsonException)
        {
            return new LunchDecisionPayload(0, null, null);
        }
    }

    private static EmployeeConflictDecisionPayload ReadEmployeeConflictPayload(EmuDecisionEntity row)
    {
        try
        {
            return JsonSerializer.Deserialize<EmployeeConflictDecisionPayload>(row.PayloadJson) ?? new EmployeeConflictDecisionPayload(0, []);
        }
        catch (JsonException)
        {
            return new EmployeeConflictDecisionPayload(0, []);
        }
    }

    private static PercoExitDuringWorkDecisionPayload ReadPercoExitDuringWorkPayload(EmuDecisionEntity row)
    {
        try
        {
            return JsonSerializer.Deserialize<PercoExitDuringWorkDecisionPayload>(row.PayloadJson)
                ?? new PercoExitDuringWorkDecisionPayload(Guid.Empty, string.Empty, row.DetectedAt, string.Empty, string.Empty, string.Empty);
        }
        catch (JsonException)
        {
            return new PercoExitDuringWorkDecisionPayload(Guid.Empty, string.Empty, row.DetectedAt, string.Empty, string.Empty, string.Empty);
        }
    }

    private static PercoMissingPresenceDecisionPayload ReadPercoMissingPresencePayload(EmuDecisionEntity row)
    {
        try
        {
            return JsonSerializer.Deserialize<PercoMissingPresenceDecisionPayload>(row.PayloadJson)
                ?? new PercoMissingPresenceDecisionPayload(Guid.Empty, row.DetectedAt, string.Empty, string.Empty);
        }
        catch (JsonException)
        {
            return new PercoMissingPresenceDecisionPayload(Guid.Empty, row.DetectedAt, string.Empty, string.Empty);
        }
    }

    private static PercoLunchExitDecisionPayload ReadPercoLunchExitPayload(EmuDecisionEntity row)
    {
        try
        {
            return JsonSerializer.Deserialize<PercoLunchExitDecisionPayload>(row.PayloadJson)
                ?? new PercoLunchExitDecisionPayload(Guid.Empty, string.Empty, row.DetectedAt, string.Empty, 0, null, null, string.Empty, string.Empty);
        }
        catch (JsonException)
        {
            return new PercoLunchExitDecisionPayload(Guid.Empty, string.Empty, row.DetectedAt, string.Empty, 0, null, null, string.Empty, string.Empty);
        }
    }

    private static PercoAbsentAfterShiftDecisionPayload ReadPercoAbsentAfterShiftPayload(EmuDecisionEntity row)
    {
        try
        {
            return JsonSerializer.Deserialize<PercoAbsentAfterShiftDecisionPayload>(row.PayloadJson)
                ?? new PercoAbsentAfterShiftDecisionPayload(Guid.Empty, row.DetectedAt, string.Empty, string.Empty);
        }
        catch (JsonException)
        {
            return new PercoAbsentAfterShiftDecisionPayload(Guid.Empty, row.DetectedAt, string.Empty, string.Empty);
        }
    }

    private static bool IsLunchDecisionType(string decisionType) =>
        decisionType is "lunch_overlap" or "perco_lunch_exit_during_work";
}
