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
    public EmuWorkSessionChangesDto GetWorkSessionChanges(DateTimeOffset since, IReadOnlyList<Guid>? allowedSectionIds = null, Guid? createdByUserId = null)
    {
        var now = DateTimeOffset.UtcNow;
        var rows = ApplyOwnerScope(ApplySectionScope(LoadSessions(), allowedSectionIds), createdByUserId)
            .Where(row => row.UpdatedAt > since.ToUniversalTime())
            .OrderBy(row => row.UpdatedAt)
            .ToList();
        var deletedIds = rows
            .Where(row => row.DeletedAt is not null)
            .Select(row => row.Id)
            .ToList();
        var changedRows = rows
            .Where(row => row.DeletedAt is null)
            .ToList();
        RecalculateSessions(changedRows, now, save: false);

        return new EmuWorkSessionChangesDto(
            now,
            changedRows.Select(MapWorkSession).ToList(),
            deletedIds);
    }

    public EmuCommandResult<EmuWorkSessionDto> GetWorkSession(Guid id)
    {
        var entity = LoadSession(id);
        return entity is null
            ? Failure<EmuWorkSessionDto>("id", "Работа не найдена")
            : Success(MapWorkSession(RecalculateSession(entity, DateTimeOffset.UtcNow)));
    }

    public EmuListResponseDto<EmuAuditEventDto> GetWorkSessionAudit(Guid id, int page = 1, int pageSize = 100)
    {
        var paging = NormalizePaging(page, pageSize);
        var query = dbContext.EmuWorkAuditEvents.AsNoTracking()
            .Where(row => row.WorkSessionId == id)
            .OrderByDescending(row => row.CreatedAt);
        var total = query.Count();
        var rows = query.Skip((paging.Page - 1) * paging.PageSize).Take(paging.PageSize).Select(MapAuditEvent).ToList();
        return ToList(rows, total, paging);
    }
}
