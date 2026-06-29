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
    private IReadOnlyList<EmuDecisionDto> DetectLunchOverlapDecisions(
        EmployeeEntity employee,
        EmuEmployeeShiftDto shift,
        IReadOnlyList<(DateTimeOffset Start, DateTimeOffset End, Guid? WorkSessionId, string WorkNumber, string Reason)> workRanges,
        IReadOnlyList<(DateTimeOffset Start, DateTimeOffset End, Guid? WorkSessionId, string WorkNumber, string Reason)> pauseRanges,
        IReadOnlyList<(DateTimeOffset Start, DateTimeOffset End)> percoLunchAbsenceRanges,
        DateTimeOffset now,
        IReadOnlyList<Guid>? allowedSectionIds = null)
    {
        if (!shift.LunchTaken)
        {
            return GetShiftDecisions(employee.Id, shift.ShiftDate, allowedSectionIds);
        }

        var lunchCoveredByPause = pauseRanges.Any(row => row.Start <= shift.LunchStartAt && row.End >= shift.LunchEndAt);
        if (lunchCoveredByPause)
        {
            return GetShiftDecisions(employee.Id, shift.ShiftDate, allowedSectionIds);
        }

        if (percoLunchAbsenceRanges.Count > 0)
        {
            var changedByPerco = AutoResolveOpenLunchDecisions(
                employee.Id,
                shift.ShiftDate,
                "PERCo зафиксировал выход и возврат сотрудника на обед. Обед исключен расчетно, смена не закрывается.",
                now);
            if (changedByPerco)
            {
                dbContext.SaveChanges();
            }

            return GetShiftDecisions(employee.Id, shift.ShiftDate, allowedSectionIds);
        }

        var changed = false;
        foreach (var range in workRanges.Where(row => row.WorkSessionId.HasValue))
        {
            var overlapStart = range.Start > shift.LunchStartAt ? range.Start : shift.LunchStartAt;
            var overlapEnd = range.End < shift.LunchEndAt ? range.End : shift.LunchEndAt;
            if (overlapEnd <= overlapStart)
            {
                continue;
            }

            var workSessionId = range.WorkSessionId!.Value;
            var dedupeKey = BuildLunchDecisionDedupeKey(employee.Id, shift.ShiftDate, workSessionId, shift.LunchStartAt, shift.LunchEndAt);
            var existing = dbContext.EmuDecisions.FirstOrDefault(row => row.DedupeKey == dedupeKey);
            if (existing is null)
            {
                var payload = new LunchDecisionPayload(
                    (int)Math.Round((overlapEnd - overlapStart).TotalMinutes),
                    shift.LunchStartAt,
                    shift.LunchEndAt);
                dbContext.EmuDecisions.Add(new EmuDecisionEntity
                {
                    Id = Guid.NewGuid(),
                    DecisionType = "lunch_overlap",
                    Severity = "warning",
                    Status = "new",
                    EmployeeId = employee.Id,
                    WorkSessionId = workSessionId,
                    ShiftDate = shift.ShiftDate,
                    DetectedAt = now,
                    DedupeKey = dedupeKey,
                    PayloadJson = JsonSerializer.Serialize(payload)
                });
                changed = true;
            }
            else if (existing.Status == "new" && existing.Severity != "danger" && now - existing.DetectedAt >= DecisionEscalationThreshold)
            {
                existing.Severity = "danger";
                existing.RowVersion++;
                changed = true;
            }
        }

        if (changed)
        {
            dbContext.SaveChanges();
        }

        return GetShiftDecisions(employee.Id, shift.ShiftDate, allowedSectionIds);
    }

    private IReadOnlyList<EmuDecisionDto> DetectOvertimeReviewDecision(
        EmployeeEntity employee,
        EmuEmployeeShiftDto shift,
        IReadOnlyList<(DateTimeOffset Start, DateTimeOffset End, Guid? WorkSessionId, string WorkNumber, string Reason)> workRanges,
        int overlapMinutes,
        DateTimeOffset now,
        IReadOnlyList<Guid>? allowedSectionIds = null)
    {
        var source = workRanges
            .Where(row => row.WorkSessionId.HasValue && row.End > shift.ActualEndAt)
            .OrderBy(row => row.Start)
            .FirstOrDefault();
        if (!source.WorkSessionId.HasValue)
        {
            return GetShiftDecisions(employee.Id, shift.ShiftDate, allowedSectionIds);
        }

        var dedupeKey = $"overtime_review:{employee.Id:N}:{shift.ShiftDate:yyyyMMdd}";
        var existing = dbContext.EmuDecisions.FirstOrDefault(row => row.DedupeKey == dedupeKey);
        if (existing is null)
        {
            dbContext.EmuDecisions.Add(new EmuDecisionEntity
            {
                Id = Guid.NewGuid(),
                DecisionType = "overtime_review",
                Severity = "warning",
                Status = "new",
                EmployeeId = employee.Id,
                WorkSessionId = source.WorkSessionId.Value,
                ShiftDate = shift.ShiftDate,
                DetectedAt = now,
                DedupeKey = dedupeKey,
                PayloadJson = JsonSerializer.Serialize(new LunchDecisionPayload(overlapMinutes, null, null))
            });
            dbContext.SaveChanges();
        }
        else if (existing.Status == "new" && existing.Severity != "danger" && now - existing.DetectedAt >= DecisionEscalationThreshold)
        {
            existing.Severity = "danger";
            existing.RowVersion++;
            dbContext.SaveChanges();
        }

        return GetShiftDecisions(employee.Id, shift.ShiftDate, allowedSectionIds);
    }
}
