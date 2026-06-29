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
    public EmuCommandResult<EmuEmployeeShiftSummaryDto> GetEmployeeShiftSummary(Guid employeeId, DateOnly date, IReadOnlyList<Guid>? allowedSectionIds = null)
    {
        var employee = dbContext.Employees.AsNoTracking().FirstOrDefault(row => row.Id == employeeId);
        if (employee is null)
        {
            return Failure<EmuEmployeeShiftSummaryDto>("employeeId", "Сотрудник не найден");
        }

        var visibleEmployeeIds = GetVisibleEmuEmployeeIds(date, allowedSectionIds);
        if (visibleEmployeeIds is not null && !visibleEmployeeIds.Contains(employeeId))
        {
            return Failure<EmuEmployeeShiftSummaryDto>("employeeId", "Сотрудник недоступен по назначенным участкам");
        }

        var stored = dbContext.EmuEmployeeShifts
            .AsNoTracking()
            .Include(row => row.Employee)
            .Include(row => row.Template)
            .FirstOrDefault(row => row.EmployeeId == employeeId && row.ShiftDate == date);
        var shift = ApplyPercoPresenceToShift(stored is null ? BuildDefaultShift(employee, date) : stored);
        var shiftDto = MapEmployeeShift(shift);
        var intervalsQuery = dbContext.EmuWorkParticipationIntervals
            .AsNoTracking()
            .Include(row => row.WorkSession)
            .Where(row => row.EmployeeId == employeeId && row.StartedAt < shiftDto.ActualEndAt.AddHours(8) && (row.EndedAt ?? DateTimeOffset.UtcNow) > shiftDto.PlannedStartAt.AddHours(-4));
        intervalsQuery = ApplyParticipationIntervalSectionScope(intervalsQuery, allowedSectionIds);
        var intervals = intervalsQuery.OrderBy(row => row.StartedAt).ToList();

        var now = DateTimeOffset.UtcNow;
        var workRanges = intervals
            .Where(row => row.Status == EmployeeWorking)
            .Select(row => ToRange(row.StartedAt, row.EndedAt ?? now, row.WorkSessionId, row.WorkSession?.WorkNumber ?? string.Empty, row.Reason))
            .ToList();
        var pauseRanges = intervals
            .Where(row => row.Status == ParticipationPaused)
            .Select(row => ToRange(row.StartedAt, row.EndedAt ?? now, row.WorkSessionId, row.WorkSession?.WorkNumber ?? string.Empty, row.Reason))
            .ToList();
        var percoLunchAbsenceRanges = GetPercoLunchAbsenceRanges(employee.Id, shiftDto);
        var decisions = DetectLunchOverlapDecisions(employee, shiftDto, workRanges, pauseRanges, percoLunchAbsenceRanges, now, allowedSectionIds);
        var excludedLunchDecisions = decisions
            .Where(row => IsLunchDecisionType(row.DecisionType) && row.Status == "resolved" && row.Resolution == "exclude_lunch")
            .ToList();
        var percoLunchAbsenceMinutes = percoLunchAbsenceRanges.Sum(row => RangeMinutes(row.Start, row.End));

        var shiftStart = shiftDto.ActualStartAt;
        var shiftEnd = shiftDto.ActualEndAt;
        var workMinutes = Math.Max(0, SumClippedMinutes(workRanges, shiftStart, shiftEnd) - excludedLunchDecisions.Sum(row => row.OverlapMinutes) - percoLunchAbsenceMinutes);
        var pauseMinutes = SumClippedMinutes(pauseRanges, shiftStart, shiftEnd);
        var beforeShiftMinutes = SumClippedMinutes(workRanges, DateTimeOffset.MinValue, shiftStart);
        var overtimeRawMinutes = SumClippedMinutes(workRanges, shiftEnd, DateTimeOffset.MaxValue);
        var resolvedOvertimeDecision = decisions.FirstOrDefault(row => row.DecisionType == "overtime_review" && row.Status == "resolved");
        var questionableOvertimeMinutes = 0;
        var overtimeMinutes = 0;
        if (overtimeRawMinutes > 60 || resolvedOvertimeDecision?.Resolution == "confirmed_overtime")
        {
            overtimeMinutes = overtimeRawMinutes;
        }
        else if (overtimeRawMinutes > 30 && resolvedOvertimeDecision?.Resolution is not ("exclude_overtime" or "fixed_manually"))
        {
            questionableOvertimeMinutes = overtimeRawMinutes;
        }
        if (questionableOvertimeMinutes > 0)
        {
            decisions = DetectOvertimeReviewDecision(employee, shiftDto, workRanges, questionableOvertimeMinutes, now, allowedSectionIds);
        }

        var busyRanges = workRanges.Concat(pauseRanges).Select(row => (row.Start, row.End)).ToList();
        busyRanges.AddRange(percoLunchAbsenceRanges.Select(row => (row.Start, row.End)));
        if (shiftDto.LunchTaken)
        {
            busyRanges.Add((shiftDto.LunchStartAt, shiftDto.LunchEndAt));
        }

        var freeRanges = BuildFreeRanges(shiftStart, shiftEnd, busyRanges);
        var outputIntervals = new List<EmuEmployeeShiftIntervalDto>();
        outputIntervals.AddRange(workRanges.Select(row => ToSummaryInterval("work", row.Start, row.End, "Работа", row.WorkSessionId, row.WorkNumber, row.Reason)));
        outputIntervals.AddRange(pauseRanges.Select(row => ToSummaryInterval("pause", row.Start, row.End, "Пауза", row.WorkSessionId, row.WorkNumber, row.Reason)));
        if (shiftDto.LunchTaken)
        {
            outputIntervals.Add(ToSummaryInterval("lunch", shiftDto.LunchStartAt, shiftDto.LunchEndAt, "Обед", null, string.Empty, string.Empty));
        }

        outputIntervals.AddRange(excludedLunchDecisions.Select(row => ToSummaryInterval("lunch-excluded", row.LunchStartAt ?? shiftDto.LunchStartAt, row.LunchEndAt ?? shiftDto.LunchEndAt, "Обед исключен", row.WorkSessionId, row.WorkNumber, row.Comment)));
        outputIntervals.AddRange(percoLunchAbsenceRanges.Select(row => ToSummaryInterval("lunch-perco", row.Start, row.End, "Обед по PERCo", null, string.Empty, "Выход и возврат через проходную")));
        outputIntervals.AddRange(decisions
            .Where(row => IsLunchDecisionType(row.DecisionType) && row.Status == "resolved" && row.Resolution == "worked_through_lunch")
            .Select(row => ToSummaryInterval("lunch-worked", row.LunchStartAt ?? shiftDto.LunchStartAt, row.LunchEndAt ?? shiftDto.LunchEndAt, "Работал в обед", row.WorkSessionId, row.WorkNumber, row.Comment)));
        outputIntervals.AddRange(freeRanges.Select(row => ToSummaryInterval("free", row.Start, row.End, "Свободно", null, string.Empty, string.Empty)));
        outputIntervals = outputIntervals
            .Where(row => row.Minutes > 0)
            .OrderBy(row => row.StartedAt)
            .ToList();

        return Success(new EmuEmployeeShiftSummaryDto(
            shiftDto,
            workMinutes,
            pauseMinutes,
            freeRanges.Sum(row => Math.Max(0, (int)Math.Round((row.End - row.Start).TotalMinutes))),
            beforeShiftMinutes,
            overtimeMinutes,
            questionableOvertimeMinutes,
            outputIntervals,
            decisions));
    }

    public EmuCommandResult<EmuEmployeeMonthSummaryDto> GetEmployeeMonthSummary(Guid employeeId, DateOnly month, IReadOnlyList<Guid>? allowedSectionIds = null)
    {
        var employee = dbContext.Employees.AsNoTracking().FirstOrDefault(row => row.Id == employeeId);
        if (employee is null)
        {
            return Failure<EmuEmployeeMonthSummaryDto>("employeeId", "Сотрудник не найден");
        }

        var monthStart = new DateOnly(month.Year, month.Month, 1);
        var monthEnd = monthStart.AddMonths(1);
        var summaries = new List<EmuEmployeeShiftSummaryDto>();
        for (var date = monthStart; date < monthEnd; date = date.AddDays(1))
        {
            var result = GetEmployeeShiftSummary(employeeId, date, allowedSectionIds);
            if (result.Succeeded && result.Value is not null && IsMeaningfulMonthShift(result.Value))
            {
                summaries.Add(result.Value);
            }
        }

        var plannedMinutes = summaries.Sum(row => RangeMinutes(row.Shift.ActualStartAt, row.Shift.ActualEndAt));
        var workMinutes = summaries.Sum(row => row.WorkMinutes);
        var pauseMinutes = summaries.Sum(row => row.PauseMinutes);
        var freeMinutes = summaries.Sum(row => row.FreeMinutes);
        var presenceMinutes = workMinutes + pauseMinutes + freeMinutes;
        var overtimeMinutes = summaries.Sum(row => row.OvertimeMinutes);
        var questionableOvertimeMinutes = summaries.Sum(row => row.QuestionableOvertimeMinutes);
        var beforeShiftWorkMinutes = summaries.Sum(row => row.BeforeShiftWorkMinutes);

        return Success(new EmuEmployeeMonthSummaryDto(
            employeeId,
            employee.FullName,
            monthStart.ToString("yyyy-MM"),
            summaries.Count,
            plannedMinutes,
            presenceMinutes,
            workMinutes,
            pauseMinutes,
            freeMinutes,
            beforeShiftWorkMinutes,
            overtimeMinutes,
            questionableOvertimeMinutes,
            Math.Max(0, plannedMinutes - presenceMinutes),
            summaries));
    }
}
