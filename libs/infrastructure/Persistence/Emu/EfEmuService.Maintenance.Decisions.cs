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
    private int UpsertEmployeeConflictDecision(
        Guid employeeId,
        string employeeName,
        IReadOnlyList<EmployeeConflictSessionPayload> sessions,
        DateOnly shiftDate,
        DateTimeOffset detectedAt)
    {
        if (sessions.Count <= 1)
        {
            return 0;
        }

        var orderedSessions = sessions.OrderBy(row => row.WorkSessionId).ToList();
        var dedupeKey = BuildEmployeeConflictDecisionDedupeKey(employeeId, orderedSessions.Select(row => row.WorkSessionId));
        var payload = JsonSerializer.Serialize(new EmployeeConflictDecisionPayload(orderedSessions.Count, orderedSessions));
        var firstSessionId = orderedSessions[0].WorkSessionId;
        var existing = dbContext.EmuDecisions.FirstOrDefault(row => row.DedupeKey == dedupeKey);

        if (existing is null)
        {
            dbContext.EmuDecisions.Add(new EmuDecisionEntity
            {
                Id = Guid.NewGuid(),
                DecisionType = "employee_conflict",
                Severity = "danger",
                Status = "new",
                EmployeeId = employeeId,
                WorkSessionId = firstSessionId,
                ShiftDate = shiftDate,
                DetectedAt = detectedAt,
                DedupeKey = dedupeKey,
                PayloadJson = payload
            });
            return 1;
        }

        if (existing.Status != "new")
        {
            return 0;
        }

        var changed = 0;
        if (existing.PayloadJson != payload || existing.WorkSessionId != firstSessionId || existing.Severity != "danger")
        {
            existing.PayloadJson = payload;
            existing.WorkSessionId = firstSessionId;
            existing.Severity = "danger";
            existing.RowVersion++;
            changed = 1;
        }

        return changed;
    }

    private int UpsertPercoExitDuringWorkDecision(
        Guid employeeId,
        string employeeName,
        Guid workSessionId,
        string workNumber,
        string sectionName,
        Guid percoEventId,
        string percoExternalEventId,
        DateTimeOffset eventAt,
        string deviceName,
        DateOnly shiftDate,
        DateTimeOffset detectedAt)
    {
        var dedupeKey = BuildPercoExitDuringWorkDecisionDedupeKey(percoEventId, workSessionId);
        var payload = JsonSerializer.Serialize(new PercoExitDuringWorkDecisionPayload(
            percoEventId,
            percoExternalEventId,
            eventAt,
            deviceName,
            workNumber,
            sectionName));
        var existing = dbContext.EmuDecisions.FirstOrDefault(row => row.DedupeKey == dedupeKey);

        if (existing is null)
        {
            dbContext.EmuDecisions.Add(new EmuDecisionEntity
            {
                Id = Guid.NewGuid(),
                DecisionType = "perco_exit_during_work",
                Severity = "danger",
                Status = "new",
                EmployeeId = employeeId,
                WorkSessionId = workSessionId,
                ShiftDate = shiftDate,
                DetectedAt = detectedAt,
                DedupeKey = dedupeKey,
                PayloadJson = payload
            });
            return 1;
        }

        if (existing.Status != "new")
        {
            return 0;
        }

        var changed = 0;
        if (existing.PayloadJson != payload || existing.Severity != "danger" || existing.WorkSessionId != workSessionId)
        {
            existing.PayloadJson = payload;
            existing.Severity = "danger";
            existing.WorkSessionId = workSessionId;
            existing.RowVersion++;
            changed = 1;
        }

        return changed;
    }

    private int UpsertPercoMissingPresenceDecision(
        Guid employeeId,
        string employeeName,
        Guid workSessionId,
        string workNumber,
        string sectionName,
        Guid participationIntervalId,
        DateTimeOffset startedAt,
        DateOnly shiftDate,
        DateTimeOffset detectedAt)
    {
        var dedupeKey = BuildPercoMissingPresenceDecisionDedupeKey(participationIntervalId);
        var payload = JsonSerializer.Serialize(new PercoMissingPresenceDecisionPayload(
            participationIntervalId,
            startedAt,
            workNumber,
            sectionName));
        var existing = dbContext.EmuDecisions.FirstOrDefault(row => row.DedupeKey == dedupeKey);

        if (existing is null)
        {
            dbContext.EmuDecisions.Add(new EmuDecisionEntity
            {
                Id = Guid.NewGuid(),
                DecisionType = "perco_missing_presence_for_work",
                Severity = "warning",
                Status = "new",
                EmployeeId = employeeId,
                WorkSessionId = workSessionId,
                ShiftDate = shiftDate,
                DetectedAt = detectedAt,
                DedupeKey = dedupeKey,
                PayloadJson = payload
            });
            return 1;
        }

        if (existing.Status != "new")
        {
            return 0;
        }

        var changed = 0;
        if (existing.PayloadJson != payload || existing.WorkSessionId != workSessionId)
        {
            existing.PayloadJson = payload;
            existing.WorkSessionId = workSessionId;
            existing.RowVersion++;
            changed = 1;
        }

        return changed;
    }

    private int UpsertPercoLunchExitDuringWorkDecision(
        Guid employeeId,
        string employeeName,
        Guid workSessionId,
        string workNumber,
        string sectionName,
        Guid percoEventId,
        string percoExternalEventId,
        DateTimeOffset eventAt,
        string deviceName,
        DateOnly shiftDate,
        DateTimeOffset detectedAt,
        int overlapMinutes,
        DateTimeOffset lunchStartAt,
        DateTimeOffset lunchEndAt)
    {
        var dedupeKey = BuildPercoLunchExitDuringWorkDecisionDedupeKey(percoEventId, workSessionId);
        var payload = JsonSerializer.Serialize(new PercoLunchExitDecisionPayload(
            percoEventId,
            percoExternalEventId,
            eventAt,
            deviceName,
            overlapMinutes,
            lunchStartAt,
            lunchEndAt,
            workNumber,
            sectionName));
        var existing = dbContext.EmuDecisions.FirstOrDefault(row => row.DedupeKey == dedupeKey);

        if (existing is null)
        {
            dbContext.EmuDecisions.Add(new EmuDecisionEntity
            {
                Id = Guid.NewGuid(),
                DecisionType = "perco_lunch_exit_during_work",
                Severity = "warning",
                Status = "new",
                EmployeeId = employeeId,
                WorkSessionId = workSessionId,
                ShiftDate = shiftDate,
                DetectedAt = detectedAt,
                DedupeKey = dedupeKey,
                PayloadJson = payload
            });
            return 1;
        }

        if (existing.Status != "new")
        {
            return 0;
        }

        var changed = 0;
        if (existing.PayloadJson != payload || existing.WorkSessionId != workSessionId)
        {
            existing.PayloadJson = payload;
            existing.WorkSessionId = workSessionId;
            existing.RowVersion++;
            changed = 1;
        }

        return changed;
    }

    private int UpsertPercoAbsentAfterShiftDecision(
        Guid employeeId,
        string employeeName,
        Guid workSessionId,
        string workNumber,
        string sectionName,
        Guid participationIntervalId,
        DateTimeOffset shiftEndAt,
        DateOnly shiftDate,
        DateTimeOffset detectedAt)
    {
        var dedupeKey = BuildPercoAbsentAfterShiftDecisionDedupeKey(participationIntervalId, shiftDate);
        var payload = JsonSerializer.Serialize(new PercoAbsentAfterShiftDecisionPayload(
            participationIntervalId,
            shiftEndAt,
            workNumber,
            sectionName));
        var existing = dbContext.EmuDecisions.FirstOrDefault(row => row.DedupeKey == dedupeKey);

        if (existing is null)
        {
            dbContext.EmuDecisions.Add(new EmuDecisionEntity
            {
                Id = Guid.NewGuid(),
                DecisionType = "perco_absent_after_shift",
                Severity = "danger",
                Status = "new",
                EmployeeId = employeeId,
                WorkSessionId = workSessionId,
                ShiftDate = shiftDate,
                DetectedAt = detectedAt,
                DedupeKey = dedupeKey,
                PayloadJson = payload
            });
            return 1;
        }

        if (existing.Status != "new")
        {
            return 0;
        }

        var changed = 0;
        if (existing.PayloadJson != payload || existing.WorkSessionId != workSessionId || existing.Severity != "danger")
        {
            existing.PayloadJson = payload;
            existing.WorkSessionId = workSessionId;
            existing.Severity = "danger";
            existing.RowVersion++;
            changed = 1;
        }

        return changed;
    }
}
