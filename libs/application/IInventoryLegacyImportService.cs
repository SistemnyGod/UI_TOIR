using Patrol360.Contracts;

namespace Patrol360.Application;

public interface IInventoryLegacyImportService
{
    Task<InventoryCommandResult<InventoryLegacyImportRunDto>> ImportAsync(
        InventoryLegacyImportRequestDto request,
        CancellationToken cancellationToken = default);

    InventoryCommandResult<InventoryLegacyImportRunDto> GetRun(Guid id);
}
