using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Caching.Memory;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfPatrolStore
{
    public DashboardSummaryDto GetSummary() =>
        dashboardCache.GetOrCreate(DashboardSummaryCacheKey, entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(30);
            return BuildSummary();
        })!;

    private DashboardSummaryDto BuildSummary()
    {
        var onlineThreshold = DateTimeOffset.UtcNow.AddMinutes(-15);
        var localToday = DateOnly.FromDateTime(DateTime.Now);
        var localStartDateTime = localToday.ToDateTime(TimeOnly.MinValue);
        var localEndDateTime = localToday.AddDays(1).ToDateTime(TimeOnly.MinValue);
        var todayStart = new DateTimeOffset(localStartDateTime, TimeZoneInfo.Local.GetUtcOffset(localStartDateTime)).ToUniversalTime();
        var todayEnd = new DateTimeOffset(localEndDateTime, TimeZoneInfo.Local.GetUtcOffset(localEndDateTime)).ToUniversalTime();
        var totalPoints = dbContext.RoutePoints.Count(point => point.Route != null && !point.Route.IsArchived);
        var todayResults = dbContext.PatrolResults
            .AsNoTracking()
            .Where(result => result.ActualAt >= todayStart && result.ActualAt < todayEnd)
            .Select(result => new
            {
                result.AssignmentId,
                result.RoutePointId,
                result.Status,
                result.IssueType
            })
            .ToList();
        var completedPoints = todayResults.Count(result => result.RoutePointId != null);
        if (completedPoints == 0)
        {
            completedPoints = todayResults.Count();
        }
        var completedToday = todayResults
            .Where(result => result.AssignmentId != null)
            .Select(result => result.AssignmentId!.Value)
            .Distinct()
            .Count()
            + todayResults.Count(result => result.AssignmentId == null);
        var issues = todayResults.Count(result =>
            result.Status == "Замечание"
            || result.Status == "Просрочено"
            || result.IssueType != string.Empty && result.IssueType != "-");
        var currentAssignments = GetCurrentAssignmentEntities(DateTimeOffset.UtcNow);

        return new DashboardSummaryDto(
            ActivePatrols: currentAssignments.Count,
            DelayedPatrols: dbContext.Assignments.Count(assignment => AssignmentStatusValues.Delayed.Contains(assignment.Status)),
            Issues: issues,
            CompletedToday: completedToday,
            ShiftCoveragePercent: CalculateShiftCoveragePercent(),
            CompletedPoints: completedPoints,
            TotalPoints: totalPoints,
            OnlineEmployees: dbContext.Employees.Count(employee => employee.LastSeenAt >= onlineThreshold),
            TotalEmployees: dbContext.Employees.Count());
    }

    private int CalculateShiftCoveragePercent()
    {
        var employeesOnShift = dbContext.Employees.Count(employee => employee.Status == "На смене" || employee.Status == "Активен");
        if (employeesOnShift == 0)
        {
            return 0;
        }

        var assignedEmployees = GetCurrentAssignmentEntities(DateTimeOffset.UtcNow)
            .Select(assignment => assignment.EmployeeId)
            .Distinct()
            .Count();

        return Math.Clamp((int)Math.Round(assignedEmployees / (double)employeesOnShift * 100), 0, 100);
    }

    private void SaveChangesAndInvalidateDashboardSummary()
    {
        dbContext.SaveChanges();
        dashboardCache.Remove(DashboardSummaryCacheKey);
    }
}
