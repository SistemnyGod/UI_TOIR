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
            MapWorkSessions(changedRows),
            deletedIds);
    }

    public EmuCommandResult<EmuWorkSessionDto> GetWorkSession(Guid id)
    {
        var entity = LoadSession(id);
        return entity is null
            ? Failure<EmuWorkSessionDto>("id", "Работа не найдена")
            : Success(MapWorkSession(RecalculateSession(entity, DateTimeOffset.UtcNow)));
    }

    public EmuListResponseDto<EmuShiftRemarkDto> GetShiftRemarks(
        int page = 1,
        int pageSize = 50,
        Guid? sectionId = null,
        Guid? employeeId = null,
        IReadOnlyList<Guid>? allowedSectionIds = null)
    {
        var paging = NormalizePaging(page, pageSize);
        var rowsQuery = dbContext.MobileShiftRemarks
            .AsNoTracking()
            .Include(row => row.Employee)
            .Include(row => row.Section)
            .AsQueryable();

        if (allowedSectionIds is not null)
        {
            rowsQuery = rowsQuery.Where(row => allowedSectionIds.Contains(row.SectionId));
        }

        if (sectionId is not null)
        {
            rowsQuery = rowsQuery.Where(row => row.SectionId == sectionId.Value);
        }

        if (employeeId is not null)
        {
            rowsQuery = rowsQuery.Where(row => row.EmployeeId == employeeId.Value);
        }

        var total = rowsQuery.Count();
        var rows = rowsQuery
            .OrderByDescending(row => row.CreatedAtServer)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .ToList();

        return ToList(MapShiftRemarks(rows), total, paging);
    }

    public EmuCommandResult<EmuShiftRemarkDto> GetShiftRemark(Guid id)
    {
        var entity = dbContext.MobileShiftRemarks
            .AsNoTracking()
            .Include(row => row.Employee)
            .Include(row => row.Section)
            .FirstOrDefault(row => row.Id == id);

        return entity is null
            ? Failure<EmuShiftRemarkDto>("id", "Замечание не найдено")
            : Success(MapShiftRemark(entity));
    }

    public ResultAttachmentFileDto? GetShiftRemarkAttachmentFile(Guid remarkId, Guid attachmentId)
    {
        var file = dbContext.MobileUploadedFiles
            .AsNoTracking()
            .FirstOrDefault(row => row.LinkedAt != null && row.Id == attachmentId && row.RemarkId == remarkId.ToString());
        if (file is null)
        {
            return null;
        }

        var storagePath = Path.Combine(AppContext.BaseDirectory, "mobile-files", file.StorageFileName);
        return File.Exists(storagePath)
            ? new ResultAttachmentFileDto(storagePath, file.ContentType, file.OriginalFileName)
            : null;
    }

    public ResultAttachmentFileDto? GetWorkAttachmentFile(Guid workSessionId, Guid attachmentId)
    {
        var file = dbContext.MobileUploadedFiles
            .AsNoTracking()
            .FirstOrDefault(row => row.LinkedAt != null && row.Id == attachmentId && row.WorkTaskId == workSessionId);
        if (file is null)
        {
            return null;
        }

        var storagePath = Path.Combine(AppContext.BaseDirectory, "mobile-files", file.StorageFileName);
        return File.Exists(storagePath)
            ? new ResultAttachmentFileDto(storagePath, file.ContentType, file.OriginalFileName)
            : null;
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

    private EmuShiftRemarkDto MapShiftRemark(MobileShiftRemarkEntity row) =>
        MapShiftRemarks([row]).Single();

    private IReadOnlyList<EmuShiftRemarkDto> MapShiftRemarks(IReadOnlyCollection<MobileShiftRemarkEntity> rows)
    {
        if (rows.Count == 0)
        {
            return [];
        }

        var remarksById = rows.ToDictionary(row => row.Id.ToString(), StringComparer.OrdinalIgnoreCase);
        var declaredClientFileIdsByRemarkId = rows.ToDictionary(
            row => row.Id.ToString(),
            row => ReadShiftRemarkMediaIds(row.MediaClientFileIdsJson).ToHashSet(StringComparer.OrdinalIgnoreCase),
            StringComparer.OrdinalIgnoreCase);
        var remarkIds = remarksById.Keys.ToArray();
        var filesByRemarkId = dbContext.MobileUploadedFiles
            .AsNoTracking()
            .Where(file => file.LinkedAt != null && file.RemarkId != null && remarkIds.Contains(file.RemarkId))
            .OrderBy(file => file.UploadedAt)
            .Select(file => new
            {
                file.RemarkId,
                file.MobileAccountId,
                file.ClientFileId,
                Attachment = new EmuWorkAttachmentDto(
                    file.Id,
                    file.OriginalFileName,
                    file.ContentType,
                    file.SizeBytes,
                    file.UploadedAt,
                    $"/api/v1/emu/shift-remarks/{file.RemarkId}/attachments/{file.Id}")
            })
            .ToList()
            .Where(file => file.RemarkId is not null && remarksById.TryGetValue(file.RemarkId, out var remark)
                && file.MobileAccountId == remark.MobileAccountId
                && (declaredClientFileIdsByRemarkId[file.RemarkId].Count == 0
                    || declaredClientFileIdsByRemarkId[file.RemarkId].Contains(file.ClientFileId)))
            .GroupBy(file => file.RemarkId!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => (IReadOnlyList<EmuWorkAttachmentDto>)group.Select(file => file.Attachment).ToList(), StringComparer.OrdinalIgnoreCase);

        return rows.Select(row => new EmuShiftRemarkDto(
            row.Id,
            row.EmployeeId,
            row.Employee?.FullName ?? "Сотрудник не найден",
            row.SectionId,
            row.Section?.Name ?? "Участок не найден",
            row.Title,
            row.Comment,
            row.Status,
            row.CreatedAtLocal,
            row.CreatedAtServer,
            "mobile",
            filesByRemarkId.GetValueOrDefault(row.Id.ToString(), []))).ToList();
    }

    private static IReadOnlyList<string> ReadShiftRemarkMediaIds(string value)
    {
        try
        {
            return JsonSerializer.Deserialize<List<string>>(value)?
                .Where(item => !string.IsNullOrWhiteSpace(item))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList() ?? [];
        }
        catch
        {
            return [];
        }
    }
}
