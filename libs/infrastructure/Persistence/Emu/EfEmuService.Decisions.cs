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
    public IReadOnlyList<EmuDecisionDto> GetDecisions(EmuDecisionQueryDto query, IReadOnlyList<Guid>? allowedSectionIds = null)
    {
        EscalateOpenDecisions(DateTimeOffset.UtcNow);
        var rows = ApplyDecisionSectionScope(LoadDecisions().AsNoTracking(), allowedSectionIds);

        if (!string.IsNullOrWhiteSpace(query.Status))
        {
            rows = rows.Where(row => row.Status == query.Status);
        }

        if (query.Date is not null)
        {
            rows = rows.Where(row => row.ShiftDate == query.Date.Value);
        }

        if (query.EmployeeId is not null)
        {
            rows = rows.Where(row => row.EmployeeId == query.EmployeeId.Value);
        }

        return rows
            .OrderByDescending(row => row.Severity == "danger")
            .ThenBy(row => row.DetectedAt)
            .Take(500)
            .ToList()
            .Select(MapDecision)
            .ToList();
    }

    public EmuCommandResult<EmuDecisionDto> ResolveDecision(Guid id, EmuResolveDecisionDto request, Guid? actorUserId, string actorName, IReadOnlyList<Guid>? allowedSectionIds = null)
    {
        var resolution = NormalizeRequired(request.Resolution);
        var comment = NormalizeRequired(request.Comment);
        if (resolution.Length == 0)
        {
            return Failure<EmuDecisionDto>("resolution", "Укажите решение");
        }

        if (resolution is not ("worked_through_lunch" or "exclude_lunch" or "confirmed_parallel_work" or "fixed_manually" or "handled_manually" or "false_alarm" or "confirmed_overtime" or "exclude_overtime"))
        {
            return Failure<EmuDecisionDto>("resolution", "Выберите решение спорной ситуации");
        }

        if (comment.Length == 0)
        {
            return Failure<EmuDecisionDto>("comment", "Укажите комментарий");
        }

        var decision = dbContext.EmuDecisions
            .Include(row => row.Employee)
            .Include(row => row.WorkSession)
                .ThenInclude(row => row!.Section)
            .FirstOrDefault(row => row.Id == id);
        if (decision is null)
        {
            return Failure<EmuDecisionDto>("id", "Решение не найдено");
        }

        if (!CanAccessDecision(decision, allowedSectionIds))
        {
            return Failure<EmuDecisionDto>("id", "Решение недоступно по назначенным участкам");
        }

        if (decision.Status != "new")
        {
            return Failure<EmuDecisionDto>("status", "Решение уже закрыто");
        }

        if (decision.RowVersion != request.RowVersion)
        {
            return Failure<EmuDecisionDto>("rowVersion", "Решение было изменено другим пользователем");
        }

        var now = DateTimeOffset.UtcNow;
        var oldStatus = decision.Status;
        decision.Status = "resolved";
        decision.Resolution = resolution;
        decision.Comment = comment;
        decision.ResolvedAt = now;
        decision.ResolvedByUserId = actorUserId;
        decision.ResolvedByName = string.IsNullOrWhiteSpace(actorName) ? "system" : actorName;
        decision.RowVersion++;

        AddAudit(decision.WorkSessionId, null, "decision_resolved", oldStatus, resolution, comment, actorUserId, actorName, now);
        CloseDecisionNotification(decision, now);
        dbContext.SaveChanges();

        return Success(MapDecision(decision));
    }
}
