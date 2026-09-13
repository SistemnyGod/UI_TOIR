using Patrol360.Contracts;

namespace Patrol360.Application;

public interface IPpeDocxPdfConverter
{
    Task<InventoryCommandResult<InventoryGeneratedFileDto>> ConvertAsync(InventoryGeneratedFileDto docx, CancellationToken cancellationToken);
}
