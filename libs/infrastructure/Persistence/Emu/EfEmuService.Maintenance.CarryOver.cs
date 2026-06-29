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
    public int CarryOverForgottenWork(DateTimeOffset now)
    {
        var today = GetBusinessDate(now);
        var operationAt = now.ToUniversalTime();
        var forgotten = dbContext.EmuWorkSessions
            .Where(row => row.DeletedAt == null && row.CompletedAt == null && row.WorkDate < today)
            .ToList();

        foreach (var session in forgotten)
        {
            if (dbContext.EmuWorkSessionCarryOvers.Any(row => row.WorkSessionId == session.Id && row.ToDate == today))
            {
                continue;
            }

            var previousDate = session.WorkDate;
            session.WorkDate = today;
            session.IsCarriedOver = true;
            session.UpdatedAt = operationAt;
            session.RowVersion++;
            dbContext.EmuWorkSessionCarryOvers.Add(new EmuWorkSessionCarryOverEntity
            {
                Id = Guid.NewGuid(),
                WorkSessionId = session.Id,
                FromDate = previousDate,
                ToDate = today,
                CreatedAt = operationAt
            });
            AddAudit(session.Id, null, "carried_over", previousDate.ToString("yyyy-MM-dd"), today.ToString("yyyy-MM-dd"), "Перенос на следующие сутки", null, "system", operationAt);
        }

        dbContext.SaveChanges();
        return forgotten.Count(row => row.WorkDate == today);
    }
}
