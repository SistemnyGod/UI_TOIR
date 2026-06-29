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
    private IReadOnlyList<EmuDecisionDto> GetShiftDecisions(Guid employeeId, DateOnly shiftDate, IReadOnlyList<Guid>? allowedSectionIds = null) =>
        ApplyDecisionSectionScope(LoadDecisions(), allowedSectionIds)
            .Where(row => row.EmployeeId == employeeId && row.ShiftDate == shiftDate)
            .OrderBy(row => row.DetectedAt)
            .ToList()
            .Select(MapDecision)
            .ToList();

    private IQueryable<EmuDecisionEntity> LoadDecisions() =>
        dbContext.EmuDecisions
            .Include(row => row.Employee)
            .Include(row => row.WorkSession)
                .ThenInclude(row => row!.Section);

    private void EscalateOpenDecisions(DateTimeOffset now)
    {
        var stale = dbContext.EmuDecisions
            .Where(row => row.Status == "new" && row.Severity != "danger" && now - row.DetectedAt >= DecisionEscalationThreshold)
            .ToList();
        foreach (var row in stale)
        {
            row.Severity = "danger";
            row.RowVersion++;
        }

        if (stale.Count > 0)
        {
            dbContext.SaveChanges();
        }
    }

    private void CloseDecisionNotification(EmuDecisionEntity decision, DateTimeOffset now)
    {
        var notificationKey = BuildDecisionNotificationKey(decision);
        var notification = dbContext.EmuNotifications.FirstOrDefault(row => row.DedupeKey == notificationKey && row.Status == "new");
        if (notification is not null)
        {
            notification.Status = "resolved";
            notification.ResolvedAt = now;
        }
    }
}
