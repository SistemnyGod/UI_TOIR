using Patrol360.Contracts;

namespace Patrol360.Application;

public interface IPatrolResultQuery
{
    IReadOnlyList<ResultListItemDto> GetResults(ResultFilterDto filter, int page = 1, int pageSize = 100);

    ResultPageDto GetResultsPage(ResultFilterDto filter, int page = 1, int pageSize = 100);

    Task<ResultPageDto> GetResultsPageAsync(ResultFilterDto filter, int page = 1, int pageSize = 100, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(GetResultsPage(filter, page, pageSize));
    }

    async Task<ResultGroupPageDto> GetResultGroupsPageAsync(
        ResultFilterDto filter,
        int page = 1,
        int pageSize = 100,
        CancellationToken cancellationToken = default)
    {
        var resultPage = await GetResultsPageAsync(filter, page, pageSize, cancellationToken);
        var groups = resultPage.Items
            .GroupBy(item => item.AssignmentId is { } assignmentId ? $"assignment:{assignmentId:N}" : $"result:{item.Id:N}")
            .Select(group => new ResultGroupPageItemDto(
                group.First().AssignmentId,
                group.First().AssignmentId is null ? group.First().Id : null,
                group.ToArray()))
            .ToArray();

        return new ResultGroupPageDto(
            groups,
            resultPage.Page,
            resultPage.PageSize,
            resultPage.Total,
            resultPage.TotalPages,
            resultPage.HasNext);
    }

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
    string FileName,
    bool Truncated = false,
    int RowCount = 0,
    int MaxRows = 0);
