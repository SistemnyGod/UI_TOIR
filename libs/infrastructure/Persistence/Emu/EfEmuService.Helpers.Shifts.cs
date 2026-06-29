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
    private EmuShiftTemplateEntity ResolveShiftTemplate(string? requestedShiftType, EmployeeEntity employee)
    {
        var code = NormalizeShiftType(requestedShiftType);
        if (code.Length == 0)
        {
            code = InferShiftType(employee.Shift);
        }

        return dbContext.EmuShiftTemplates.FirstOrDefault(row => row.Code == code || row.ShiftType == code)
            ?? CreateFallbackShiftTemplate(code);
    }

    private EmuEmployeeShiftEntity BuildDefaultShift(EmployeeEntity employee, DateOnly date, EmuShiftTemplateEntity? template = null, Guid? id = null)
    {
        template ??= ResolveShiftTemplate(null, employee);
        var plannedStart = ToBusinessDateTime(date, template.StartTime);
        var endDate = template.CrossesMidnight || template.EndTime <= template.StartTime ? date.AddDays(1) : date;
        var plannedEnd = ToBusinessDateTime(endDate, template.EndTime);
        var lunchDate = template.CrossesMidnight && template.LunchStartTime < template.StartTime ? date.AddDays(1) : date;
        var lunchStart = ToBusinessDateTime(lunchDate, template.LunchStartTime);
        var lunchEndDate = template.LunchEndTime <= template.LunchStartTime ? lunchDate.AddDays(1) : lunchDate;
        var lunchEnd = ToBusinessDateTime(lunchEndDate, template.LunchEndTime);

        return new EmuEmployeeShiftEntity
        {
            Id = id ?? BuildEmployeeShiftId(employee.Id, date),
            EmployeeId = employee.Id,
            Employee = employee,
            ShiftDate = date,
            TemplateId = template.Id,
            Template = template,
            ShiftType = template.ShiftType,
            PlannedStartAt = plannedStart,
            PlannedEndAt = plannedEnd,
            ActualStartAt = plannedStart,
            ActualEndAt = plannedEnd,
            LunchStartAt = lunchStart,
            LunchEndAt = lunchEnd,
            LunchTaken = !string.Equals(template.ShiftType, "night", StringComparison.OrdinalIgnoreCase),
            Source = "default",
            RowVersion = 1
        };
    }

    private EmuEmployeeShiftEntity ApplyPercoPresenceToShift(EmuEmployeeShiftEntity shift)
    {
        if (!string.Equals(shift.Source, "default", StringComparison.OrdinalIgnoreCase) || !TableExists("employee_presence_intervals"))
        {
            return shift;
        }

        var windowStart = shift.PlannedStartAt.AddHours(-4);
        var windowEnd = shift.PlannedEndAt.AddHours(8);
        var now = DateTimeOffset.UtcNow;
        var intervals = dbContext.EmployeePresenceIntervals
            .AsNoTracking()
            .Where(row =>
                row.EmployeeId == shift.EmployeeId &&
                row.StartedAt < windowEnd &&
                (row.EndedAt == null
                    ? row.StartedAt >= windowStart
                    : row.EndedAt > windowStart))
            .OrderBy(row => row.StartedAt)
            .ToList();

        if (intervals.Count == 0)
        {
            return shift;
        }

        var firstStart = intervals.Min(row => row.StartedAt);
        var hasOpenInterval = intervals.Any(row => row.EndedAt is null);
        var endedIntervals = intervals.Where(row => row.EndedAt is not null).Select(row => row.EndedAt!.Value).ToList();
        var actualStart = firstStart <= shift.PlannedStartAt ? shift.PlannedStartAt : firstStart;
        var actualEnd = shift.PlannedEndAt;

        if (!hasOpenInterval && endedIntervals.Count > 0)
        {
            var lastEnd = endedIntervals.Max();
            if (lastEnd < shift.PlannedEndAt)
            {
                var isLunchExit = IsLikelyPercoLunchExit(lastEnd, shift);
                actualEnd = isLunchExit ? shift.PlannedEndAt : lastEnd < actualStart ? actualStart : lastEnd;
            }
        }

        return new EmuEmployeeShiftEntity
        {
            Id = shift.Id,
            EmployeeId = shift.EmployeeId,
            Employee = shift.Employee,
            ShiftDate = shift.ShiftDate,
            TemplateId = shift.TemplateId,
            Template = shift.Template,
            ShiftType = shift.ShiftType,
            PlannedStartAt = shift.PlannedStartAt,
            PlannedEndAt = shift.PlannedEndAt,
            ActualStartAt = actualStart,
            ActualEndAt = actualEnd,
            LunchStartAt = shift.LunchStartAt,
            LunchEndAt = shift.LunchEndAt,
            LunchTaken = shift.LunchTaken,
            LunchOverridden = shift.LunchOverridden,
            Source = "perco",
            Comment = shift.Comment,
            Reason = shift.Reason,
            AdjustedByUserId = shift.AdjustedByUserId,
            AdjustedByName = shift.AdjustedByName,
            AdjustedAt = shift.AdjustedAt,
            RowVersion = shift.RowVersion
        };
    }

    private static bool IsLikelyPercoLunchExit(DateTimeOffset exitAt, EmuEmployeeShiftEntity shift)
    {
        if (!shift.LunchTaken)
        {
            return false;
        }

        var lunchWindowStart = shift.LunchStartAt.AddMinutes(-30);
        var lunchWindowEnd = shift.LunchEndAt.AddMinutes(90);
        return exitAt >= lunchWindowStart && exitAt <= lunchWindowEnd;
    }

    private static Guid BuildEmployeeShiftId(Guid employeeId, DateOnly date)
    {
        var payload = Encoding.UTF8.GetBytes($"emu-shift:{employeeId:N}:{date:yyyyMMdd}");
        var hash = SHA256.HashData(payload);
        return new Guid(hash.Take(16).ToArray());
    }

    private static string NormalizeShiftType(string? value)
    {
        var normalized = NormalizeOptional(value).ToLowerInvariant();
        return normalized is "day" or "day11" or "night" or "individual" ? normalized : string.Empty;
    }

    private static string InferShiftType(string? employeeShift)
    {
        var value = NormalizeOptional(employeeShift).ToLowerInvariant();
        if (value.Contains("night", StringComparison.OrdinalIgnoreCase) || value.Contains("ноч", StringComparison.OrdinalIgnoreCase) || value.Contains("20"))
        {
            return "night";
        }

        if (value.Contains("11", StringComparison.OrdinalIgnoreCase) || value.Contains("20:00", StringComparison.OrdinalIgnoreCase))
        {
            return "day11";
        }

        return "day";
    }

    private static EmuShiftTemplateEntity CreateFallbackShiftTemplate(string shiftType) =>
        shiftType switch
        {
            "day11" => new EmuShiftTemplateEntity
            {
                Id = Guid.Parse("33333333-0000-0000-0000-000000000011"),
                Code = "day11",
                Name = "11-hour shift",
                ShiftType = "day11",
                StartTime = new TimeOnly(8, 0),
                EndTime = new TimeOnly(20, 0),
                LunchStartTime = new TimeOnly(12, 0),
                LunchEndTime = new TimeOnly(13, 0),
                SortOrder = 20
            },
            "night" => new EmuShiftTemplateEntity
            {
                Id = Guid.Parse("33333333-0000-0000-0000-000000000020"),
                Code = "night",
                Name = "Night shift",
                ShiftType = "night",
                StartTime = new TimeOnly(20, 0),
                EndTime = new TimeOnly(8, 0),
                LunchStartTime = new TimeOnly(0, 0),
                LunchEndTime = new TimeOnly(1, 0),
                CrossesMidnight = true,
                SortOrder = 30
            },
            _ => new EmuShiftTemplateEntity
            {
                Id = Guid.Parse("33333333-0000-0000-0000-000000000008"),
                Code = "day",
                Name = "Day shift",
                ShiftType = "day",
                StartTime = new TimeOnly(8, 0),
                EndTime = new TimeOnly(17, 0),
                LunchStartTime = new TimeOnly(12, 0),
                LunchEndTime = new TimeOnly(13, 0),
                SortOrder = 10
            }
        };

    private static DateTimeOffset ToBusinessDateTime(DateOnly date, TimeOnly time)
    {
        var local = date.ToDateTime(time, DateTimeKind.Unspecified);
        var offset = BusinessTimeZone.GetUtcOffset(local);
        return new DateTimeOffset(local, offset).ToUniversalTime();
    }

    private static (DateTimeOffset Start, DateTimeOffset End, Guid? WorkSessionId, string WorkNumber, string Reason) ToRange(
        DateTimeOffset start,
        DateTimeOffset end,
        Guid? workSessionId,
        string workNumber,
        string reason) =>
        (start, end < start ? start : end, workSessionId, workNumber, reason);

    private static int SumClippedMinutes(
        IEnumerable<(DateTimeOffset Start, DateTimeOffset End, Guid? WorkSessionId, string WorkNumber, string Reason)> ranges,
        DateTimeOffset boundaryStart,
        DateTimeOffset boundaryEnd) =>
        ranges.Sum(row =>
        {
            var start = row.Start > boundaryStart ? row.Start : boundaryStart;
            var end = row.End < boundaryEnd ? row.End : boundaryEnd;
            return end <= start ? 0 : Math.Max(0, (int)Math.Round((end - start).TotalMinutes));
        });

    private static int RangeMinutes(DateTimeOffset start, DateTimeOffset end) =>
        end <= start ? 0 : Math.Max(0, (int)Math.Round((end - start).TotalMinutes));

    private static bool IsMeaningfulMonthShift(EmuEmployeeShiftSummaryDto summary) =>
        summary.WorkMinutes > 0
        || summary.PauseMinutes > 0
        || summary.FreeMinutes > 0
        || summary.BeforeShiftWorkMinutes > 0
        || summary.OvertimeMinutes > 0
        || summary.Decisions.Count > 0
        || summary.Shift.Source is not ("default" or "none");

    private static List<(DateTimeOffset Start, DateTimeOffset End)> BuildFreeRanges(
        DateTimeOffset shiftStart,
        DateTimeOffset shiftEnd,
        IEnumerable<(DateTimeOffset Start, DateTimeOffset End)> busyRanges)
    {
        var merged = busyRanges
            .Select(row => (Start: row.Start > shiftStart ? row.Start : shiftStart, End: row.End < shiftEnd ? row.End : shiftEnd))
            .Where(row => row.End > row.Start)
            .OrderBy(row => row.Start)
            .Aggregate(new List<(DateTimeOffset Start, DateTimeOffset End)>(), (acc, row) =>
            {
                if (acc.Count == 0 || row.Start > acc[^1].End)
                {
                    acc.Add(row);
                    return acc;
                }

                if (row.End > acc[^1].End)
                {
                    acc[^1] = (acc[^1].Start, row.End);
                }

                return acc;
            });

        var free = new List<(DateTimeOffset Start, DateTimeOffset End)>();
        var cursor = shiftStart;
        foreach (var range in merged)
        {
            if (range.Start > cursor)
            {
                free.Add((cursor, range.Start));
            }

            if (range.End > cursor)
            {
                cursor = range.End;
            }
        }

        if (cursor < shiftEnd)
        {
            free.Add((cursor, shiftEnd));
        }

        return free;
    }

    private static EmuEmployeeShiftIntervalDto ToSummaryInterval(
        string type,
        DateTimeOffset startedAt,
        DateTimeOffset endedAt,
        string label,
        Guid? workSessionId,
        string workNumber,
        string reason) =>
        new(type, startedAt, endedAt, Math.Max(0, (int)Math.Round((endedAt - startedAt).TotalMinutes)), label, workSessionId, workNumber, NormalizeOptional(reason));

    private static string BuildShiftAuditValue(EmuEmployeeShiftDto value) =>
        $"{value.EmployeeName}; {value.ShiftDate:yyyy-MM-dd}; {value.ShiftType}; {value.ActualStartAt:O}-{value.ActualEndAt:O}; lunch {value.LunchStartAt:O}-{value.LunchEndAt:O}; source {value.Source}; row {value.RowVersion}";

    private static string BuildShiftAuditComment(EmuEmployeeShiftDto before, EmuEmployeeShiftDto after, string reason) =>
        $"{reason}. Before: {BuildShiftAuditValue(before)}. After: {BuildShiftAuditValue(after)}";
}
