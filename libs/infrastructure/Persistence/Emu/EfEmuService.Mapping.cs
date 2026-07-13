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
    private string GenerateWorkNumber(DateOnly workDate)
    {
        var count = dbContext.EmuWorkSessions.Count(row => row.WorkDate.Year == workDate.Year);
        return $"ЭМУ-{workDate:yyyy}-{count + 1:000000}";
    }

    private static EmuWorkSessionDto MapWorkSession(EmuWorkSessionEntity row) =>
        new(
            row.Id,
            row.WorkNumber,
            row.WorkDate,
            row.SectionId,
            row.Section?.Name ?? "Прочее",
            row.CreatedByUserId,
            row.CreatedByUser?.DisplayName ?? string.Empty,
            row.PlanTaskId,
            row.TaskDescription,
            row.Status,
            GetOperationalStatus(row),
            row.ResultStatus,
            row.ResultComment,
            row.ArrivedAt,
            row.CompletedAt,
            row.CreatedAt,
            row.UpdatedAt,
            row.DeletedAt,
            row.DeleteReason,
            row.WorkMinutes,
            row.WaitingMinutes,
            row.OtherWorkMinutes,
            row.RowVersion,
            row.IsCarriedOver,
            row.Employees.OrderBy(employee => employee.FullNameSnapshot).Select(MapParticipant).ToList());

    private static EmuWorkSessionEmployeeDto MapParticipant(EmuWorkSessionEmployeeEntity row)
    {
        var now = DateTimeOffset.UtcNow;
        var orderedIntervals = row.ParticipationIntervals.OrderBy(interval => interval.StartedAt).ToList();
        var activeInterval = orderedIntervals.LastOrDefault(interval => interval.EndedAt is null);
        var participationStatus = row.Status == EmployeeMistaken
            ? EmployeeMistaken
            : row.Status == EmployeeOtherWork
                ? EmployeeOtherWork
                : activeInterval?.Status ?? row.Status;
        var personalWorkMinutes = row.Status == EmployeeMistaken
            ? 0
            : CalculateIntervalMinutes(orderedIntervals, now, EmployeeWorking, fallbackMinutes: row.WorkMinutes);
        var personalPauseMinutes = row.Status == EmployeeMistaken
            ? 0
            : CalculateIntervalMinutes(orderedIntervals, now, ParticipationPaused, fallbackMinutes: row.WaitingMinutes + row.OtherWorkMinutes);

        return new(
            row.Id,
            row.EmployeeId,
            row.FullNameSnapshot,
            row.PositionSnapshot,
            row.Status,
            row.ArrivedAt,
            row.FinishedAt,
            row.WorkMinutes,
            row.WaitingMinutes,
            row.OtherWorkMinutes,
            participationStatus,
            activeInterval?.StartedAt,
            personalWorkMinutes,
            personalPauseMinutes,
            activeInterval?.Status == ParticipationPaused ? activeInterval.Reason : string.Empty,
            orderedIntervals.Select(MapParticipationInterval).ToList());
    }

    private static int CalculateIntervalMinutes(IReadOnlyCollection<EmuWorkParticipationIntervalEntity> intervals, DateTimeOffset now, string status, int fallbackMinutes)
    {
        if (intervals.Count == 0)
        {
            return fallbackMinutes;
        }

        var minutes = intervals
            .Where(interval => interval.Status == status)
            .Sum(interval => Math.Max(0, (int)Math.Round(((interval.EndedAt ?? now) - interval.StartedAt).TotalMinutes)));
        return minutes;
    }

    private static EmuWorkParticipationIntervalDto MapParticipationInterval(EmuWorkParticipationIntervalEntity row) =>
        new(row.Id, row.WorkSessionId, row.WorkSessionEmployeeId, row.EmployeeId, row.StartedAt, row.EndedAt, row.Status, row.Reason, row.CreatedByName, row.CreatedAt);

    private static EmuAuditEventDto MapAuditEvent(EmuWorkAuditEventEntity row) =>
        new(row.Id, row.WorkSessionId, row.PlanTaskId, row.EventType, row.FromStatus, row.ToStatus, row.Comment, row.Actor, row.CreatedAt);

    private static EmuDecisionDto MapDecision(EmuDecisionEntity row)
    {
        var payload = row.DecisionType == "perco_lunch_exit_during_work"
            ? ReadPercoLunchExitPayload(row).ToLunchPayload()
            : ReadLunchPayload(row);
        return new EmuDecisionDto(
            row.Id,
            row.DecisionType,
            row.Severity,
            row.Status,
            row.EmployeeId,
            row.Employee?.FullName ?? string.Empty,
            row.WorkSessionId,
            row.WorkSession?.WorkNumber ?? string.Empty,
            row.WorkSession?.Section?.Name ?? string.Empty,
            row.ShiftDate,
            row.DetectedAt,
            row.ResolvedAt,
            row.ResolvedByUserId,
            row.ResolvedByName,
            row.DedupeKey,
            row.Resolution,
            row.Comment,
            row.RowVersion,
            payload.OverlapMinutes,
            payload.LunchStartAt,
            payload.LunchEndAt);
    }

    private static EmuPlanTaskDto MapPlanTask(EmuWorkPlanTaskEntity row) =>
        new(
            row.Id,
            row.Title,
            row.Description,
            row.PlannedDate,
            row.SectionId,
            row.Section?.Name ?? string.Empty,
            row.Status,
            row.ApprovalStatus,
            row.Priority,
            row.IsRecurring,
            row.RecurrenceRule,
            row.CreatedAt,
            row.UpdatedAt,
            row.RowVersion,
            row.Employees.Select(employee => employee.EmployeeId).ToList());

    private static EmuReferenceDto MapReference(EmuWorkSectionEntity row) =>
        new(row.Id, row.Name, row.Code, row.IsActive, row.SortOrder);

    private static EmuReferenceDto MapReference(EmuWaitReasonEntity row) =>
        new(row.Id, row.Name, row.Code, row.IsActive, row.SortOrder);

    private static EmuReferenceDto MapReference(EmuNotCompletedReasonEntity row) =>
        new(row.Id, row.Name, row.Code, row.IsActive, row.SortOrder);

    private static EmuWorkTemplateDto MapWorkTemplate(EmuWorkTemplateEntity row) =>
        new(row.Id, row.Name, row.Description, row.SectionId, row.Section?.Name ?? string.Empty, row.IsActive, row.SortOrder);

    private static EmuFavoriteEmployeeDto MapFavoriteEmployee(EmuFavoriteEmployeeEntity row) =>
        new(row.Id, row.EmployeeId, row.Employee.FullName, row.Employee.PersonnelNo, row.Employee.Position, row.Employee.Department, row.Employee.Status, row.IsActive, row.CreatedAt);

    private static EmuShiftTemplateDto MapShiftTemplate(EmuShiftTemplateEntity row) =>
        new(
            row.Id,
            row.Code,
            row.Name,
            row.ShiftType,
            row.StartTime,
            row.EndTime,
            row.LunchStartTime,
            row.LunchEndTime,
            row.CrossesMidnight,
            row.IsActive,
            row.SortOrder);

    private static EmuEmployeeShiftDto MapEmployeeShift(EmuEmployeeShiftEntity row) =>
        new(
            row.Id,
            row.EmployeeId,
            row.Employee?.FullName ?? string.Empty,
            row.ShiftDate,
            row.TemplateId,
            row.ShiftType,
            row.Template?.Name ?? ShiftTypeName(row.ShiftType),
            row.PlannedStartAt,
            row.PlannedEndAt,
            row.ActualStartAt,
            row.ActualEndAt,
            row.LunchStartAt,
            row.LunchEndAt,
            row.LunchTaken,
            row.LunchOverridden,
            row.Source,
            row.Comment,
            row.Reason,
            row.AdjustedByUserId,
            row.AdjustedByName,
            row.AdjustedAt,
            row.RowVersion);

    private static string ShiftTypeName(string shiftType) =>
        shiftType switch
        {
            "day11" => "11-hour shift",
            "night" => "Night shift",
            "individual" => "Individual shift",
            _ => "Day shift"
        };
}
