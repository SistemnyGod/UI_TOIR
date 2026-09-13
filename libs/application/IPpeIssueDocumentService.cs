using Patrol360.Contracts;

namespace Patrol360.Application;

public interface IPpeIssueDocumentService
{
    IReadOnlyList<PpeIssueDocumentSummaryDto> GetIssueDocuments(Guid? employeeId);
    InventoryCommandResult<PpeIssueDocumentDto> GetIssueDocument(Guid id);
    IReadOnlyList<InventoryPpeNormSetDto> GetApplicablePpeNorms(Guid employeeId, DateOnly date);
    InventoryCommandResult<PpeIssueDocumentDto> SaveIssueDocument(Guid? id, SavePpeIssueDocumentDto request, string actor);
    InventoryCommandResult<PpeIssueDocumentDto> ValidateIssueDocument(Guid id);
    InventoryCommandResult<PpeIssueDocumentDto> ConfirmIssueDocument(Guid id, ConfirmPpeIssueDocumentDto request, string actor);
    InventoryCommandResult<PpeIssueDocumentDto> CancelIssueDocument(Guid id, CancelPpeIssueDocumentDto request, string actor);
    InventoryCommandResult<InventoryPpeNormSetDto> ApprovePpeNormScope(Guid id, PpeNormApprovalDto request, string actor);
    InventoryCommandResult<InventoryPpeNormSetDto> SetPpeNormRowRules(Guid rowId, PpeNormRowRulesDto request, string actor);
    InventoryCommandResult<InventoryPpeNormMappingDto> ApprovePpeMapping(Guid rowId, PpeMappingApprovalDto request, string actor);
    InventoryCommandResult<PpeLegacyDraftMigrationDto> MigratePpeLegacyDraft(Guid cardId, string actor);
}

public interface IPpeIssueDocumentPrintService
{
    Task<InventoryCommandResult<InventoryGeneratedFileDto>> PrintAsync(Guid id, string type, string format, CancellationToken cancellationToken);
}
