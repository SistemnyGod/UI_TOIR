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
    private static EmuWorkSessionQueryDto SanitizeAppliedQuery(EmuWorkSessionQueryDto query) =>
        query with { AllowedSectionIds = null, CreatedByUserId = null };

    private IQueryable<EmuWorkSessionEntity> BuildWorkSessionQuery(EmuWorkSessionQueryDto query)
    {
        var rowsQuery = ApplyOwnerScope(ApplySectionScope(LoadSessions().AsQueryable(), query.AllowedSectionIds), query.CreatedByUserId);

        if (!query.IncludeDeleted)
        {
            rowsQuery = rowsQuery.Where(row => row.DeletedAt == null);
        }

        if (query.DateFrom is not null)
        {
            rowsQuery = rowsQuery.Where(row => row.WorkDate >= query.DateFrom);
        }

        if (query.DateTo is not null)
        {
            rowsQuery = rowsQuery.Where(row => row.WorkDate <= query.DateTo);
        }

        if (query.SectionId is not null)
        {
            rowsQuery = rowsQuery.Where(row => row.SectionId == query.SectionId);
        }

        if (query.WaitReasonId is not null)
        {
            rowsQuery = rowsQuery.Where(row => row.Pauses.Any(pause => pause.WaitReasonId == query.WaitReasonId));
        }

        if (query.NotCompletedReasonId is not null)
        {
            rowsQuery = rowsQuery.Where(row => row.NotCompletedReasonId == query.NotCompletedReasonId);
        }

        if (query.ProblemOnly)
        {
            var doneStatus = NormalizeResultStatus("Выполнено");
            rowsQuery = rowsQuery.Where(row =>
                row.IsCarriedOver ||
                row.WaitingMinutes > 0 ||
                row.OtherWorkMinutes > 0 ||
                (row.ResultStatus != string.Empty && row.ResultStatus != doneStatus) ||
                row.AuditEvents.Any(audit => ManualCorrectionEventTypes.Contains(audit.EventType)));
        }

        if (query.ManualCorrectionsOnly)
        {
            rowsQuery = rowsQuery.Where(row => row.AuditEvents.Any(audit => ManualCorrectionEventTypes.Contains(audit.EventType)));
        }

        var operationalStatus = NormalizeOperationalStatus(query.OperationalStatus);
        if (operationalStatus.Length > 0)
        {
            rowsQuery = ApplyOperationalStatusFilter(rowsQuery, operationalStatus);
        }

        var resultStatus = NormalizeResultStatus(query.ResultStatus ?? string.Empty);
        if (resultStatus.Length > 0)
        {
            rowsQuery = rowsQuery.Where(row => row.ResultStatus == resultStatus);
        }

        if (!string.IsNullOrWhiteSpace(query.Status))
        {
            var legacyStatus = NormalizeOptional(query.Status);
            if (NormalizeOperationalStatus(legacyStatus).Length > 0)
            {
                rowsQuery = ApplyOperationalStatusFilter(rowsQuery, NormalizeOperationalStatus(legacyStatus));
            }
            else
            {
                rowsQuery = rowsQuery.Where(row => row.Status == legacyStatus || row.ResultStatus == legacyStatus);
            }
        }

        if (query.EmployeeId is not null)
        {
            rowsQuery = rowsQuery.Where(row => row.Employees.Any(employee => employee.EmployeeId == query.EmployeeId));
        }

        rowsQuery = ApplyEmployeeSearchFilter(rowsQuery, query.EmployeeSearch);
        rowsQuery = ApplyShiftTypeFilter(rowsQuery, query.ShiftType);
        return rowsQuery;
    }

    private static bool IsProblemWorkSession(EmuWorkSessionEntity row)
    {
        var doneStatus = NormalizeResultStatus("Выполнено");
        return row.IsCarriedOver
            || row.DeletedAt != null
            || row.WaitingMinutes > 0
            || row.OtherWorkMinutes > 0
            || (row.ResultStatus != string.Empty && row.ResultStatus != doneStatus)
            || row.AuditEvents.Any(audit => ManualCorrectionEventTypes.Contains(audit.EventType));
    }

    private static string BuildWorkHistoryExceptionReason(EmuWorkSessionEntity row)
    {
        var reasons = new List<string>();
        if (row.DeletedAt is not null)
        {
            reasons.Add("удалена");
        }

        if (row.IsCarriedOver)
        {
            reasons.Add("перенос");
        }

        if (row.WaitingMinutes > 0)
        {
            reasons.Add("пауза");
        }

        if (row.OtherWorkMinutes > 0)
        {
            reasons.Add("другая работа");
        }

        if (row.ResultStatus.Length > 0 && row.ResultStatus != NormalizeResultStatus("Выполнено"))
        {
            reasons.Add(row.ResultStatus);
        }

        if (row.AuditEvents.Any(audit => ManualCorrectionEventTypes.Contains(audit.EventType)))
        {
            reasons.Add("ручная корректировка");
        }

        return reasons.Count == 0 ? "требует проверки" : string.Join(", ", reasons.Distinct());
    }

    private static IOrderedQueryable<EmuWorkSessionEntity> ApplyWorkSessionSort(IQueryable<EmuWorkSessionEntity> query, string? sortBy)
    {
        var sort = NormalizeOptional(sortBy).ToLowerInvariant();
        return sort switch
        {
            "section" => query
                .OrderBy(row => row.Section.Name)
                .ThenByDescending(row => row.CompletedAt ?? row.UpdatedAt)
                .ThenByDescending(row => row.CreatedAt),
            "employee" => query
                .OrderBy(row => row.Employees.OrderBy(employee => employee.FullNameSnapshot).Select(employee => employee.FullNameSnapshot).FirstOrDefault())
                .ThenByDescending(row => row.CompletedAt ?? row.UpdatedAt)
                .ThenByDescending(row => row.CreatedAt),
            "duration" => query
                .OrderByDescending(row => row.WorkMinutes + row.WaitingMinutes + row.OtherWorkMinutes)
                .ThenByDescending(row => row.CompletedAt ?? row.UpdatedAt)
                .ThenByDescending(row => row.CreatedAt),
            "waiting" => query
                .OrderByDescending(row => row.WaitingMinutes + row.OtherWorkMinutes)
                .ThenByDescending(row => row.CompletedAt ?? row.UpdatedAt)
                .ThenByDescending(row => row.CreatedAt),
            "result" => query
                .OrderBy(row => row.ResultStatus)
                .ThenByDescending(row => row.CompletedAt ?? row.UpdatedAt)
                .ThenByDescending(row => row.CreatedAt),
            _ => query
                .OrderByDescending(row => row.CompletedAt ?? row.UpdatedAt)
                .ThenByDescending(row => row.CreatedAt),
        };
    }

    private IQueryable<EmuWorkSessionEntity> ApplyEmployeeSearchFilter(IQueryable<EmuWorkSessionEntity> query, string? employeeSearch)
    {
        var search = NormalizeOptional(employeeSearch);
        if (search.Length == 0)
        {
            return query;
        }

        var pattern = $"%{search}%";
        return query.Where(row => row.Employees.Any(employee =>
            EF.Functions.ILike(employee.FullNameSnapshot ?? string.Empty, pattern) ||
            EF.Functions.ILike(employee.PositionSnapshot ?? string.Empty, pattern) ||
            EF.Functions.ILike(employee.Employee.FullName ?? string.Empty, pattern) ||
            EF.Functions.ILike(employee.Employee.PersonnelNo ?? string.Empty, pattern) ||
            EF.Functions.ILike(employee.Employee.Position ?? string.Empty, pattern) ||
            EF.Functions.ILike(employee.Employee.Department ?? string.Empty, pattern)));
    }

    private IQueryable<EmuWorkSessionEntity> ApplyShiftTypeFilter(IQueryable<EmuWorkSessionEntity> query, string? shiftType)
    {
        var normalized = NormalizeOptional(shiftType).ToLowerInvariant();
        if (normalized is not ("day" or "night"))
        {
            return query;
        }

        if (normalized == "night")
        {
            return query.Where(row => row.Employees.Any(employee =>
                dbContext.EmuEmployeeShifts.Any(shift =>
                    shift.EmployeeId == employee.EmployeeId &&
                    shift.ShiftDate == row.WorkDate &&
                    (((shift.ShiftType ?? string.Empty).ToLower()) == "night" ||
                     ((shift.ShiftType ?? string.Empty).ToLower()).Contains("ноч"))) ||
                (!dbContext.EmuEmployeeShifts.Any(shift => shift.EmployeeId == employee.EmployeeId && shift.ShiftDate == row.WorkDate) &&
                 (((employee.Employee.Shift ?? string.Empty).ToLower()) == "night" ||
                  ((employee.Employee.Shift ?? string.Empty).ToLower()).Contains("ноч")))));
        }

        return query.Where(row => row.Employees.Any(employee =>
            dbContext.EmuEmployeeShifts.Any(shift =>
                shift.EmployeeId == employee.EmployeeId &&
                shift.ShiftDate == row.WorkDate &&
                (((shift.ShiftType ?? string.Empty).ToLower()).StartsWith("day") ||
                 ((shift.ShiftType ?? string.Empty).ToLower()).Contains("день") ||
                 ((shift.ShiftType ?? string.Empty).ToLower()).Contains("днев")) &&
                !((shift.ShiftType ?? string.Empty).ToLower()).Contains("night") &&
                !((shift.ShiftType ?? string.Empty).ToLower()).Contains("ноч")) ||
            (!dbContext.EmuEmployeeShifts.Any(shift => shift.EmployeeId == employee.EmployeeId && shift.ShiftDate == row.WorkDate) &&
             !((employee.Employee.Shift ?? string.Empty).ToLower()).Contains("night") &&
             !((employee.Employee.Shift ?? string.Empty).ToLower()).Contains("ноч"))));
    }

    private static IQueryable<EmuWorkSessionEntity> ApplySectionScope(
        IQueryable<EmuWorkSessionEntity> query,
        IReadOnlyList<Guid>? allowedSectionIds)
    {
        if (allowedSectionIds is null)
        {
            return query;
        }

        if (allowedSectionIds.Count == 0)
        {
            return query.Where(_ => false);
        }

        var ids = allowedSectionIds.Distinct().ToArray();
        return query.Where(row => ids.Contains(row.SectionId));
    }

    private static IQueryable<EmuWorkSessionEntity> ApplyOwnerScope(
        IQueryable<EmuWorkSessionEntity> query,
        Guid? createdByUserId)
    {
        return createdByUserId is null
            ? query
            : query.Where(row => row.CreatedByUserId == createdByUserId.Value);
    }

    private static IQueryable<EmuWorkPlanTaskEntity> ApplyPlanSectionScope(
        IQueryable<EmuWorkPlanTaskEntity> query,
        IReadOnlyList<Guid>? allowedSectionIds)
    {
        if (allowedSectionIds is null)
        {
            return query;
        }

        if (allowedSectionIds.Count == 0)
        {
            return query.Where(_ => false);
        }

        var ids = allowedSectionIds.Distinct().ToArray();
        return query.Where(row => row.SectionId != null && ids.Contains(row.SectionId.Value));
    }

    private static IQueryable<EmuWorkParticipationIntervalEntity> ApplyParticipationIntervalSectionScope(
        IQueryable<EmuWorkParticipationIntervalEntity> query,
        IReadOnlyList<Guid>? allowedSectionIds)
    {
        if (allowedSectionIds is null)
        {
            return query;
        }

        if (allowedSectionIds.Count == 0)
        {
            return query.Where(_ => false);
        }

        var ids = allowedSectionIds.Distinct().ToArray();
        return query.Where(row => row.WorkSession != null && ids.Contains(row.WorkSession.SectionId));
    }

    private static IQueryable<EmuDecisionEntity> ApplyDecisionSectionScope(
        IQueryable<EmuDecisionEntity> query,
        IReadOnlyList<Guid>? allowedSectionIds)
    {
        if (allowedSectionIds is null)
        {
            return query;
        }

        if (allowedSectionIds.Count == 0)
        {
            return query.Where(_ => false);
        }

        var ids = allowedSectionIds.Distinct().ToArray();
        return query.Where(row => row.WorkSession != null && ids.Contains(row.WorkSession.SectionId));
    }

    private HashSet<Guid>? GetVisibleEmuEmployeeIds(DateOnly date, IReadOnlyList<Guid>? allowedSectionIds)
    {
        if (allowedSectionIds is null)
        {
            return null;
        }

        if (allowedSectionIds.Count == 0)
        {
            return [];
        }

        var ids = allowedSectionIds.Distinct().ToArray();
        var fromWork = dbContext.EmuWorkSessionEmployees
            .AsNoTracking()
            .Where(row => row.WorkSession.WorkDate == date && row.WorkSession.DeletedAt == null && ids.Contains(row.WorkSession.SectionId))
            .Select(row => row.EmployeeId);
        var fromPlan = dbContext.EmuWorkPlanTaskEmployees
            .AsNoTracking()
            .Where(row => row.PlanTask.PlannedDate == date && row.PlanTask.SectionId != null && ids.Contains(row.PlanTask.SectionId.Value))
            .Select(row => row.EmployeeId);

        return fromWork.Concat(fromPlan).Distinct().ToHashSet();
    }

    private static bool CanAccessDecision(EmuDecisionEntity decision, IReadOnlyList<Guid>? allowedSectionIds)
    {
        if (allowedSectionIds is null)
        {
            return true;
        }

        if (allowedSectionIds.Count == 0 || decision.WorkSession is null)
        {
            return false;
        }

        return allowedSectionIds.Contains(decision.WorkSession.SectionId);
    }

    private static bool CanAccessPlanTask(EmuWorkPlanTaskEntity task, IReadOnlyList<Guid>? allowedSectionIds)
    {
        if (allowedSectionIds is null)
        {
            return true;
        }

        if (allowedSectionIds.Count == 0 || task.SectionId is null)
        {
            return false;
        }

        return allowedSectionIds.Contains(task.SectionId.Value);
    }

    private static bool CanAccessEmuSection(Guid sectionId, IReadOnlyList<Guid>? allowedSectionIds)
    {
        if (allowedSectionIds is null)
        {
            return true;
        }

        return allowedSectionIds.Contains(sectionId);
    }
}
