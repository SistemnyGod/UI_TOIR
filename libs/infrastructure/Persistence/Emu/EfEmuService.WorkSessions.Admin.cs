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
    public EmuCommandResult<EmuWorkSessionDto> DeleteWorkSession(Guid id, EmuDeleteWorkSessionDto request, Guid? actorUserId, string actorName)
    {
        var entity = LoadSessionForUpdate(id);
        if (entity is null || entity.DeletedAt is not null)
        {
            return Failure<EmuWorkSessionDto>("id", "Работа не найдена");
        }

        if (entity.RowVersion != request.RowVersion)
        {
            return Failure<EmuWorkSessionDto>("rowVersion", "Карточка была изменена другим пользователем");
        }

        var reason = NormalizeRequired(request.Reason);
        if (reason.Length == 0)
        {
            return Failure<EmuWorkSessionDto>("reason", "Укажите причину удаления");
        }

        var now = DateTimeOffset.UtcNow;
        entity.DeletedAt = now;
        entity.DeletedByUserId = actorUserId;
        entity.DeleteReason = reason;
        entity.Status = StatusDeleted;
        Touch(entity, now);
        AddAudit(entity.Id, null, "deleted", string.Empty, StatusDeleted, reason, actorUserId, actorName, now);
        dbContext.SaveChanges();

        return Success(MapWorkSession(LoadSession(entity.Id)!));
    }

    public EmuCommandResult<EmuWorkSessionDto> CarryOverWorkSession(Guid id, EmuCarryOverWorkSessionDto request, Guid? actorUserId, string actorName)
    {
        var entity = LoadSessionForUpdate(id);
        if (entity is null || entity.DeletedAt is not null)
        {
            return Failure<EmuWorkSessionDto>("id", "Работа не найдена");
        }

        if (entity.RowVersion != request.RowVersion)
        {
            return Failure<EmuWorkSessionDto>("rowVersion", "Карточка была изменена другим пользователем");
        }

        if (entity.CompletedAt is not null)
        {
            return Failure<EmuWorkSessionDto>("id", "Завершенную работу нельзя перенести");
        }

        var comment = NormalizeRequired(request.Comment);
        if (comment.Length == 0)
        {
            return Failure<EmuWorkSessionDto>("comment", "Укажите причину переноса работы");
        }

        if (request.ToDate <= entity.WorkDate)
        {
            return Failure<EmuWorkSessionDto>("toDate", "Новая дата должна быть позже текущей даты работы");
        }

        var now = DateTimeOffset.UtcNow;
        CarryOverSession(entity, request.ToDate, comment, actorUserId, actorName, now);
        dbContext.SaveChanges();

        return Success(MapWorkSession(LoadSession(entity.Id)!));
    }
}
