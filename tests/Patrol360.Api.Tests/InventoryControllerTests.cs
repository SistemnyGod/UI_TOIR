using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Patrol360.Api.Controllers;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Api.Tests;

public sealed class InventoryControllerTests
{
    [Fact]
    public void PreviewEmployeesImportRejectsMissingFile()
    {
        var controller = CreateController();

        var result = controller.PreviewEmployeesImport(null);

        AssertValidationProblem(result.Result, "file");
    }

    [Fact]
    public void PreviewEmployeesImportRejectsEmptyFile()
    {
        var controller = CreateController();

        var result = controller.PreviewEmployeesImport(CreateFormFile("employees.csv", []));

        AssertValidationProblem(result.Result, "file");
    }

    [Fact]
    public void PreviewEmployeesImportRejectsUnsupportedExtension()
    {
        var controller = CreateController();

        var result = controller.PreviewEmployeesImport(CreateFormFile("employees.exe", [1, 2, 3]));

        AssertValidationProblem(result.Result, "file");
    }

    [Fact]
    public void ImportEmployeesRejectsFilesLargerThanTenMegabytes()
    {
        var controller = CreateController();
        var file = new FormFile(Stream.Null, 0, 10 * 1024 * 1024 + 1, "file", "employees.xlsx");

        var result = controller.ImportEmployees(file);

        AssertValidationProblem(result.Result, "file");
    }

    [Fact]
    public void ImportEmployeesRejectsMissingPreviewToken()
    {
        var controller = CreateController();

        var result = controller.ImportEmployees(CreateFormFile("employees.csv", [1, 2, 3]));

        AssertValidationProblem(result.Result, "previewToken");
    }

    private static InventoryController CreateController() =>
        new(
            new ThrowingInventoryCatalogQuery(),
            new ThrowingInventoryCatalogCommandService(),
            new ThrowingInventoryWorkflowService(),
            new ThrowingInventoryExportService(),
            new ThrowingInventoryLegacyImportService(),
            new ThrowingAuthSessionService());

    private static IFormFile CreateFormFile(string fileName, byte[] content) =>
        new FormFile(new MemoryStream(content), 0, content.Length, "file", fileName);

