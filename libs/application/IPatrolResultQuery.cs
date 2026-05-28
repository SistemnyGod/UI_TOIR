using Patrol360.Contracts;

namespace Patrol360.Application;

public interface IPatrolResultQuery
{
    IReadOnlyList<ResultListItemDto> GetResults(ResultFilterDto filter);

    ResultExportFileDto ExportResults(ResultFilterDto filter);

    ResultDetailDto? GetResult(Guid id);

    ResultAttachmentFileDto? GetAttachmentFile(Guid resultId, Guid attachmentId);
}

public sealed record ResultAttachmentFileDto(
    string Path,
    string ContentType,
    string FileName);

public sealed record ResultExportFileDto(
    byte[] Content,
    string ContentType,
    string FileName);
