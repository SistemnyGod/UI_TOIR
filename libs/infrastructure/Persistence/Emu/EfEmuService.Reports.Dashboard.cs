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
    public EmuDashboardDto GetDashboard(IReadOnlyList<Guid>? allowedSectionIds = null)
    {
        var today = GetBusinessDate(DateTimeOffset.UtcNow);
        var active = ApplySectionScope(LoadSessions(), allowedSectionIds)
            .Where(row => row.DeletedAt == null && row.CompletedAt == null)
            .OrderBy(row => row.CreatedAt)
            .Take(20)
            .ToList();
        var completedToday = ApplySectionScope(dbContext.EmuWorkSessions.AsNoTracking(), allowedSectionIds)
            .AsNoTracking()
            .Where(row => row.DeletedAt == null && row.CompletedAt != null)
            .AsEnumerable()
            .Count(row => GetBusinessDate(row.CompletedAt!.Value) == today);
        var waiting = active.Count(row => row.Employees.Any(employee => employee.Status == EmployeeWaiting || employee.Status == EmployeeOtherWork));
        var forgotten = active.Where(row => row.IsCarriedOver || row.WorkDate < today).ToList();
        var recentEvents = dbContext.EmuWorkAuditEvents.AsNoTracking()
            .OrderByDescending(row => row.CreatedAt)
            .Take(10)
            .Select(MapAuditEvent)
            .ToList();
        var weekStart = today.AddDays(-(((int)today.DayOfWeek + 6) % 7));
        var weekEnd = weekStart.AddDays(7);
        var weekPlan = ApplyPlanSectionScope(dbContext.EmuWorkPlanTasks.AsNoTracking(), allowedSectionIds)
            .Include(row => row.Section)
            .Include(row => row.Employees)
            .Where(row => row.PlannedDate >= weekStart && row.PlannedDate < weekEnd)
            .OrderBy(row => row.CreatedAt)
            .Take(12)
            .Select(MapPlanTask)
            .ToList();

        return new EmuDashboardDto(
            [
                new("Активные работы", active.Count.ToString(), "сейчас", "blue", "play"),
                new("На паузе", waiting.ToString(), "ожидание", "orange", "pause"),
                new("Завершено сегодня", completedToday.ToString(), "за день", "green", "check"),
                new("Забытые работы", forgotten.Count.ToString(), "перенос", "red", "alert")
            ],
            active.Select(MapWorkSession).ToList(),
            forgotten.Select(MapWorkSession).ToList(),
            recentEvents,
            weekPlan);
    }
}
