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
    public EmuListResponseDto<EmuWorkSessionDto> GetWorkSessions(EmuWorkSessionQueryDto query)
    {
        var paging = NormalizePaging(query.Page, query.PageSize);
        var rowsQuery = BuildWorkSessionQuery(query);
        var total = rowsQuery.Count();
        var rows = ApplyWorkSessionSort(rowsQuery, query.SortBy)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .ToList();
        RecalculateSessions(rows, DateTimeOffset.UtcNow, save: false);

        return ToList(rows.Select(MapWorkSession).ToList(), total, paging);
    }
}
