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

    [Fact]
    public void PpeItemsReturnsOnlyPpeVisibleItems()
    {
        var ppeCategoryId = Guid.NewGuid();
        var catalog = new InventoryCatalogQueryFake([
            CreateItem("Каска защитная", "ppe", "СИЗ", ppeCategoryId),
            CreateItem("Перчатки утепленные", "", "PPE", ppeCategoryId),
            CreateItem("Куртка зимняя", "", "Спецодежда", ppeCategoryId),
            CreateItem("Дрель Makita", "", "Инструмент", Guid.NewGuid()),
            CreateItem("Архивная каска", "ppe", "СИЗ", ppeCategoryId, isActive: false),
        ]);
        var controller = CreateController(catalogQuery: catalog);

        var result = controller.PpeItems(page: 1, pageSize: 10);

        var response = AssertOk<InventoryListResponseDto<InventoryItemDto>>(result.Result);
        Assert.Equal(3, response.Total);
        Assert.All(response.Rows, row => Assert.True(row.IsActive));
        Assert.DoesNotContain(response.Rows, row => row.Name.Contains("Дрель", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(response.Rows, row => row.Name.Contains("Архивная", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(response.Rows, row => row.Name == "Каска защитная");
        Assert.Contains(response.Rows, row => row.Name == "Перчатки утепленные");
        Assert.Contains(response.Rows, row => row.Name == "Куртка зимняя");
    }

    [Fact]
    public void AddPpeCardLineAllowsNoWarehouseAndKeepsLinePrice()
    {
        var cardId = Guid.NewGuid();
        var itemId = Guid.NewGuid();
        var workflow = new InventoryWorkflowServiceFake();
        var controller = CreateController(workflowService: workflow);
        var request = new UpsertInventoryPpeCardLineDto(
            itemId,
            WarehouseId: null,
            Quantity: 2,
            UnitPriceMinor: 12_345,
            Status: "issued",
            DueAt: DateTimeOffset.Parse("2026-12-31T00:00:00Z"),
            Comment: "п. 1645");

        var result = controller.AddPpeCardLine(cardId, request);

        var line = AssertOk<InventoryPpeCardLineDto>(result.Result);
        Assert.Equal(cardId, workflow.LastCardId);
        Assert.Same(request, workflow.LastLineRequest);
        Assert.Null(line.WarehouseId);
        Assert.Equal(12_345, line.UnitPriceMinor);
        Assert.Equal(24_690, line.AmountMinor);
        Assert.Equal("issued", line.Status);
    }

    [Fact]
    public void PpeCardsForwardsServerSideAccountingFilters()
    {
        var employeeId = Guid.NewGuid();
        var workflow = new InventoryWorkflowServiceFake();
        var controller = CreateController(workflowService: workflow);

        var result = controller.PpeCards(
            page: 2,
            pageSize: 50,
            query: "авдеев",
            status: "issued",
            department: "Энерго",
            employeeId: employeeId,
            priceState: "missing",
            includeLines: false);

        var response = AssertOk<InventoryPpeCardsResponseDto>(result.Result);
        Assert.Empty(response.Rows);
        Assert.NotNull(workflow.LastPpeCardsQuery);
        Assert.Equal(2, workflow.LastPpeCardsQuery.Page);
        Assert.Equal(50, workflow.LastPpeCardsQuery.PageSize);
        Assert.Equal("авдеев", workflow.LastPpeCardsQuery.Query);
        Assert.Equal("issued", workflow.LastPpeCardsQuery.Status);
        Assert.Equal("Энерго", workflow.LastPpeCardsQuery.Department);
        Assert.Equal(employeeId, workflow.LastPpeCardsQuery.EmployeeId);
        Assert.Equal("missing", workflow.LastPpeCardsQuery.PriceState);
        Assert.False(workflow.LastPpeCardsQuery.IncludeLines);
    }

    [Fact]
    public void TransferCustodyRecordForwardsRequestToWorkflow()
    {
        var recordId = Guid.NewGuid();
        var employeeId = Guid.NewGuid();
        var workflow = new InventoryWorkflowServiceFake();
        var controller = CreateController(workflowService: workflow);
        var request = new TransferInventoryCustodyRecordDto(
            Guid.Empty,
            DateTimeOffset.Parse("2026-06-29T09:30:00Z"),
            "Передача сменщику",
            ToEmployeeId: employeeId);

        var result = controller.TransferCustodyRecord(recordId, request);

        var record = AssertOk<InventoryCustodyRecordDto>(result.Result);
        Assert.Equal(recordId, workflow.LastTransferRecordId);
        Assert.Same(request, workflow.LastTransferRequest);
        Assert.NotNull(workflow.LastTransferRequest);
        Assert.Equal(employeeId, workflow.LastTransferRequest.ToEmployeeId);
        Assert.Equal("Иванов Иван Иванович", record.EmployeeName);
        Assert.Equal("in_use", record.Status);
    }

    private static InventoryController CreateController(
        IInventoryCatalogQuery? catalogQuery = null,
        IInventoryWorkflowService? workflowService = null) =>
        new(
            catalogQuery ?? new ThrowingInventoryCatalogQuery(),
            new ThrowingInventoryCatalogCommandService(),
            workflowService ?? new ThrowingInventoryWorkflowService(),
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

    private static T AssertOk<T>(IActionResult? result)
    {
        var ok = Assert.IsType<OkObjectResult>(result);
        return Assert.IsType<T>(ok.Value);
    }

    private static InventoryItemDto CreateItem(
        string name,
        string itemKind,
        string category,
        Guid categoryId,
        bool isActive = true) =>
        new(
            Guid.NewGuid(),
            name,
            Sku: "",
            CategoryId: categoryId,
            Category: category,
            UnitId: null,
            Unit: "шт.",
            Balance: 0,
            StockPhysical: 0,
            StockReserved: 0,
            StockAvailable: 0,
            StockStatus: "normal",
            MinStockQty: null,
            ItemKind: itemKind,
            NormItemName: name,
            ActualItemName: name,
            BrandName: "",
            ModelName: "",
            Article: "",
            ProtectionClass: "",
            ClothingSize: "",
            HeightSize: "",
            ShoeSize: "",
            HeadSize: "",
            GloveSize: "",
            RespiratorSize: "",
            DefaultLifeMonths: 12,
            DefaultUnitPriceMinor: 0,
            TrackingType: itemKind.Equals("ppe", StringComparison.OrdinalIgnoreCase) ? "ppe" : "",
            Comment: "",
            IsConsumable: false,
            TrackLife: itemKind.Equals("ppe", StringComparison.OrdinalIgnoreCase),
            IsActive: isActive,
            Status: isActive ? "active" : "archived");

    private sealed class InventoryCatalogQueryFake(IReadOnlyList<InventoryItemDto> items) : IInventoryCatalogQuery
    {
        public InventoryOverviewDto GetOverview() => throw new NotImplementedException();
        public InventoryListResponseDto<InventoryItemDto> GetItems(InventoryListQuery query)
        {
            var rows = items
                .Where(item => query.Status is null || item.Status.Equals(query.Status, StringComparison.OrdinalIgnoreCase))
                .Where(item => query.CategoryId is null || item.CategoryId == query.CategoryId)
                .Where(item =>
                    string.IsNullOrWhiteSpace(query.Query)
                    || item.Name.Contains(query.Query, StringComparison.OrdinalIgnoreCase)
                    || item.Category.Contains(query.Query, StringComparison.OrdinalIgnoreCase))
                .ToList();
            var pageRows = rows
                .Skip((query.Page - 1) * query.PageSize)
                .Take(query.PageSize)
                .ToList();

            return new InventoryListResponseDto<InventoryItemDto>(
                pageRows,
                rows.Count,
                query.Page,
                query.PageSize,
                Math.Max(1, (int)Math.Ceiling(rows.Count / (double)query.PageSize)));
        }
        public InventoryItemFacetsDto GetItemFacets() => throw new NotImplementedException();
        public InventoryListResponseDto<InventoryStockBalanceDto> GetStock(InventoryListQuery query) => throw new NotImplementedException();
        public InventoryListResponseDto<InventoryDocumentDto> GetDocuments(InventoryListQuery query) => throw new NotImplementedException();
        public InventorySettingsDto GetSettings() => throw new NotImplementedException();
        public InventoryCommandResult<InventoryItemSetDetailDto> GetItemSet(Guid id) => throw new NotImplementedException();
        public InventoryCommandResult<IReadOnlyList<InventoryItemSetItemDto>> GetItemSetItems(Guid id) => throw new NotImplementedException();
        public InventoryDbHealthDto GetDbHealth() => throw new NotImplementedException();
    }

    private sealed class InventoryWorkflowServiceFake : ThrowingInventoryWorkflowService
    {
        public Guid? LastCardId { get; private set; }
        public UpsertInventoryPpeCardLineDto? LastLineRequest { get; private set; }
        public InventoryListQuery? LastPpeCardsQuery { get; private set; }
        public Guid? LastTransferRecordId { get; private set; }
        public TransferInventoryCustodyRecordDto? LastTransferRequest { get; private set; }

        public override InventoryPpeCardsResponseDto GetPpeCards(InventoryListQuery query)
        {
            LastPpeCardsQuery = query;
            var emptySummary = new InventoryPpeSummaryDto(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
            return new InventoryPpeCardsResponseDto([], 0, query.Page, query.PageSize, 0, emptySummary, emptySummary);
        }

        public override InventoryCommandResult<InventoryPpeCardLineDto> AddPpeCardLine(Guid cardId, UpsertInventoryPpeCardLineDto request)
        {
            LastCardId = cardId;
            LastLineRequest = request;

            return new InventoryCommandResult<InventoryPpeCardLineDto>(
                new InventoryPpeCardLineDto(
                    Guid.NewGuid(),
                    request.ItemId,
                    "Каска защитная",
                    request.WarehouseId,
                    "",
                    request.Quantity,
                    "шт.",
                    request.UnitPriceMinor,
                    request.Quantity * (request.UnitPriceMinor ?? 0),
                    request.Status ?? "not_issued",
                    request.Status == "issued" ? DateTime.UtcNow : null,
                    request.DueAt?.UtcDateTime,
                    "",
                    request.BrandModelArticle ?? "",
                    request.NormPoint ?? "",
                    request.PrintItemName ?? "",
                    request.IssuePeriodText ?? ""),
                new Dictionary<string, string[]>());
        }

        public override InventoryCommandResult<InventoryCustodyRecordDto> TransferCustodyRecord(
            Guid id,
            TransferInventoryCustodyRecordDto request)
        {
            LastTransferRecordId = id;
            LastTransferRequest = request;

            return new InventoryCommandResult<InventoryCustodyRecordDto>(
                new InventoryCustodyRecordDto(
                    id,
                    Guid.NewGuid(),
                    "Иванов Иван Иванович",
                    "Рация",
                    "",
                    1,
                    "in_use",
                    DateTime.UtcNow,
                    null,
                    Guid.NewGuid(),
                    Guid.Empty,
                    "шт.",
                    request.Comment ?? ""),
                new Dictionary<string, string[]>());
        }
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

    private class ThrowingInventoryWorkflowService : IInventoryWorkflowService
    {
        public InventoryListResponseDto<InventoryCustodyRecordDto> GetCustodyRecords(InventoryListQuery query) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryCustodyRecordDto> CreateCustodyRecord(CreateInventoryCustodyRecordDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryCustodyRecordDto> UpdateCustodyRecordStatus(Guid id, UpdateInventoryStatusDto request) => throw new NotImplementedException();
        public virtual InventoryCommandResult<InventoryCustodyRecordDto> TransferCustodyRecord(Guid id, TransferInventoryCustodyRecordDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryCustodyRecordDto> ArchiveCustodyRecord(Guid id) => throw new NotImplementedException();
        public InventoryListResponseDto<InventoryCustodyDocumentDto> GetCustodyDocuments(InventoryListQuery query) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryCustodyDocumentDetailDto> GetCustodyDocument(Guid id) => throw new NotImplementedException();
        public InventoryListResponseDto<InventoryHistoryDto> GetCustodyRecordHistory(Guid id, InventoryListQuery query) => throw new NotImplementedException();
        public InventoryListResponseDto<InventoryHistoryDto> GetCustodyDocumentHistory(Guid id, InventoryListQuery query) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryCustodyDocumentDto> CloseCustodyDocument(Guid id) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryCustodyDocumentDto> OpenCustodyDocument(Guid id) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryCustodyDocumentDto> ArchiveCustodyDocument(Guid id) => throw new NotImplementedException();
        public virtual InventoryPpeCardsResponseDto GetPpeCards(InventoryListQuery query) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryPpeCardDetailDto> GetPpeCard(Guid id) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryPpeCardDetailDto> CreatePpeCard(CreateInventoryPpeCardDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryPpeCardDetailDto> UpdatePpeCard(Guid id, CreateInventoryPpeCardDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryPpeCardDetailDto> ArchivePpeCard(Guid id) => throw new NotImplementedException();
        public virtual InventoryCommandResult<InventoryPpeCardLineDto> AddPpeCardLine(Guid cardId, UpsertInventoryPpeCardLineDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryPpeCardLineDto> UpdatePpeCardLine(Guid cardId, Guid lineId, UpsertInventoryPpeCardLineDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryPpeCardLineDto> UpdatePpeCardLineStatus(Guid cardId, Guid lineId, UpdateInventoryStatusDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryPpeCardLineDto> ArchivePpeCardLine(Guid cardId, Guid lineId) => throw new NotImplementedException();
        public InventoryListResponseDto<InventoryHistoryDto> GetPpeCardHistory(Guid cardId, InventoryListQuery query) => throw new NotImplementedException();
        public InventoryListResponseDto<InventoryHistoryDto> GetPpeCardLinesHistory(Guid cardId, InventoryListQuery query) => throw new NotImplementedException();
        public InventoryListResponseDto<InventoryHistoryDto> GetPpeCardLineHistory(Guid cardId, Guid lineId, InventoryListQuery query) => throw new NotImplementedException();
        public InventoryListResponseDto<InventoryPpeMovementDto> GetPpeMovements(InventoryListQuery query, Guid? employeeId = null, Guid? itemId = null) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryPpeWorkspaceDto> GetPpeWorkspace(Guid employeeId) => throw new NotImplementedException();
        public InventoryListResponseDto<InventoryPpeHistoryRowDto> GetPpeHistory(InventoryListQuery query) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryPpeCardDetailDto> CreatePpeCardDraft(CreateInventoryPpeCardDraftDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryPpeCardDetailDto> UpdatePpeCardNormRows(Guid cardId, UpdateInventoryPpeCardNormRowsDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryPpeCardLineDto> CreatePpeIssue(Guid cardId, CreateInventoryPpeIssueDto request) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryPpeCardLineDto> ApplyPpeLineAction(Guid cardId, Guid lineId, ApplyInventoryPpeLineActionDto request) => throw new NotImplementedException();
        public InventoryListResponseDto<InventoryPpeNormMappingDto> GetPpeNormRowMappings(Guid normRowId, InventoryListQuery query) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryPpeNormMappingDto> UpsertPpeNormRowMapping(Guid normRowId, UpsertInventoryPpeNormMappingDto request) => throw new NotImplementedException();
        public InventoryListResponseDto<InventoryPpeNormSetDto> GetPpeNormSets(InventoryListQuery query) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryPpeNormImportResultDto> ImportPpeNormSetsDraft(Stream source, string fileName) => throw new NotImplementedException();
        public InventoryCommandResult<InventoryPpeNormSetDto> PublishPpeNormSet(Guid normSetId, PublishInventoryPpeNormSetDto request) => throw new NotImplementedException();
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
