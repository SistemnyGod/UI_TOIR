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
    public EmuWorkHistoryReportDto GetWorkHistoryReport(EmuWorkSessionQueryDto query)
    {
        var generatedAt = DateTimeOffset.UtcNow;
        var rows = BuildWorkSessionQuery(query).ToList();
        RecalculateSessions(rows, generatedAt, save: false);

        var problemRows = rows.Where(IsProblemWorkSession).ToList();
        var participants = rows
            .SelectMany(row => row.Employees
                .Where(employee => employee.Status != EmployeeMistaken)
                .Select(employee => new { Session = row, Employee = employee }))
            .ToList();

        var totals = new EmuWorkHistoryTotalsDto(
            rows.Count,
            rows.Count(row => row.DeletedAt == null && row.CompletedAt != null),
            problemRows.Count,
            rows.Count(row => row.DeletedAt != null),
            participants.Select(row => row.Employee.EmployeeId).Distinct().Count(),
            rows.Select(row => row.SectionId).Distinct().Count(),
            rows.Sum(row => row.WorkMinutes),
            rows.Sum(row => row.WaitingMinutes),
            rows.Sum(row => row.OtherWorkMinutes),
            rows.Sum(row => row.WorkMinutes + row.WaitingMinutes + row.OtherWorkMinutes),
            rows.Count == 0 ? 0 : (int)Math.Round(rows.Average(row => row.WorkMinutes + row.WaitingMinutes + row.OtherWorkMinutes)));

        var employees = participants
            .GroupBy(row => row.Employee.EmployeeId)
            .Select(group =>
            {
                var first = group.OrderBy(row => row.Session.WorkDate).First().Employee;
                return new EmuEmployeeWorkReportDto(
                    group.Key,
                    NonEmpty(first.FullNameSnapshot, first.Employee?.FullName ?? string.Empty),
                    first.Employee?.PersonnelNo ?? string.Empty,
                    NonEmpty(first.PositionSnapshot, first.Employee?.Position ?? string.Empty),
                    first.Employee?.Department ?? string.Empty,
                    group.Select(row => row.Session.Id).Distinct().Count(),
                    group.Sum(row => row.Employee.WorkMinutes),
                    group.Sum(row => row.Employee.WaitingMinutes),
                    group.Sum(row => row.Employee.OtherWorkMinutes),
                    group.Sum(row => row.Employee.WorkMinutes + row.Employee.WaitingMinutes + row.Employee.OtherWorkMinutes),
                    group.Select(row => row.Session.SectionId).Distinct().Count());
            })
            .OrderByDescending(row => row.TotalMinutes)
            .ThenBy(row => row.EmployeeName)
            .ToList();

        var sections = rows
            .GroupBy(row => row.SectionId)
            .Select(group => new EmuSectionWorkReportDto(
                group.Key,
                group.First().Section?.Name ?? string.Empty,
                group.Count(),
                group.SelectMany(row => row.Employees).Where(employee => employee.Status != EmployeeMistaken).Select(employee => employee.EmployeeId).Distinct().Count(),
                group.Sum(row => row.WorkMinutes),
                group.Sum(row => row.WaitingMinutes),
                group.Sum(row => row.OtherWorkMinutes),
                group.Sum(row => row.WorkMinutes + row.WaitingMinutes + row.OtherWorkMinutes),
                group.Count(IsProblemWorkSession)))
            .OrderByDescending(row => row.TotalMinutes)
            .ThenBy(row => row.SectionName)
            .ToList();

        var exceptions = problemRows
            .OrderByDescending(row => row.CompletedAt ?? row.UpdatedAt)
            .Take(200)
            .Select(row => new EmuWorkHistoryExceptionDto(
                row.Id,
                row.WorkNumber,
                row.WorkDate,
                row.SectionId,
                row.Section?.Name ?? string.Empty,
                BuildWorkHistoryExceptionReason(row),
                row.DeletedAt is not null ? "danger" : "warning",
                row.WorkMinutes,
                row.WaitingMinutes,
                row.OtherWorkMinutes))
            .ToList();

        return new EmuWorkHistoryReportDto(
            SanitizeAppliedQuery(query with { Page = 1, PageSize = 0 }),
            generatedAt,
            totals,
            employees,
            sections,
            exceptions);
    }
}
