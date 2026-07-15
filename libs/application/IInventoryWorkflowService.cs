using Patrol360.Contracts;

namespace Patrol360.Application;

public interface IInventoryWorkflowService
{
    InventoryListResponseDto<InventoryCustodyRecordDto> GetCustodyRecords(InventoryListQuery query);

    InventoryCommandResult<InventoryCustodyRecordDto> CreateCustodyRecord(CreateInventoryCustodyRecordDto request);

    InventoryCommandResult<InventoryCustodyRecordDto> UpdateCustodyRecordStatus(Guid id, UpdateInventoryStatusDto request);

    InventoryCommandResult<InventoryCustodyRecordDto> TransferCustodyRecord(Guid id, TransferInventoryCustodyRecordDto request);

    InventoryCommandResult<InventoryCustodyRecordDto> ArchiveCustodyRecord(Guid id);

    InventoryListResponseDto<InventoryCustodyDocumentDto> GetCustodyDocuments(InventoryListQuery query);

    InventoryCommandResult<InventoryCustodyDocumentDetailDto> GetCustodyDocument(Guid id);

    InventoryListResponseDto<InventoryHistoryDto> GetCustodyRecordHistory(Guid id, InventoryListQuery query);

    InventoryListResponseDto<InventoryHistoryDto> GetCustodyDocumentHistory(Guid id, InventoryListQuery query);

    InventoryCommandResult<InventoryCustodyDocumentDto> CloseCustodyDocument(Guid id);

    InventoryCommandResult<InventoryCustodyDocumentDto> OpenCustodyDocument(Guid id);

    InventoryCommandResult<InventoryCustodyDocumentDto> ArchiveCustodyDocument(Guid id);

    InventoryPpeCardsResponseDto GetPpeCards(InventoryListQuery query);

    InventoryCommandResult<InventoryPpeCardDetailDto> GetPpeCard(Guid id);

    InventoryCommandResult<InventoryPpeCardDetailDto> CreatePpeCard(CreateInventoryPpeCardDto request);

    InventoryCommandResult<InventoryPpeCardDetailDto> UpdatePpeCard(Guid id, CreateInventoryPpeCardDto request);

    InventoryCommandResult<InventoryPpeCardDetailDto> ArchivePpeCard(Guid id);

    InventoryCommandResult<InventoryPpeCardLineDto> AddPpeCardLine(Guid cardId, UpsertInventoryPpeCardLineDto request);

    InventoryCommandResult<InventoryPpeCardLineDto> UpdatePpeCardLine(Guid cardId, Guid lineId, UpsertInventoryPpeCardLineDto request);

    InventoryCommandResult<InventoryPpeCardLineDto> UpdatePpeCardLineStatus(Guid cardId, Guid lineId, UpdateInventoryStatusDto request);

    InventoryCommandResult<InventoryPpeCardLineDto> ArchivePpeCardLine(Guid cardId, Guid lineId);

    InventoryListResponseDto<InventoryHistoryDto> GetPpeCardHistory(Guid cardId, InventoryListQuery query);

    InventoryListResponseDto<InventoryHistoryDto> GetPpeCardLinesHistory(Guid cardId, InventoryListQuery query);

    InventoryListResponseDto<InventoryHistoryDto> GetPpeCardLineHistory(Guid cardId, Guid lineId, InventoryListQuery query);

    InventoryListResponseDto<InventoryPpeMovementDto> GetPpeMovements(InventoryListQuery query, Guid? employeeId = null, Guid? itemId = null);

    InventoryCommandResult<InventoryPpeWorkspaceDto> GetPpeWorkspace(Guid employeeId);

    InventoryListResponseDto<InventoryPpeHistoryRowDto> GetPpeHistory(InventoryListQuery query);

    InventoryCommandResult<InventoryPpeCardDetailDto> CreatePpeCardDraft(CreateInventoryPpeCardDraftDto request);

    InventoryCommandResult<InventoryPpeCardDetailDto> UpdatePpeCardNormRows(Guid cardId, UpdateInventoryPpeCardNormRowsDto request);

    InventoryCommandResult<InventoryPpeCardLineDto> CreatePpeIssue(Guid cardId, CreateInventoryPpeIssueDto request);

    InventoryCommandResult<InventoryPpeCardLineDto> ApplyPpeLineAction(Guid cardId, Guid lineId, ApplyInventoryPpeLineActionDto request);

    InventoryListResponseDto<InventoryPpeNormMappingDto> GetPpeNormRowMappings(Guid normRowId, InventoryListQuery query);

    InventoryCommandResult<InventoryPpeNormMappingDto> UpsertPpeNormRowMapping(Guid normRowId, UpsertInventoryPpeNormMappingDto request);

    InventoryListResponseDto<InventoryPpeNormSetDto> GetPpeNormSets(InventoryListQuery query);

    InventoryCommandResult<InventoryPpeNormImportResultDto> ImportPpeNormSetsDraft(Stream source, string fileName);

    InventoryCommandResult<InventoryPpeNormSetDto> PublishPpeNormSet(Guid normSetId, PublishInventoryPpeNormSetDto request);

    InventoryListResponseDto<InventoryHistoryDto> GetHistory(InventoryListQuery query);

    InventoryListResponseDto<InventoryReportDto> GetReports(InventoryListQuery query);

    InventoryCommandResult<InventoryExportJobDto> ExportReport(string reportId, string format);

    InventoryCommandResult<InventoryExportJobDto> GetExport(Guid exportId);

    InventoryListResponseDto<InventorySystemLogDto> GetSystemLog(InventoryListQuery query);

    InventoryListResponseDto<InventoryEmployeeDto> GetEmployees(InventoryListQuery query);

    InventoryCommandResult<InventoryEmployeeImportPreviewDto> PreviewEmployeesImport(Stream source, string fileName);

    InventoryCommandResult<InventoryEmployeeImportResultDto> ImportEmployees(Stream source, string fileName, string previewToken);

    InventoryCommandResult<InventoryEmployeeDto> ArchiveEmployee(Guid id);

    InventoryListResponseDto<InventoryUserDto> GetUsers(InventoryListQuery query);

    InventoryCommandResult<InventoryUserDto> DisableUser(Guid id);
}
