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
    private const long ActiveParticipationLockKey = 0x454D554143544956;

    private ActiveParticipationMutation BeginActiveParticipationMutation()
    {
        var transaction = dbContext.Database.CurrentTransaction is null
            ? dbContext.Database.BeginTransaction()
            : null;
        dbContext.Database.ExecuteSqlRaw("SELECT pg_advisory_xact_lock({0})", ActiveParticipationLockKey);
        return new ActiveParticipationMutation(transaction);
    }

    private sealed class ActiveParticipationMutation(
        Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction? transaction) : IDisposable
    {
        public void Commit() => transaction?.Commit();

        public void Dispose() => transaction?.Dispose();
    }

    private IQueryable<EmuWorkSessionEntity> LoadSessions(
        bool includeParticipationIntervals = true,
        bool asNoTracking = false)
    {
        var query = dbContext.EmuWorkSessions
            .Include(row => row.Section)
            .Include(row => row.CreatedByUser)
            .Include(row => row.AuditEvents)
            .AsQueryable();

        if (asNoTracking)
        {
            query = query.AsNoTracking();
        }

        query = includeParticipationIntervals
            ? query.Include(row => row.Employees).ThenInclude(row => row.ParticipationIntervals)
            : query.Include(row => row.Employees);

        return query
            .Include(row => row.Pauses)
            .ThenInclude(row => row.Employees)
            .AsSplitQuery();
    }

    private EmuWorkSessionEntity? LoadSession(Guid id) =>
        LoadSessions().FirstOrDefault(row => row.Id == id);

    private EmuWorkSessionEntity? LoadSessionForUpdate(Guid id) =>
        LoadSessions(includeParticipationIntervals: false).FirstOrDefault(row => row.Id == id);

    private EmuWorkPlanTaskEntity? LoadPlanTask(Guid id) =>
        dbContext.EmuWorkPlanTasks
            .AsNoTracking()
            .Include(row => row.Section)
            .Include(row => row.Employees)
            .AsSplitQuery()
            .FirstOrDefault(row => row.Id == id);

    private int UpsertNotification(
        string notificationType,
        string dedupeKey,
        string title,
        string message,
        string severity,
        DateTimeOffset createdAt,
        Guid? employeeId = null,
        Guid? workSessionId = null,
        Guid? planTaskId = null)
    {
        var entity = dbContext.EmuNotifications.FirstOrDefault(row => row.DedupeKey == dedupeKey);
        if (entity is null)
        {
            dbContext.EmuNotifications.Add(new EmuNotificationEntity
            {
                Id = Guid.NewGuid(),
                EmployeeId = employeeId,
                WorkSessionId = workSessionId,
                PlanTaskId = planTaskId,
                Title = title,
                Message = message,
                NotificationType = notificationType,
                Severity = severity,
                DedupeKey = dedupeKey,
                Status = "new",
                CreatedAt = createdAt
            });
            return 1;
        }

        var changed = 0;
        if (entity.Status != "new" || entity.ResolvedAt is not null)
        {
            entity.Status = "new";
            entity.ResolvedAt = null;
            entity.CreatedAt = createdAt;
            changed = 1;
        }

        if (entity.Title != title || entity.Message != message || entity.Severity != severity)
        {
            entity.Title = title;
            entity.Message = message;
            entity.Severity = severity;
            changed = 1;
        }

        entity.NotificationType = notificationType;
        entity.EmployeeId = employeeId;
        entity.WorkSessionId = workSessionId;
        entity.PlanTaskId = planTaskId;
        return changed;
    }

    private bool TableExists(string tableName)
    {
        try
        {
            return dbContext.Database
                .SqlQueryRaw<string>("SELECT COALESCE(to_regclass({0})::text, '')", $"public.{tableName}")
                .AsEnumerable()
                .FirstOrDefault() is { Length: > 0 };
        }
        catch
        {
            return false;
        }
    }

    private List<string> FindWorkingConflicts(IEnumerable<Guid> employeeIds, Guid? excludeSessionId = null)
    {
        var ids = employeeIds.ToHashSet();
        return dbContext.EmuWorkSessionEmployees
            .AsNoTracking()
            .Include(row => row.WorkSession)
            .Where(row =>
                ids.Contains(row.EmployeeId)
                && row.Status == EmployeeWorking
                && row.FinishedAt == null
                && row.WorkSession.DeletedAt == null
                && row.WorkSession.CompletedAt == null
                && (excludeSessionId == null || row.WorkSessionId != excludeSessionId))
            .Select(row => row.FullNameSnapshot)
            .Distinct()
            .ToList();
    }
}