    private static void AssertValidationProblem(IActionResult? result, string expectedKey)
    {
        var objectResult = Assert.IsAssignableFrom<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, objectResult.StatusCode);
        var problem = Assert.IsType<ValidationProblemDetails>(objectResult.Value);
        Assert.Contains(expectedKey, problem.Errors.Keys);
    }

    private sealed class ThrowingInventoryCatalogQuery : IInventoryCatalogQuery
    {
        public InventoryOverviewDto GetOverview() => throw new NotImplementedException();
        public InventoryListResponseDto<InventoryItemDto> GetItems(InventoryListQuery query) => throw new NotImplementedException();
        public InventoryItemFacetsDto GetItemFacets() => throw new NotImplementedException();
        public InventoryListResponseDto<InventoryStockBalanceDto> GetStock(InventoryListQuery query) => throw new NotImplementedException();
        public InventoryListResponseDto<InventoryDocumentDto> GetDocuments(InventoryListQuery query) => throw new NotImplementedException();
        public InventorySettingsDto GetSettings() => throw new NotImplementedException();
        public InventoryCommandResult<InventoryItemSetDetailDto> GetItemSet(Guid id) => throw new NotImplementedException();
        public InventoryCommandResult<IReadOnlyList<InventoryItemSetItemDto>> GetItemSetItems(Guid id) => throw new NotImplementedException();
        public InventoryDbHealthDto GetDbHealth() => throw new NotImplementedException();
    }

    private sealed class ThrowingInventoryCatalogCommandService : IInventoryCatalogCommandService
    {
        public InventoryCommandResult<InventoryReferenceOptionDto> CreateCategory(CreateInventoryCategoryDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryReferenceOptionDto> UpdateCategory(Guid id, UpdateInventoryCategoryDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryReferenceOptionDto> CreateUnit(CreateInventoryUnitDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryReferenceOptionDto> UpdateUnit(Guid id, UpdateInventoryUnitDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryReferenceOptionDto> CreateWarehouse(CreateInventoryWarehouseDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryReferenceOptionDto> UpdateWarehouse(Guid id, UpdateInventoryWarehouseDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryReferenceOptionDto> CreateCustodyCategory(CreateInventorySimpleReferenceDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryReferenceOptionDto> UpdateCustodyCategory(Guid id, UpdateInventorySimpleReferenceDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryReferenceOptionDto> CreateReturnReason(CreateInventorySimpleReferenceDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryReferenceOptionDto> UpdateReturnReason(Guid id, UpdateInventorySimpleReferenceDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryReferenceOptionDto> CreateWriteOffReason(CreateInventorySimpleReferenceDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryReferenceOptionDto> UpdateWriteOffReason(Guid id, UpdateInventorySimpleReferenceDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryReferenceOptionDto> CreateEmployeeReference(string kind, CreateInventorySimpleReferenceDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryReferenceOptionDto> UpdateEmployeeReference(string kind, Guid id, UpdateInventorySimpleReferenceDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryItemSetDto> CreateItemSet(CreateInventoryItemSetDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryItemSetDto> UpdateItemSet(Guid id, UpdateInventoryItemSetDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryItemSetDetailDto> UpdateItemSetItems(Guid id, UpsertInventoryItemSetItemsDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryPositionNormDto> UpsertPositionNorm(UpsertInventoryPositionNormDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryItemDto> CreateItem(UpsertInventoryItemDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryItemDto> UpdateItem(Guid id, UpsertInventoryItemDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryStockBalanceDto> SetInitialStock(InventoryInitialStockDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryDocumentDto> CreateOperation(CreateInventoryOperationDto request) => throw new NotImplementedException();
    }

    private sealed class ThrowingInventoryWorkflowService : IInventoryWorkflowService
    {
        public InventoryListResponseDto<InventoryCustodyRecordDto> GetCustodyRecords(InventoryListQuery query) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryCustodyRecordDto> CreateCustodyRecord(CreateInventoryCustodyRecordDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryCustodyRecordDto> UpdateCustodyRecordStatus(Guid id, UpdateInventoryStatusDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryCustodyRecordDto> ArchiveCustodyRecord(Guid id) => throw new NotImplementedException();
        public InventoryListResponseDto<InventoryCustodyDocumentDto> GetCustodyDocuments(InventoryListQuery query) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryCustodyDocumentDetailDto> GetCustodyDocument(Guid id) => throw new NotImplementedException();
        public InventoryListResponseDto<InventoryHistoryDto> GetCustodyRecordHistory(Guid id, InventoryListQuery query) => throw new NotImplementedException();
        public InventoryListResponseDto<InventoryHistoryDto> GetCustodyDocumentHistory(Guid id, InventoryListQuery query) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryCustodyDocumentDto> CloseCustodyDocument(Guid id) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryCustodyDocumentDto> OpenCustodyDocument(Guid id) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryCustodyDocumentDto> ArchiveCustodyDocument(Guid id) => throw new NotImplementedException();
        public InventoryPpeCardsResponseDto GetPpeCards(InventoryListQuery query) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryPpeCardDetailDto> GetPpeCard(Guid id) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryPpeCardDetailDto> CreatePpeCard(CreateInventoryPpeCardDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryPpeCardDetailDto> UpdatePpeCard(Guid id, CreateInventoryPpeCardDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryPpeCardDetailDto> ArchivePpeCard(Guid id) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryPpeCardLineDto> AddPpeCardLine(Guid cardId, UpsertInventoryPpeCardLineDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryPpeCardLineDto> UpdatePpeCardLine(Guid cardId, Guid lineId, UpsertInventoryPpeCardLineDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryPpeCardLineDto> UpdatePpeCardLineStatus(Guid cardId, Guid lineId, UpdateInventoryStatusDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryPpeCardLineDto> ArchivePpeCardLine(Guid cardId, Guid lineId) => throw new NotImplementedException();
        public InventoryListResponseDto<InventoryHistoryDto> GetPpeCardHistory(Guid cardId, InventoryListQuery query) => throw new NotImplementedException();
        public InventoryListResponseDto<InventoryHistoryDto> GetPpeCardLinesHistory(Guid cardId, InventoryListQuery query) => throw new NotImplementedException();
        public InventoryListResponseDto<InventoryHistoryDto> GetPpeCardLineHistory(Guid cardId, Guid lineId, InventoryListQuery query) => throw new NotImplementedException();
        public InventoryListResponseDto<InventoryPpeMovementDto> GetPpeMovements(InventoryListQuery query, Guid? employeeId = null, Guid? itemId = null) => throw new NotImplementedException();
        public InventoryListResponseDto<InventoryHistoryDto> GetHistory(InventoryListQuery query) => throw new NotImplementedException();
        public InventoryListResponseDto<InventoryReportDto> GetReports(InventoryListQuery query) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryExportJobDto> ExportReport(string reportId, string format) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryExportJobDto> GetExport(Guid exportId) => throw new NotImplementedException();
        public InventoryListResponseDto<InventorySystemLogDto> GetSystemLog(InventoryListQuery query) => throw new NotImplementedException();
        public InventoryListResponseDto<InventoryEmployeeDto> GetEmployees(InventoryListQuery query) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryEmployeeImportPreviewDto> PreviewEmployeesImport(Stream source, string fileName) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryEmployeeImportResultDto> ImportEmployees(Stream source, string fileName, string previewToken) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryEmployeeDto> ArchiveEmployee(Guid id) => throw new NotImplementedException();
        public InventoryListResponseDto<InventoryUserDto> GetUsers(InventoryListQuery query) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryUserDto> DisableUser(Guid id) => throw new NotImplementedException();
    }

    private sealed class ThrowingInventoryExportService : IInventoryExportService
    {
        public InventoryCommandResult<InventoryGeneratedFileDto> ExportReport(string reportId, string format) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryGeneratedFileDto> PrintCustodyDocument(Guid documentId, string format) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryGeneratedFileDto> PrintPpeCard(Guid cardId, string type, string format) => throw new NotImplementedException();
    }

    private sealed class ThrowingInventoryLegacyImportService : IInventoryLegacyImportService
    {
        public Task<InventoryCommandResult<InventoryLegacyImportRunDto>> ImportAsync(InventoryLegacyImportRequestDto request, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryLegacyImportRunDto> GetRun(Guid id) => throw new NotImplementedException();
    }

    private sealed class ThrowingAuthSessionService : IAuthSessionService
    {
        public AuthLoginResult Login(LoginRequestDto request) => throw new NotImplementedException();
        public SessionUserDto? GetCurrentUser(string accessToken) => throw new NotImplementedException();
        public bool Logout(string accessToken) => throw new NotImplementedException();
    }
}
