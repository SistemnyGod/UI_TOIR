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
    public EmuCommandResult<EmuEmployeeWorkHistoryReportDto> GetEmployeeWorkHistoryReport(Guid employeeId, EmuWorkSessionQueryDto query)
    {
        var employee = dbContext.Employees.AsNoTracking().FirstOrDefault(row => row.Id == employeeId);
        if (employee is null)
        {
            return Failure<EmuEmployeeWorkHistoryReportDto>("employeeId", "Сотрудник не найден");
        }

        var generatedAt = DateTimeOffset.UtcNow;
        var scopedQuery = query with { EmployeeId = employeeId };
        var allRows = BuildWorkSessionQuery(scopedQuery).ToList();
        RecalculateSessions(allRows, generatedAt, save: false);

        var participants = allRows
            .SelectMany(row => row.Employees
                .Where(participant => participant.EmployeeId == employeeId && participant.Status != EmployeeMistaken)
                .Select(participant => new { Session = row, Employee = participant }))
            .ToList();

        var employeeReport = new EmuEmployeeWorkReportDto(
            employee.Id,
            employee.FullName,
            employee.PersonnelNo,
            employee.Position,
            employee.Department,
            participants.Select(row => row.Session.Id).Distinct().Count(),
            participants.Sum(row => row.Employee.WorkMinutes),
            participants.Sum(row => row.Employee.WaitingMinutes),
            participants.Sum(row => row.Employee.OtherWorkMinutes),
            participants.Sum(row => row.Employee.WorkMinutes + row.Employee.WaitingMinutes + row.Employee.OtherWorkMinutes),
            participants.Select(row => row.Session.SectionId).Distinct().Count());

        var sections = participants
            .GroupBy(row => row.Session.SectionId)
            .Select(group =>
            {
                var rows = group.ToList();
                return new EmuSectionWorkReportDto(
                    group.Key,
                    rows.First().Session.Section?.Name ?? string.Empty,
                    rows.Select(row => row.Session.Id).Distinct().Count(),
                    1,
                    rows.Sum(row => row.Employee.WorkMinutes),
                    rows.Sum(row => row.Employee.WaitingMinutes),
                    rows.Sum(row => row.Employee.OtherWorkMinutes),
                    rows.Sum(row => row.Employee.WorkMinutes + row.Employee.WaitingMinutes + row.Employee.OtherWorkMinutes),
                    rows.Select(row => row.Session).DistinctBy(row => row.Id).Count(IsProblemWorkSession));
            })
            .OrderByDescending(row => row.TotalMinutes)
            .ThenBy(row => row.SectionName)
            .ToList();

        var paging = NormalizePaging(query.Page, query.PageSize);
        var pageRows = ApplyWorkSessionSort(BuildWorkSessionQuery(scopedQuery), query.SortBy)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .ToList();
        RecalculateSessions(pageRows, generatedAt, save: false);
        var works = ToList(pageRows.Select(MapWorkSession).ToList(), allRows.Count, paging);

        return Success(new EmuEmployeeWorkHistoryReportDto(
            SanitizeAppliedQuery(scopedQuery),
            generatedAt,
            employeeReport,
            sections,
            works));
    }
}
