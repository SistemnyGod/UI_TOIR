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
        using var mutation = BeginActiveParticipationMutation();
        var today = GetBusinessDate(now);
        var operationAt = now.ToUniversalTime();
        var forgotten = dbContext.EmuWorkSessions
            .Where(row => row.DeletedAt == null && row.CompletedAt == null && row.WorkDate < today)
            .ToList();

        var forgottenIds = forgotten.Select(row => row.Id).ToArray();
        var alreadyCarried = dbContext.EmuWorkSessionCarryOvers.AsNoTracking()
            .Where(row => row.ToDate == today && forgottenIds.Contains(row.WorkSessionId))
            .Select(row => row.WorkSessionId).ToHashSet();
        foreach (var session in forgotten)
        {
            if (alreadyCarried.Contains(session.Id))
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
        mutation.Commit();
        return forgotten.Count(row => row.WorkDate == today);
    }
}
