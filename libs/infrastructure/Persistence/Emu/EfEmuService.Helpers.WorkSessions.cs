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
    private void RecalculateSessions(IEnumerable<EmuWorkSessionEntity> sessions, DateTimeOffset now, bool save)
    {
        foreach (var session in sessions)
        {
            RecalculateSession(session, now);
        }

        if (save)
        {
            dbContext.SaveChanges();
        }
    }

    private static EmuWorkSessionEntity RecalculateSession(EmuWorkSessionEntity session, DateTimeOffset now)
    {
        foreach (var participant in session.Employees)
        {
            if (participant.Status == EmployeeMistaken)
            {
                participant.WaitingMinutes = 0;
                participant.OtherWorkMinutes = 0;
                participant.WorkMinutes = 0;
                continue;
            }

            var end = participant.FinishedAt ?? session.CompletedAt ?? now;
            var total = Math.Max(0, (int)Math.Round((end - participant.ArrivedAt).TotalMinutes));
            var pauses = session.Pauses
                .Where(pause => pause.Employees.Any(employee => employee.EmployeeId == participant.EmployeeId))
                .ToList();
            var waiting = 0;
            var other = 0;
            foreach (var pause in pauses)
            {
                var pauseEnd = pause.EndedAt ?? end;
                var minutes = Math.Max(0, (int)Math.Round((pauseEnd - pause.StartedAt).TotalMinutes));
                if (pause.IsOtherWork)
                {
                    other += minutes;
                }
                else
                {
                    waiting += minutes;
                }
            }

            participant.WaitingMinutes = waiting;
            participant.OtherWorkMinutes = other;
            participant.WorkMinutes = Math.Max(0, total - waiting - other);
        }

        session.WaitingMinutes = session.Employees.Sum(row => row.WaitingMinutes);
        session.OtherWorkMinutes = session.Employees.Sum(row => row.OtherWorkMinutes);
        session.WorkMinutes = session.Employees.Sum(row => row.WorkMinutes);
        return session;
    }

    private void InsertParticipationInterval(
        Guid workSessionId,
        Guid workSessionEmployeeId,
        Guid employeeId,
        string status,
        DateTimeOffset startedAt,
        string reason,
        Guid? actorUserId,
        string actorName,
        DateTimeOffset now)
    {
        dbContext.Database.ExecuteSqlRaw(
            """
            INSERT INTO emu_work_participation_intervals (
                id,
                work_session_id,
                work_session_employee_id,
                employee_id,
                started_at,
                ended_at,
                status,
                reason,
                created_by_user_id,
                created_by_name,
                created_at)
            VALUES ({0}, {1}, {2}, {3}, {4}, NULL, {5}, {6}, {7}, {8}, {9})
            """,
            Guid.NewGuid(),
            workSessionId,
            workSessionEmployeeId,
            employeeId,
            startedAt,
            status,
            NormalizeOptional(reason),
            actorUserId,
            string.IsNullOrWhiteSpace(actorName) ? "system" : actorName,
            now);
    }

    private void CloseOpenParticipationIntervals(Guid workSessionId, IReadOnlyCollection<Guid> employeeIds, DateTimeOffset endedAt)
    {
        if (employeeIds.Count == 0)
        {
            return;
        }

        dbContext.EmuWorkParticipationIntervals
            .Where(row => row.WorkSessionId == workSessionId && employeeIds.Contains(row.EmployeeId) && row.EndedAt == null)
            .ExecuteUpdate(setters => setters.SetProperty(row => row.EndedAt, row => endedAt < row.StartedAt ? row.StartedAt : endedAt));
    }

    private static IQueryable<EmuWorkSessionEntity> ApplyOperationalStatusFilter(IQueryable<EmuWorkSessionEntity> query, string operationalStatus) =>
        operationalStatus switch
        {
            StatusDeleted => query.Where(row => row.DeletedAt != null),
            StatusCompleted => query.Where(row => row.DeletedAt == null && row.CompletedAt != null),
            StatusWaiting => query.Where(row => row.DeletedAt == null && row.CompletedAt == null && row.Status == StatusWaiting),
            StatusInWork => query.Where(row => row.DeletedAt == null && row.CompletedAt == null && row.Status == StatusInWork),
            _ => query
        };

    private static string GetOperationalStatus(EmuWorkSessionEntity row)
    {
        if (row.DeletedAt is not null)
        {
            return StatusDeleted;
        }

        if (row.CompletedAt is not null)
        {
            return StatusCompleted;
        }

        return row.Status == StatusWaiting ? StatusWaiting : StatusInWork;
    }

    private static bool IsTooFarInFuture(DateTimeOffset value, DateTimeOffset now) =>
        value > now.Add(MaxFutureManualOperationSkew);

    private static string NonEmpty(string? value, string fallback)
    {
        var normalized = NormalizeOptional(value);
        return normalized.Length == 0 ? NormalizeOptional(fallback) : normalized;
    }

    private static void Touch(EmuWorkSessionEntity entity, DateTimeOffset now)
    {
        entity.UpdatedAt = now;
        entity.RowVersion++;
    }

    private void CarryOverSession(
        EmuWorkSessionEntity entity,
        DateOnly toDate,
        string comment,
        Guid? actorUserId,
        string actorName,
        DateTimeOffset now)
    {
        var previousDate = entity.WorkDate;
        entity.WorkDate = toDate;
        entity.IsCarriedOver = true;
        Touch(entity, now);

        if (!dbContext.EmuWorkSessionCarryOvers.Any(row => row.WorkSessionId == entity.Id && row.ToDate == toDate))
        {
            dbContext.EmuWorkSessionCarryOvers.Add(new EmuWorkSessionCarryOverEntity
            {
                Id = Guid.NewGuid(),
                WorkSessionId = entity.Id,
                FromDate = previousDate,
                ToDate = toDate,
                CreatedAt = now
            });
        }

        AddAudit(
            entity.Id,
            null,
            "carried_over",
            previousDate.ToString("yyyy-MM-dd"),
            toDate.ToString("yyyy-MM-dd"),
            comment,
            actorUserId,
            actorName,
            now);
    }

    private void AddAudit(Guid? workSessionId, Guid? planTaskId, string eventType, string fromStatus, string toStatus, string? comment, Guid? actorUserId, string actorName, DateTimeOffset now)
    {
        dbContext.EmuWorkAuditEvents.Add(new EmuWorkAuditEventEntity
        {
            Id = Guid.NewGuid(),
            WorkSessionId = workSessionId,
            PlanTaskId = planTaskId,
            EventType = eventType,
            FromStatus = NormalizeOptional(fromStatus),
            ToStatus = NormalizeOptional(toStatus),
            Comment = NormalizeOptional(comment),
            ActorUserId = actorUserId,
            Actor = string.IsNullOrWhiteSpace(actorName) ? "system" : actorName,
            CreatedAt = now
        });
    }
}
