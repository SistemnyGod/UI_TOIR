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
    private IReadOnlyList<(DateTimeOffset Start, DateTimeOffset End)> GetPercoLunchAbsenceRanges(Guid employeeId, EmuEmployeeShiftDto shift)
    {
        if (!shift.LunchTaken || !TableExists("employee_presence_intervals"))
        {
            return [];
        }

        var intervals = dbContext.EmployeePresenceIntervals
            .AsNoTracking()
            .Where(row =>
                row.EmployeeId == employeeId
                && row.StartedAt < shift.LunchEndAt.AddHours(2)
                && (row.EndedAt == null || row.EndedAt > shift.LunchStartAt.AddHours(-2)))
            .OrderBy(row => row.StartedAt)
            .Select(row => new { row.StartedAt, row.EndedAt })
            .ToList();

        if (intervals.Count < 2)
        {
            return [];
        }

        var ranges = new List<(DateTimeOffset Start, DateTimeOffset End)>();
        for (var index = 0; index < intervals.Count - 1; index++)
        {
            var current = intervals[index];
            if (current.EndedAt is null)
            {
                continue;
            }

            var next = intervals[index + 1];
            if (next.StartedAt <= current.EndedAt.Value)
            {
                continue;
            }

            var gapStart = current.EndedAt.Value > shift.LunchStartAt ? current.EndedAt.Value : shift.LunchStartAt;
            var gapEnd = next.StartedAt < shift.LunchEndAt ? next.StartedAt : shift.LunchEndAt;
            if (gapEnd > gapStart)
            {
                ranges.Add((gapStart, gapEnd));
            }
        }

        return ranges;
    }

    private bool AutoResolveOpenLunchDecisions(Guid employeeId, DateOnly shiftDate, string comment, DateTimeOffset now)
    {
        var openLunchDecisions = dbContext.EmuDecisions
            .Where(row =>
                row.EmployeeId == employeeId
                && row.ShiftDate == shiftDate
                && row.Status == "new"
                && (row.DecisionType == "lunch_overlap" || row.DecisionType == "perco_lunch_exit_during_work"))
            .ToList();

        foreach (var decision in openLunchDecisions)
        {
            decision.Status = "resolved";
            decision.Resolution = "perco_lunch_break";
            decision.Comment = comment;
            decision.ResolvedAt = now;
            decision.ResolvedByName = "PERCo";
            decision.RowVersion++;
            CloseDecisionNotification(decision, now);
            AddAudit(decision.WorkSessionId, null, "decision_auto_resolved", "new", decision.Resolution, comment, null, "PERCo", now);
        }

        return openLunchDecisions.Count > 0;
    }

    private bool HasPercoFactoryReturnAfterLunchExit(Guid employeeId, DateTimeOffset lunchExitAt, EmuEmployeeShiftDto shift) =>
        TableExists("perco_access_events")
        && dbContext.PercoAccessEvents
            .AsNoTracking()
            .Any(row =>
                row.EmployeeId == employeeId
                && row.Direction == "IN"
                && row.EventAt > lunchExitAt
                && row.EventAt <= shift.LunchEndAt.AddHours(2));

    private bool HasPercoPresenceAt(Guid employeeId, DateTimeOffset eventAt) =>
        TableExists("employee_presence_intervals")
        && dbContext.EmployeePresenceIntervals
            .AsNoTracking()
            .Any(row =>
                row.EmployeeId == employeeId
                && row.StartedAt <= eventAt
                && (row.EndedAt == null || row.EndedAt >= eventAt));
}
