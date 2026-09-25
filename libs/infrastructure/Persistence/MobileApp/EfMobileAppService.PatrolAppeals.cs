using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfMobileAppService
{
    private MobileOutboxResponseDto ProcessCreatePatrolAppeal(MobileAccountSessionEntity session, MobileOutboxCommandDto command)
    {
        var assignmentId = ReadGuid(command.Payload, "assignmentId");
        var kind = ReadString(command.Payload, "kind");
        var message = ReadString(command.Payload, "message")?.Trim();
        if (!Guid.TryParse(command.EntityLocalId, out var id) || assignmentId is null
            || kind is not ("message" or "cancel") || string.IsNullOrWhiteSpace(message) || message.Length > 2000)
            return Rejected(command.ClientOperationId, "Appeal requires assignment, type and message (1–2000 characters).");
        var employees = GetBoundEmployeeIds(session.MobileAccount!);
        var assignment = dbContext.Assignments.SingleOrDefault(item => item.Id == assignmentId && employees.Contains(item.EmployeeId));
        if (assignment is null) return Rejected(command.ClientOperationId, "Assignment is unavailable.");
        // Cancellation remains a single workflow. Message appeals are append-only
        // conversation entries and must not overwrite an earlier employee message.
        var existing = kind == "cancel"
            ? dbContext.MobilePatrolAppeals.FirstOrDefault(item => item.AssignmentId == assignmentId && item.Kind == kind && item.Status == "open")
            : null;
        if (existing is not null)
            return new(command.ClientOperationId, "duplicate", existing.Id.ToString(), existing.Version, "An open appeal already exists.", null, null);
        if (dbContext.MobilePatrolAppeals.Any(item => item.Id == id)) return Rejected(command.ClientOperationId, "Appeal identifier already exists.");
        var closed = assignment.Status == AssignmentStatusValues.Completed || assignment.Status == AssignmentStatusValues.Cancelled;
        var now = DateTimeOffset.UtcNow;
        dbContext.MobilePatrolAppeals.Add(new MobilePatrolAppealEntity {
            Id = id, AssignmentId = assignment.Id, MobileAccountId = session.MobileAccountId, DeviceId = session.DeviceId,
            Kind = kind, Message = message, CreatedAt = now, UpdatedAt = now, Version = 1,
            Status = kind == "cancel" && closed ? "obsolete" : "open",
            ResolvedAt = kind == "cancel" && closed ? now : null
        });
        return new(command.ClientOperationId, "accepted", id.ToString(), 1, "Appeal received.", null, null);
    }

    private static MobilePatrolAppealDto MapAppeal(MobilePatrolAppealEntity item) => new(item.Id, item.AssignmentId,
        item.Assignment?.Route?.Name ?? "", item.Assignment?.PatrolRequest?.EmployeeName ?? "", item.DeviceId,
        item.Kind, item.Message, item.Status, item.Reply, item.CreatedAt, item.ResolvedAt, item.Version, item.Assignment?.LockVersion ?? 0);

    public IReadOnlyList<MobilePatrolAppealDto> ListPatrolAppeals(int page, int pageSize, string? status)
    {
        var query = dbContext.MobilePatrolAppeals.AsNoTracking().Include(item => item.Assignment)!.ThenInclude(item => item!.Route)
            .Include(item => item.Assignment)!.ThenInclude(item => item!.PatrolRequest).AsQueryable();
        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(item => item.Status == status);
        return query.OrderByDescending(item => item.CreatedAt).ThenBy(item => item.Id)
            .Skip((Math.Clamp(page, 1, 100000) - 1) * Math.Clamp(pageSize, 1, 100)).Take(Math.Clamp(pageSize, 1, 100))
            .ToArray().Select(MapAppeal).ToArray();
    }

    public MobilePatrolAppealPageDto? GetPatrolAppeals(string accessToken, int pageSize = 25, string? cursor = null, Guid? assignmentId = null)
    {
        var session = FindActiveSession(accessToken);
        if (session?.MobileAccount is null) return null;

        pageSize = Math.Clamp(pageSize, 1, 100);
        if (!string.IsNullOrWhiteSpace(cursor) && !TryReadAppealCursor(cursor, out _, out _))
            throw new ArgumentException("Некорректный курсор обращений.", nameof(cursor));

        var employees = GetBoundEmployeeIds(session.MobileAccount);
        var query = dbContext.MobilePatrolAppeals.AsNoTracking()
            .Include(item => item.Assignment)!.ThenInclude(item => item!.Route)
            .Include(item => item.Assignment)!.ThenInclude(item => item!.PatrolRequest)
            .Where(item => item.MobileAccountId == session.MobileAccount.Id
                && employees.Contains(item.Assignment!.EmployeeId));

        if (assignmentId.HasValue)
            query = query.Where(item => item.AssignmentId == assignmentId.Value);

        if (TryReadAppealCursor(cursor, out var cursorUpdatedAt, out var cursorId))
        {
            query = query.Where(item => item.UpdatedAt < cursorUpdatedAt
                || (item.UpdatedAt == cursorUpdatedAt && item.Id.CompareTo(cursorId) > 0));
        }

        var candidates = query
            .OrderByDescending(item => item.UpdatedAt)
            .ThenBy(item => item.Id)
            .Take(pageSize + 1)
            .ToArray();
        var items = candidates.Take(pageSize).Select(MapAppeal).ToArray();
        return new MobilePatrolAppealPageDto(
            items,
            candidates.Length > pageSize
                ? WriteAppealCursor(candidates[pageSize - 1].UpdatedAt, candidates[pageSize - 1].Id)
                : null);
    }

    private static bool TryReadAppealCursor(string? cursor, out DateTimeOffset createdAt, out Guid id)
    {
        createdAt = default;
        id = default;
        if (string.IsNullOrWhiteSpace(cursor) || cursor.Length > 256) return false;
        try
        {
            var parts = Encoding.UTF8.GetString(Convert.FromBase64String(cursor)).Split('|', 2);
            return parts.Length == 2
                && DateTimeOffset.TryParseExact(parts[0], "O", CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal, out createdAt)
                && Guid.TryParse(parts[1], out id);
        }
        catch (FormatException)
        {
            return false;
        }
    }

    private static string WriteAppealCursor(DateTimeOffset createdAt, Guid id) =>
        Convert.ToBase64String(Encoding.UTF8.GetBytes($"{createdAt:O}|{id:D}"));

    public MobilePatrolAppealDto? ResolvePatrolAppeal(Guid id, ResolveMobilePatrolAppealDto request, Guid? actorId, string actorName)
    {
        if (request.Decision is not ("reply" or "close" or "approve" or "reject") || (request.Reply?.Length ?? 0) > 2000)
            throw new ArgumentException("Некорректное решение или слишком длинный ответ.");
        using var transaction = dbContext.Database.BeginTransaction();
        var assignmentId = dbContext.MobilePatrolAppeals.Where(item => item.Id == id).Select(item => (Guid?)item.AssignmentId).SingleOrDefault();
        if (assignmentId is null) return null;
        if (dbContext.Database.IsNpgsql())
        {
            var key = $"mobile-patrol-assignment:{assignmentId.Value:N}";
            dbContext.Database.ExecuteSqlInterpolated($"SELECT pg_advisory_xact_lock(hashtextextended({key}, 0))");
        }
        var appeal = dbContext.MobilePatrolAppeals.Include(item => item.Assignment)!.ThenInclude(item => item!.PatrolRequest)
            .Include(item => item.Assignment)!.ThenInclude(item => item!.Route).Single(item => item.Id == id);
        var assignment = appeal.Assignment!;
        if (appeal.Version != request.ExpectedVersion || appeal.Status is not ("open" or "needsDispatcherDecision")) throw new InvalidOperationException("Обращение изменилось. Обновите список.");
        if ((request.Decision is "approve" or "reject") && appeal.Kind != "cancel") throw new ArgumentException("Это не запрос отмены.");
        if (request.Decision == "reply" && string.IsNullOrWhiteSpace(request.Reply)) throw new ArgumentException("Введите ответ.");
        var now = DateTimeOffset.UtcNow;
        if (appeal.Status == "needsDispatcherDecision" && assignment.Status != AssignmentStatusValues.Completed)
        {
            throw new InvalidOperationException("Обращение требует разбора конфликта синхронизации. Решение отмены здесь недоступно.");
        }
        if (appeal.Kind == "cancel" && assignment.Status == AssignmentStatusValues.Completed)
            appeal.Status = "obsolete";
        else if (request.Decision == "approve")
        {
            if (assignment.Status == AssignmentStatusValues.Completed || assignment.Status == AssignmentStatusValues.Cancelled)
                appeal.Status = "obsolete";
            else
            {
                if (assignment.LockVersion != request.ExpectedAssignmentVersion) throw new InvalidOperationException("Обход изменился. Обновите список.");
                var previous = assignment.Status;
                assignment.Status = AssignmentStatusValues.Cancelled;
                assignment.LockVersion++;
                if (assignment.PatrolRequest is { } patrolRequest)
                {
                    patrolRequest.Status = assignment.Status;
                    patrolRequest.CancellationReasonCode = "other";
                    patrolRequest.CancellationReasonText = appeal.Message;
                    patrolRequest.CancelledAt = now;
                    patrolRequest.CancelledByUserId = actorId;
                    patrolRequest.CancelledByUserName = actorName;
                    dbContext.PatrolRequestHistoryEvents.Add(new() { Id = Guid.NewGuid(), PatrolRequestId = patrolRequest.Id,
                        EventType = "cancelled", FromStatus = previous, ToStatus = assignment.Status, Details = appeal.Message,
                        ActorUserId = actorId, ActorName = actorName, CreatedAt = now });
                }
                appeal.Status = "approved";
            }
        }
        else appeal.Status = request.Decision switch { "reply" => "open", "reject" => "rejected", _ => "closed" };
        appeal.Reply = request.Reply?.Trim() ?? "";
        appeal.ResolvedBy = actorName;
        appeal.ResolvedAt = appeal.Status == "open" ? null : now;
        appeal.UpdatedAt = now;
        appeal.Version++;
        dbContext.MobileNotifications.Add(new() { Id = Guid.NewGuid(), MobileAccountId = appeal.MobileAccountId,
            EmployeeId = assignment.EmployeeId, Type = "patrolAppealResolved", Title = "Ответ диспетчера",
            Message = string.IsNullOrWhiteSpace(appeal.Reply) ? $"Обращение: {appeal.Status}" : appeal.Reply,
            EntityType = "assignment", EntityId = assignment.Id.ToString(), CreatedAt = now,
            IdempotencyKey = $"patrol-appeal:{appeal.Id}:{appeal.Version}", PushStatus = "pending" });
        dbContext.SaveChanges();
        transaction.Commit();
        return MapAppeal(appeal);
    }
}
