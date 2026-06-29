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
    public int RefreshNotifications(DateTimeOffset now)
    {
        var operationAt = now.ToUniversalTime();
        var today = GetBusinessDate(now);
        var activeKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var changed = 0;

        var longWaitingCutoff = operationAt - LongWaitingThreshold;
        var longWaiting = dbContext.EmuWorkPauses
            .AsNoTracking()
            .Include(row => row.WorkSession)
                .ThenInclude(row => row.Section)
            .Where(row =>
                row.EndedAt == null
                && row.StartedAt <= longWaitingCutoff
                && row.WorkSession.DeletedAt == null
                && row.WorkSession.CompletedAt == null)
            .OrderBy(row => row.StartedAt)
            .Take(20)
            .Select(row => new
            {
                row.Id,
                row.WorkSessionId,
                row.StartedAt,
                WorkNumber = row.WorkSession.WorkNumber,
                SectionName = row.WorkSession.Section.Name
            })
            .ToList();

        foreach (var row in longWaiting)
        {
            var key = $"emu:long-waiting:{row.Id}";
            activeKeys.Add(key);
            changed += UpsertNotification(
                "long_waiting",
                key,
                "Долгое ожидание ЭМУ",
                $"{DisplayName(row.WorkNumber)} · {DisplayName(row.SectionName)} · ожидание с {row.StartedAt.ToLocalTime():HH:mm}",
                "warning",
                operationAt,
                workSessionId: row.WorkSessionId);
        }

        var forgotten = dbContext.EmuWorkSessions
            .AsNoTracking()
            .Include(row => row.Section)
            .Where(row => row.DeletedAt == null && row.CompletedAt == null && row.WorkDate < today)
            .OrderBy(row => row.WorkDate)
            .Take(20)
            .Select(row => new { row.Id, row.WorkNumber, row.WorkDate, SectionName = row.Section.Name })
            .ToList();

        foreach (var row in forgotten)
        {
            var key = $"emu:forgotten-work:{row.Id}";
            activeKeys.Add(key);
            changed += UpsertNotification(
                "forgotten_work",
                key,
                "Забытая работа ЭМУ",
                $"{DisplayName(row.WorkNumber)} · {DisplayName(row.SectionName)} · дата {row.WorkDate:yyyy-MM-dd}",
                "danger",
                operationAt,
                workSessionId: row.Id);
        }

        var conflictParticipants = dbContext.EmuWorkSessionEmployees
            .AsNoTracking()
            .Where(row =>
                row.FinishedAt == null
                && row.Status == EmployeeWorking
                && row.WorkSession.DeletedAt == null
                && row.WorkSession.CompletedAt == null)
            .Select(row => new
            {
                row.EmployeeId,
                row.FullNameSnapshot,
                row.WorkSessionId,
                row.WorkSession.WorkNumber,
                SectionName = row.WorkSession.Section.Name
            })
            .ToList();

        var conflicts = conflictParticipants
            .GroupBy(row => row.EmployeeId)
            .Select(group => new
            {
                EmployeeId = group.Key,
                EmployeeName = group.Select(row => row.FullNameSnapshot).FirstOrDefault() ?? string.Empty,
                Sessions = group
                    .GroupBy(row => row.WorkSessionId)
                    .Select(session => new EmployeeConflictSessionPayload(
                        session.Key,
                        session.Select(row => row.WorkNumber).FirstOrDefault() ?? string.Empty,
                        session.Select(row => row.SectionName).FirstOrDefault() ?? string.Empty))
                    .OrderBy(row => row.WorkNumber)
                    .ToList()
            })
            .Where(row => row.Sessions.Count > 1)
            .Take(20)
            .ToList();

        foreach (var row in conflicts)
        {
            changed += UpsertEmployeeConflictDecision(row.EmployeeId, row.EmployeeName, row.Sessions, today, operationAt);
        }

        if (TableExists("perco_access_events"))
        {
            var workingIntervals = dbContext.EmuWorkParticipationIntervals
                .AsNoTracking()
                .Where(row =>
                    row.EndedAt == null
                    && row.Status == EmployeeWorking
                    && row.WorkSession.DeletedAt == null
                    && row.WorkSession.CompletedAt == null)
                .Select(row => new
                {
                    ParticipationIntervalId = row.Id,
                    row.EmployeeId,
                    row.WorkSessionId,
                    row.StartedAt,
                    EmployeeName = row.WorkSessionEmployee.FullNameSnapshot,
                    row.WorkSession.WorkNumber,
                    SectionName = row.WorkSession.Section.Name
                })
                .ToList();
            var workingEmployeeIds = workingIntervals.Select(row => row.EmployeeId).Distinct().ToList();
            if (workingEmployeeIds.Count > 0)
            {
                var employeesById = dbContext.Employees
                    .AsNoTracking()
                    .Where(row => workingEmployeeIds.Contains(row.Id))
                    .ToDictionary(row => row.Id);
                var exitEvents = dbContext.PercoAccessEvents
                    .AsNoTracking()
                    .Where(row =>
                        row.EmployeeId != null
                        && workingEmployeeIds.Contains(row.EmployeeId.Value)
                        && row.Direction == "OUT"
                        && row.EventAt <= operationAt)
                    .OrderByDescending(row => row.EventAt)
                    .Take(200)
                    .ToList();

                foreach (var accessEvent in exitEvents)
                {
                    employeesById.TryGetValue(accessEvent.EmployeeId!.Value, out var accessEmployee);
                    EmuEmployeeShiftDto? accessShift = null;
                    if (accessEmployee is not null)
                    {
                        accessShift = MapEmployeeShift(BuildDefaultShift(accessEmployee, GetBusinessDate(accessEvent.EventAt)));
                    }

                    var isLunchExit = accessShift is not null
                        && accessShift.LunchTaken
                        && accessEvent.EventAt >= accessShift.LunchStartAt
                        && accessEvent.EventAt <= accessShift.LunchEndAt
                        && operationAt >= accessShift.LunchEndAt;

                    foreach (var interval in workingIntervals.Where(row => row.EmployeeId == accessEvent.EmployeeId && row.StartedAt <= accessEvent.EventAt))
                    {
                        if (isLunchExit
                            && accessShift is not null
                            && interval.StartedAt < accessShift.LunchEndAt
                            && HasPercoPresenceAt(accessEvent.EmployeeId!.Value, accessEvent.EventAt))
                        {
                            if (HasPercoFactoryReturnAfterLunchExit(accessEvent.EmployeeId!.Value, accessEvent.EventAt, accessShift))
                            {
                                changed += AutoResolveOpenLunchDecisions(
                                    accessEvent.EmployeeId.Value,
                                    accessShift.ShiftDate,
                                    "PERCo зафиксировал выход и возврат сотрудника на обед. Обед исключен расчетно, смена не закрывается.",
                                    operationAt)
                                    ? 1
                                    : 0;
                                continue;
                            }

                            var overlapStart = interval.StartedAt > accessShift.LunchStartAt ? interval.StartedAt : accessShift.LunchStartAt;
                            var overlapEnd = accessShift.LunchEndAt;
                            var overlapMinutes = Math.Max(0, (int)Math.Round((overlapEnd - overlapStart).TotalMinutes));
                            if (overlapMinutes > 0)
                            {
                                changed += UpsertPercoLunchExitDuringWorkDecision(
                                    interval.EmployeeId,
                                    interval.EmployeeName,
                                    interval.WorkSessionId,
                                    interval.WorkNumber,
                                    interval.SectionName,
                                    accessEvent.Id,
                                    accessEvent.PercoEventId,
                                    accessEvent.EventAt,
                                    accessEvent.DeviceName,
                                    GetBusinessDate(accessEvent.EventAt),
                                    operationAt,
                                    overlapMinutes,
                                    accessShift.LunchStartAt,
                                    accessShift.LunchEndAt);
                                continue;
                            }
                        }

                        changed += UpsertPercoExitDuringWorkDecision(
                            interval.EmployeeId,
                            interval.EmployeeName,
                            interval.WorkSessionId,
                            interval.WorkNumber,
                            interval.SectionName,
                            accessEvent.Id,
                            accessEvent.PercoEventId,
                            accessEvent.EventAt,
                            accessEvent.DeviceName,
                            GetBusinessDate(accessEvent.EventAt),
                            operationAt);
                    }
                }
            }

            if (TableExists("employee_presence_intervals") && workingIntervals.Count > 0)
            {
                var minStartedAt = workingIntervals.Min(row => row.StartedAt);
                var employeesById = dbContext.Employees
                    .AsNoTracking()
                    .Where(row => workingEmployeeIds.Contains(row.Id))
                    .ToDictionary(row => row.Id);
                var employeesWithPercoData = dbContext.PercoAccessEvents
                    .AsNoTracking()
                    .Where(row =>
                        row.EmployeeId != null
                        && workingEmployeeIds.Contains(row.EmployeeId.Value)
                        && row.EventAt >= minStartedAt.AddDays(-1)
                        && row.EventAt <= operationAt)
                    .Select(row => row.EmployeeId!.Value)
                    .Distinct()
                    .ToHashSet();

                if (employeesWithPercoData.Count > 0)
                {
                    var presenceIntervals = dbContext.EmployeePresenceIntervals
                        .AsNoTracking()
                        .Where(row =>
                            employeesWithPercoData.Contains(row.EmployeeId)
                            && row.StartedAt <= operationAt
                            && (row.EndedAt == null || row.EndedAt >= minStartedAt))
                        .Select(row => new
                        {
                            row.EmployeeId,
                            row.StartedAt,
                            row.EndedAt
                        })
                        .ToList();

                    foreach (var interval in workingIntervals.Where(row => employeesWithPercoData.Contains(row.EmployeeId)))
                    {
                        var hasPresenceAtStart = presenceIntervals.Any(row =>
                            row.EmployeeId == interval.EmployeeId
                            && row.StartedAt <= interval.StartedAt
                            && (row.EndedAt == null || row.EndedAt >= interval.StartedAt));
                        if (hasPresenceAtStart)
                        {
                            continue;
                        }

                        changed += UpsertPercoMissingPresenceDecision(
                            interval.EmployeeId,
                            interval.EmployeeName,
                            interval.WorkSessionId,
                            interval.WorkNumber,
                            interval.SectionName,
                            interval.ParticipationIntervalId,
                            interval.StartedAt,
                            GetBusinessDate(interval.StartedAt),
                            operationAt);
                    }

                    foreach (var interval in workingIntervals.Where(row => employeesWithPercoData.Contains(row.EmployeeId)))
                    {
                        if (!employeesById.TryGetValue(interval.EmployeeId, out var employee))
                        {
                            continue;
                        }

                        var shift = MapEmployeeShift(BuildDefaultShift(employee, GetBusinessDate(interval.StartedAt)));
                        if (operationAt <= shift.ActualEndAt || interval.StartedAt >= shift.ActualEndAt)
                        {
                            continue;
                        }

                        var hasPresenceAtStart = presenceIntervals.Any(row =>
                            row.EmployeeId == interval.EmployeeId
                            && row.StartedAt <= interval.StartedAt
                            && (row.EndedAt == null || row.EndedAt >= interval.StartedAt));
                        if (!hasPresenceAtStart)
                        {
                            continue;
                        }

                        var hasPresenceAtShiftEnd = presenceIntervals.Any(row =>
                            row.EmployeeId == interval.EmployeeId
                            && row.StartedAt <= shift.ActualEndAt
                            && (row.EndedAt == null || row.EndedAt >= shift.ActualEndAt));
                        if (hasPresenceAtShiftEnd)
                        {
                            continue;
                        }

                        changed += UpsertPercoAbsentAfterShiftDecision(
                            interval.EmployeeId,
                            interval.EmployeeName,
                            interval.WorkSessionId,
                            interval.WorkNumber,
                            interval.SectionName,
                            interval.ParticipationIntervalId,
                            shift.ActualEndAt,
                            shift.ShiftDate,
                            operationAt);
                    }
                }
            }
        }

        var overduePlans = dbContext.EmuWorkPlanTasks
            .AsNoTracking()
            .Include(row => row.Section)
            .Where(row =>
                row.PlannedDate < today
                && row.ApprovalStatus == PlanApprovalApproved
                && row.Status == PlanStatusPlanned
                && !dbContext.EmuWorkSessions.Any(session => session.PlanTaskId == row.Id && session.DeletedAt == null))
            .OrderBy(row => row.PlannedDate)
            .Take(20)
            .Select(row => new { row.Id, row.Title, row.PlannedDate, SectionName = row.Section == null ? string.Empty : row.Section.Name })
            .ToList();

        foreach (var row in overduePlans)
        {
            var key = $"emu:overdue-plan:{row.Id}";
            activeKeys.Add(key);
            changed += UpsertNotification(
                "overdue_plan",
                key,
                "Просроченный план ЭМУ",
                $"{DisplayName(row.Title)} · {DisplayName(row.SectionName)} · план {row.PlannedDate:yyyy-MM-dd}",
                "warning",
                operationAt,
                planTaskId: row.Id);
        }

        var correctionCutoff = operationAt - ManualCorrectionWindow;
        var frequentCorrections = dbContext.EmuWorkAuditEvents
            .AsNoTracking()
            .Where(row => row.WorkSessionId != null && row.CreatedAt >= correctionCutoff && ManualCorrectionEventTypes.Contains(row.EventType))
            .GroupBy(row => row.WorkSessionId!.Value)
            .Select(group => new { WorkSessionId = group.Key, Count = group.Count() })
            .Where(row => row.Count >= 3)
            .Take(20)
            .ToList();

        foreach (var row in frequentCorrections)
        {
            var key = $"emu:manual-corrections:{row.WorkSessionId}";
            activeKeys.Add(key);
            changed += UpsertNotification(
                "manual_corrections",
                key,
                "Частые ручные корректировки ЭМУ",
                $"Карточка имеет ручных корректировок за сутки: {row.Count}",
                "warning",
                operationAt,
                workSessionId: row.WorkSessionId);
        }

        if (changed > 0)
        {
            dbContext.SaveChanges();
        }

        EscalateOpenDecisions(operationAt);
        var openDecisions = dbContext.EmuDecisions
            .AsNoTracking()
            .Include(row => row.Employee)
            .Include(row => row.WorkSession)
                .ThenInclude(row => row!.Section)
            .Where(row => row.Status == "new")
            .OrderByDescending(row => row.Severity == "danger")
            .ThenBy(row => row.DetectedAt)
            .Take(20)
            .ToList();

        foreach (var decision in openDecisions)
        {
            var key = BuildDecisionNotificationKey(decision);
            activeKeys.Add(key);
            changed += UpsertNotification(
                "decision",
                key,
                "Требует решения ЭМУ",
                BuildDecisionNotificationMessage(decision),
                decision.Severity,
                operationAt,
                employeeId: decision.EmployeeId,
                workSessionId: decision.WorkSessionId);
        }

        var managedTypes = ManagedNotificationTypes;
        var stale = dbContext.EmuNotifications
            .Where(row => row.Status == "new" && managedTypes.Contains(row.NotificationType) && !activeKeys.Contains(row.DedupeKey))
            .ToList();
        foreach (var row in stale)
        {
            row.Status = "resolved";
            row.ResolvedAt = operationAt;
            changed++;
        }

        if (changed > 0)
        {
            dbContext.SaveChanges();
        }

        return changed;
    }
}
