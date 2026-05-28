using Patrol360.Contracts;

namespace Patrol360.Application;

public interface IInventoryExportService
{
    InventoryCommandResult<InventoryGeneratedFileDto> ExportReport(string reportId, string format);

    InventoryCommandResult<InventoryGeneratedFileDto> PrintCustodyDocument(Guid documentId, string format);

    InventoryCommandResult<InventoryGeneratedFileDto> PrintPpeCard(Guid cardId, string type, string format);
}
