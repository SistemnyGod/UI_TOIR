using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using Patrol360.Api.Authorization;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Api.Controllers;

[ApiController]
[Route("api/v1/inventory")]
[RequirePermission("inventory.view")]
public sealed class InventoryController(
    IInventoryCatalogQuery inventoryCatalogQuery,
    IInventoryCatalogCommandService inventoryCatalogCommandService,
    IInventoryWorkflowService inventoryWorkflowService,
    IInventoryExportService inventoryExportService,
    IInventoryLegacyImportService inventoryLegacyImportService,
    IAuthSessionService authSessionService) : ControllerBase
{
    private const long EmployeeImportMaxFileSizeBytes = 10 * 1024 * 1024;
    private const string EmployeeImportPreviewTokenSecret = "patrol360.inventory.employee-import-preview.v1";
    private static readonly HashSet<string> EmployeeImportAllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".csv",
        ".txt",
        ".xlsx"
    };

    [HttpGet("overview")]
    public ActionResult<InventoryOverviewDto> Overview() =>
        Ok(inventoryCatalogQuery.GetOverview());

    [HttpGet("items")]
    public ActionResult<InventoryListResponseDto<InventoryItemDto>> Items(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        [FromQuery] string? query = null,
        [FromQuery] string? status = null,
        [FromQuery] Guid? categoryId = null,
        [FromQuery] Guid? unitId = null,
        [FromQuery] string? trackingType = null,
        [FromQuery] string? itemKind = null) =>
        Ok(inventoryCatalogQuery.GetItems(new InventoryListQuery(
            page,
            pageSize,
            query,
            status,
            CategoryId: categoryId,
            UnitId: unitId,
            TrackingType: trackingType,
            ItemKind: itemKind)));

    [HttpGet("items/facets")]
    public ActionResult<InventoryItemFacetsDto> ItemFacets() =>
        Ok(inventoryCatalogQuery.GetItemFacets());

    [HttpGet("stock")]
    [RequirePermission("inventory.stock.view")]
    public ActionResult<InventoryListResponseDto<InventoryStockBalanceDto>> Stock(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        [FromQuery] string? query = null,
        [FromQuery] Guid? itemId = null) =>
        Ok(inventoryCatalogQuery.GetStock(new InventoryListQuery(page, pageSize, query, ItemId: itemId)));

    [HttpGet("documents")]
    public ActionResult<InventoryListResponseDto<InventoryDocumentDto>> Documents(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        [FromQuery] string? query = null,
        [FromQuery] string? type = null) =>
        Ok(inventoryCatalogQuery.GetDocuments(new InventoryListQuery(page, pageSize, query, type)));

    [HttpGet("issues")]
    public ActionResult<InventoryListResponseDto<InventoryDocumentDto>> Issues(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        [FromQuery] string? query = null) =>
        Ok(inventoryCatalogQuery.GetDocuments(new InventoryListQuery(page, pageSize, query, "issue")));

    [HttpGet("issues/options")]
    public ActionResult<InventoryOperationsModuleOptionsDto> IssueOptions()
    {
        var employees = LoadAllPages(page => inventoryWorkflowService.GetEmployees(new InventoryListQuery(Page: page, PageSize: 100)));
        var items = LoadAllPages(page => inventoryCatalogQuery.GetItems(new InventoryListQuery(Page: page, PageSize: 100, Status: "active")));
        var settings = inventoryCatalogQuery.GetSettings();
        return Ok(new InventoryOperationsModuleOptionsDto(
            employees,
            items,
            settings,
            [],
            ["issue"]));
    }

    [HttpGet("operations/options")]
    public ActionResult<InventoryOperationsModuleOptionsDto> OperationsOptions()
    {
        var employees = LoadAllPages(page => inventoryWorkflowService.GetEmployees(new InventoryListQuery(Page: page, PageSize: 100)));
        var items = LoadAllPages(page => inventoryCatalogQuery.GetItems(new InventoryListQuery(Page: page, PageSize: 100, Status: "active")));
        var settings = inventoryCatalogQuery.GetSettings();
        var stock = LoadAllPages(page => inventoryCatalogQuery.GetStock(new InventoryListQuery(Page: page, PageSize: 100)));
        return Ok(new InventoryOperationsModuleOptionsDto(
            employees,
            items,
            settings,
            stock,
            ["receipt", "return", "write_off", "issue"]));
    }

    [HttpGet("custody/records")]
    public ActionResult<InventoryListResponseDto<InventoryCustodyRecordDto>> CustodyRecords(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        [FromQuery] string? query = null,
        [FromQuery] string? status = null) =>
        Ok(inventoryWorkflowService.GetCustodyRecords(new InventoryListQuery(page, pageSize, query, status)));


    [HttpGet("custody/options")]
    public ActionResult<InventoryCustodyModuleOptionsDto> CustodyOptions()
    {
        var employees = LoadAllPages(page => inventoryWorkflowService.GetEmployees(new InventoryListQuery(Page: page, PageSize: 100)));
        var items = LoadAllPages(page => inventoryCatalogQuery.GetItems(new InventoryListQuery(Page: page, PageSize: 100, Status: "active")));
        var settings = inventoryCatalogQuery.GetSettings();
        return Ok(new InventoryCustodyModuleOptionsDto(
            employees,
            items,
            settings.Warehouses,
            settings.CustodyCategories,
            ["open", "closed", "archived"],
            ["in_use", "returned", "written_off", "lost", "archived"]));
    }

    [HttpPost("custody/records")]
    [RequirePermission("inventory.custody.manage")]
    public ActionResult<InventoryCustodyRecordDto> CreateCustodyRecord(CreateInventoryCustodyRecordDto request) =>
        ToActionResult(inventoryWorkflowService.CreateCustodyRecord(request));

    [HttpPatch("custody/records/{id:guid}/status")]
    [RequirePermission("inventory.custody.manage")]
    public ActionResult<InventoryCustodyRecordDto> UpdateCustodyRecordStatus(Guid id, UpdateInventoryStatusDto request) =>
        ToActionResult(inventoryWorkflowService.UpdateCustodyRecordStatus(id, request));

    [HttpPatch("custody/records/{id:guid}/transfer")]
    [RequirePermission("inventory.custody.manage")]
    public ActionResult<InventoryCustodyRecordDto> TransferCustodyRecord(Guid id, TransferInventoryCustodyRecordDto request) =>
        ToActionResult(inventoryWorkflowService.TransferCustodyRecord(id, request));

    [HttpPatch("custody/records/{id:guid}/archive")]
    [RequirePermission("inventory.custody.manage")]
    public ActionResult<InventoryCustodyRecordDto> ArchiveCustodyRecord(Guid id) =>
        ToActionResult(inventoryWorkflowService.ArchiveCustodyRecord(id));

    [HttpGet("custody/documents")]
    public ActionResult<InventoryListResponseDto<InventoryCustodyDocumentDto>> CustodyDocuments(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        [FromQuery] string? query = null,
        [FromQuery] string? status = null) =>
        Ok(inventoryWorkflowService.GetCustodyDocuments(new InventoryListQuery(page, pageSize, query, status)));

    [HttpGet("custody/documents/{id:guid}")]
    public ActionResult<InventoryCustodyDocumentDetailDto> CustodyDocument(Guid id) =>
        ToActionResult(inventoryWorkflowService.GetCustodyDocument(id));

    [HttpGet("custody/records/{id:guid}/history")]
    [RequirePermission("inventory.audit.view")]
    public ActionResult<InventoryListResponseDto<InventoryHistoryDto>> CustodyRecordHistory(
        Guid id,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25) =>
        Ok(inventoryWorkflowService.GetCustodyRecordHistory(id, new InventoryListQuery(page, pageSize)));

    [HttpGet("custody/documents/{id:guid}/history")]
    [RequirePermission("inventory.audit.view")]
    public ActionResult<InventoryListResponseDto<InventoryHistoryDto>> CustodyDocumentHistory(
        Guid id,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25) =>
        Ok(inventoryWorkflowService.GetCustodyDocumentHistory(id, new InventoryListQuery(page, pageSize)));

    [HttpPatch("custody/documents/{id:guid}/close")]
    [RequirePermission("inventory.custody.manage")]
    public ActionResult<InventoryCustodyDocumentDto> CloseCustodyDocument(Guid id) =>
        ToActionResult(inventoryWorkflowService.CloseCustodyDocument(id));

    [HttpPatch("custody/documents/{id:guid}/open")]
    [RequirePermission("inventory.custody.manage")]
    public ActionResult<InventoryCustodyDocumentDto> OpenCustodyDocument(Guid id) =>
        ToActionResult(inventoryWorkflowService.OpenCustodyDocument(id));

    [HttpPatch("custody/documents/{id:guid}/archive")]
    [RequirePermission("inventory.custody.manage")]
    public ActionResult<InventoryCustodyDocumentDto> ArchiveCustodyDocument(Guid id) =>
        ToActionResult(inventoryWorkflowService.ArchiveCustodyDocument(id));

    [HttpGet("ppe/cards")]
    public ActionResult<InventoryPpeCardsResponseDto> PpeCards(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        [FromQuery] string? query = null,
        [FromQuery] string? status = null,
        [FromQuery] string? department = null,
        [FromQuery] string? position = null,
        [FromQuery] string? item = null,
        [FromQuery] string? cardNo = null,
        [FromQuery] string? priceState = null,
        [FromQuery] DateTimeOffset? dateFrom = null,
        [FromQuery] DateTimeOffset? dateTo = null,
        [FromQuery] string? sort = null,
        [FromQuery] string? direction = null,
        [FromQuery] Guid? employeeId = null,
        [FromQuery] bool includeLines = true) =>
        Ok(inventoryWorkflowService.GetPpeCards(new InventoryListQuery(
            page,
            pageSize,
            query,
            status,
            DateFrom: dateFrom,
            DateTo: dateTo,
            Department: department,
            Position: position,
            CardNo: cardNo,
            Item: item,
            Sort: sort,
            Direction: direction,
            PriceState: priceState,
            IncludeLines: includeLines,
            EmployeeId: employeeId)));

    [HttpGet("ppe/cards/{id:guid}")]
    public ActionResult<InventoryPpeCardDetailDto> PpeCard(Guid id) =>
        ToActionResult(inventoryWorkflowService.GetPpeCard(id));

    [HttpGet("ppe/employees/{employeeId:guid}/workspace")]
    public ActionResult<InventoryPpeWorkspaceDto> PpeWorkspace(Guid employeeId) =>
        ToActionResult(inventoryWorkflowService.GetPpeWorkspace(employeeId));

    [HttpGet("ppe/history")]
    [RequirePermission("inventory.audit.view")]
    public ActionResult<InventoryListResponseDto<InventoryPpeHistoryRowDto>> PpeHistory(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        [FromQuery] string? query = null,
        [FromQuery] Guid? employeeId = null,
        [FromQuery] Guid? itemId = null,
        [FromQuery] string? action = null,
        [FromQuery] string? status = null,
        [FromQuery] DateTimeOffset? dateFrom = null,
        [FromQuery] DateTimeOffset? dateTo = null) =>
        Ok(inventoryWorkflowService.GetPpeHistory(new InventoryListQuery(
            page, pageSize, query, status, ItemId: itemId, Action: action,
            DateFrom: dateFrom, DateTo: dateTo, EmployeeId: employeeId)));

    [HttpGet("ppe/options")]
    public ActionResult<InventoryPpeModuleOptionsDto> PpeOptions()
    {
        var employees = LoadAllPages(page => inventoryWorkflowService.GetEmployees(new InventoryListQuery(Page: page, PageSize: 100)));
        var allPpeItems = LoadPpeItems(query: null, categoryId: null);
        var categoryIds = allPpeItems
            .Where(item => item.CategoryId is not null)
            .Select(item => item.CategoryId!.Value)
            .ToHashSet();
        var settings = inventoryCatalogQuery.GetSettings();
        var ppeSettings = settings with
        {
            Categories = settings.Categories.Where(category => categoryIds.Contains(category.Id)).ToList(),
            PositionNorms = settings.PositionNorms
        };

        return Ok(new InventoryPpeModuleOptionsDto(
            employees,
            allPpeItems,
            ppeSettings,
            [
                "active",
                "archived",
                "closed",
                "issued",
                "issuing",
                "lost",
                "not_issued",
                "overdue",
                "partial",
                "reissued",
                "returned",
                "warning",
                "written_off"
            ]));
    }

    [HttpGet("ppe/items")]
    public ActionResult<InventoryListResponseDto<InventoryItemDto>> PpeItems(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] string? query = null,
        [FromQuery] Guid? categoryId = null)
    {
        var paging = NormalizeControllerPaging(page, pageSize);
        var rows = LoadPpeItems(query, categoryId);
        var pageRows = rows
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .ToList();

        return Ok(new InventoryListResponseDto<InventoryItemDto>(
            pageRows,
            rows.Count,
            paging.Page,
            paging.PageSize,
            Math.Max(1, (int)Math.Ceiling(rows.Count / (double)paging.PageSize))));
    }

    [HttpPost("ppe/cards")]
    [RequirePermission("inventory.ppe.manage")]
    public ActionResult<InventoryPpeCardDetailDto> CreatePpeCard(CreateInventoryPpeCardDto request) =>
        ToActionResult(inventoryWorkflowService.CreatePpeCard(request));

    [HttpPost("ppe/cards/drafts")]
    [RequirePermission("inventory.ppe.manage")]
    public ActionResult<InventoryPpeCardDetailDto> CreatePpeCardDraft(CreateInventoryPpeCardDraftDto request) =>
        ToActionResult(inventoryWorkflowService.CreatePpeCardDraft(request));

    [HttpPut("ppe/cards/{id:guid}/norm-rows")]
    [RequirePermission("inventory.ppe.manage")]
    public ActionResult<InventoryPpeCardDetailDto> UpdatePpeCardNormRows(Guid id, UpdateInventoryPpeCardNormRowsDto request) =>
        ToActionResult(inventoryWorkflowService.UpdatePpeCardNormRows(id, request));

    [HttpPost("ppe/cards/{id:guid}/issues")]
    [RequirePermission("inventory.ppe.manage")]
    public ActionResult<InventoryPpeCardLineDto> CreatePpeIssue(Guid id, CreateInventoryPpeIssueDto request) =>
        ToActionResult(inventoryWorkflowService.CreatePpeIssue(id, request));

    [HttpGet("ppe/norm-rows/{normRowId:guid}/mappings")]
    public ActionResult<InventoryListResponseDto<InventoryPpeNormMappingDto>> PpeNormRowMappings(
        Guid normRowId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25) =>
        Ok(inventoryWorkflowService.GetPpeNormRowMappings(normRowId, new InventoryListQuery(page, pageSize)));

    [HttpPut("ppe/norm-rows/{normRowId:guid}/mappings")]
    [RequirePermission("inventory.ppe.manage")]
    public ActionResult<InventoryPpeNormMappingDto> UpsertPpeNormRowMapping(Guid normRowId, UpsertInventoryPpeNormMappingDto request) =>
        ToActionResult(inventoryWorkflowService.UpsertPpeNormRowMapping(normRowId, request));

    [HttpGet("ppe/norm-sets")]
    public ActionResult<InventoryListResponseDto<InventoryPpeNormSetDto>> PpeNormSets(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        [FromQuery] string? query = null,
        [FromQuery] string? position = null,
        [FromQuery] string? status = null) =>
        Ok(inventoryWorkflowService.GetPpeNormSets(new InventoryListQuery(
            Page: page,
            PageSize: pageSize,
            Query: query,
            Status: status,
            Position: position)));

    [HttpPost("ppe/norm-sets/import-draft")]
    [RequirePermission("inventory.ppe.manage")]
    [RequestSizeLimit(EmployeeImportMaxFileSizeBytes)]
    public ActionResult<InventoryPpeNormImportResultDto> ImportPpeNormSetsDraft([FromForm] IFormFile? file)
    {
        if (file is null || file.Length == 0)
        {
            return EmployeeImportValidationProblem("file", "PPE norm workbook is required");
        }
        if (file.Length > EmployeeImportMaxFileSizeBytes)
        {
            return EmployeeImportValidationProblem("file", "PPE norm workbook must be 10 MB or smaller");
        }
        if (!string.Equals(Path.GetExtension(file.FileName), ".xlsx", StringComparison.OrdinalIgnoreCase))
        {
            return EmployeeImportValidationProblem("file", "PPE norm import supports .xlsx files only");
        }

        using var stream = file.OpenReadStream();
        return ToActionResult(inventoryWorkflowService.ImportPpeNormSetsDraft(stream, file.FileName));
    }

    [HttpPost("ppe/norm-sets/{normSetId:guid}/publish")]
    [RequirePermission("inventory.ppe.manage")]
    public ActionResult<InventoryPpeNormSetDto> PublishPpeNormSet(Guid normSetId, PublishInventoryPpeNormSetDto request) =>
        ToActionResult(inventoryWorkflowService.PublishPpeNormSet(normSetId, request));

    [HttpPut("ppe/cards/{id:guid}")]
    [RequirePermission("inventory.ppe.manage")]
    public ActionResult<InventoryPpeCardDetailDto> UpdatePpeCard(Guid id, CreateInventoryPpeCardDto request) =>
        ToActionResult(inventoryWorkflowService.UpdatePpeCard(id, request));

    [HttpPatch("ppe/cards/{id:guid}/archive")]
    [RequirePermission("inventory.ppe.manage")]
    public ActionResult<InventoryPpeCardDetailDto> ArchivePpeCard(Guid id) =>
        ToActionResult(inventoryWorkflowService.ArchivePpeCard(id));

    [HttpPost("ppe/cards/{id:guid}/lines")]
    [RequirePermission("inventory.ppe.manage")]
    public ActionResult<InventoryPpeCardLineDto> AddPpeCardLine(Guid id, UpsertInventoryPpeCardLineDto request) =>
        ToActionResult(inventoryWorkflowService.AddPpeCardLine(id, request));

    [HttpPut("ppe/cards/{id:guid}/lines/{lineId:guid}")]
    [RequirePermission("inventory.ppe.manage")]
    public ActionResult<InventoryPpeCardLineDto> UpdatePpeCardLine(Guid id, Guid lineId, UpsertInventoryPpeCardLineDto request) =>
        ToActionResult(inventoryWorkflowService.UpdatePpeCardLine(id, lineId, request));

    [HttpPatch("ppe/cards/{id:guid}/lines/{lineId:guid}/status")]
    [RequirePermission("inventory.ppe.manage")]
    public ActionResult<InventoryPpeCardLineDto> UpdatePpeCardLineStatus(Guid id, Guid lineId, UpdateInventoryStatusDto request) =>
        ToActionResult(inventoryWorkflowService.UpdatePpeCardLineStatus(id, lineId, request));

    [HttpPost("ppe/cards/{id:guid}/lines/{lineId:guid}/actions")]
    [RequirePermission("inventory.ppe.manage")]
    public ActionResult<InventoryPpeCardLineDto> ApplyPpeLineAction(Guid id, Guid lineId, ApplyInventoryPpeLineActionDto request) =>
        ToActionResult(inventoryWorkflowService.ApplyPpeLineAction(id, lineId, request));

    [HttpPatch("ppe/cards/{id:guid}/lines/{lineId:guid}/archive")]
    [RequirePermission("inventory.ppe.manage")]
    public ActionResult<InventoryPpeCardLineDto> ArchivePpeCardLine(Guid id, Guid lineId) =>
        ToActionResult(inventoryWorkflowService.ArchivePpeCardLine(id, lineId));

    [HttpGet("ppe/cards/{id:guid}/history")]
    [RequirePermission("inventory.audit.view")]
    public ActionResult<InventoryListResponseDto<InventoryHistoryDto>> PpeCardHistory(
        Guid id,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25) =>
        Ok(inventoryWorkflowService.GetPpeCardHistory(id, new InventoryListQuery(page, pageSize)));

    [HttpGet("ppe/cards/{id:guid}/lines/history")]
    [RequirePermission("inventory.audit.view")]
    public ActionResult<InventoryListResponseDto<InventoryHistoryDto>> PpeCardLinesHistory(
        Guid id,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25) =>
        Ok(inventoryWorkflowService.GetPpeCardLinesHistory(id, new InventoryListQuery(page, pageSize)));

    [HttpGet("ppe/cards/{id:guid}/lines/{lineId:guid}/history")]
    [RequirePermission("inventory.audit.view")]
    public ActionResult<InventoryListResponseDto<InventoryHistoryDto>> PpeCardLineHistory(
        Guid id,
        Guid lineId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25) =>
        Ok(inventoryWorkflowService.GetPpeCardLineHistory(id, lineId, new InventoryListQuery(page, pageSize)));

    [HttpGet("ppe/movements")]
    public ActionResult<InventoryListResponseDto<InventoryPpeMovementDto>> PpeMovements(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        [FromQuery] Guid? employeeId = null,
        [FromQuery] Guid? itemId = null,
        [FromQuery] string? status = null,
        [FromQuery] DateTimeOffset? dateFrom = null,
        [FromQuery] DateTimeOffset? dateTo = null) =>
        Ok(inventoryWorkflowService.GetPpeMovements(
            new InventoryListQuery(page, pageSize, Status: status, DateFrom: dateFrom, DateTo: dateTo),
            employeeId,
            itemId));

    [HttpGet("history")]
    [RequirePermission("inventory.audit.view")]
    public ActionResult<InventoryListResponseDto<InventoryHistoryDto>> History(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        [FromQuery] string? query = null,
        [FromQuery] string? entityType = null,
        [FromQuery] string? action = null,
        [FromQuery] string? actor = null,
        [FromQuery] DateTimeOffset? dateFrom = null,
        [FromQuery] DateTimeOffset? dateTo = null) =>
        Ok(inventoryWorkflowService.GetHistory(new InventoryListQuery(
            page,
            pageSize,
            query,
            EntityType: entityType,
            Action: action,
            Actor: actor,
            DateFrom: dateFrom,
            DateTo: dateTo)));

    [HttpGet("reports")]
    [RequirePermission("inventory.reports.view")]
    public ActionResult<InventoryListResponseDto<InventoryReportDto>> Reports(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        [FromQuery] string? query = null)
    {
        if (CurrentUserHasPermission("inventory.audit.view"))
        {
            return Ok(inventoryWorkflowService.GetReports(new InventoryListQuery(page, pageSize, query)));
        }

        var paging = NormalizeControllerPaging(page, pageSize);
        var filteredRows = inventoryWorkflowService
            .GetReports(new InventoryListQuery(1, 100, query))
            .Rows
            .Where(report => !IsSystemLogReport(report.Id))
            .ToList();
        var total = filteredRows.Count;
        var pageRows = filteredRows
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .ToList();

        return Ok(new InventoryListResponseDto<InventoryReportDto>(
            pageRows,
            total,
            paging.Page,
            paging.PageSize,
            total == 0 ? 0 : (int)Math.Ceiling(total / (double)paging.PageSize)));
    }

    [HttpPost("reports/{reportId}/export")]
    [RequirePermission("inventory.reports.export")]
    public ActionResult ExportReport(string reportId, [FromQuery] string format = "xlsx")
    {
        if (IsSystemLogReport(reportId) && !CurrentUserHasPermission("inventory.audit.view"))
        {
            return ForbidReport("inventory.audit.view");
        }

        return ToFileResult(inventoryExportService.ExportReport(reportId, format));
    }

    [HttpGet("exports/{exportId:guid}")]
    public ActionResult<InventoryExportJobDto> Export(Guid exportId) =>
        ToActionResult(inventoryWorkflowService.GetExport(exportId));

    [HttpGet("ppe/cards/{id:guid}/print")]
    [RequirePermission("inventory.reports.export")]
    public ActionResult PrintPpeCard(Guid id, [FromQuery] string type = "card", [FromQuery] string format = "pdf") =>
        ToFileResult(inventoryExportService.PrintPpeCard(id, type, format));

    [HttpGet("custody/documents/{id:guid}/print")]
    [RequirePermission("inventory.reports.export")]
    public ActionResult PrintCustodyDocument(Guid id, [FromQuery] string format = "pdf") =>
        ToFileResult(inventoryExportService.PrintCustodyDocument(id, format));

    [HttpGet("system-log")]
    [RequirePermission("inventory.audit.view")]
    public ActionResult<InventoryListResponseDto<InventorySystemLogDto>> SystemLog(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        [FromQuery] string? query = null,
        [FromQuery] string? entityType = null,
        [FromQuery] string? action = null,
        [FromQuery] string? actor = null,
        [FromQuery] DateTimeOffset? dateFrom = null,
        [FromQuery] DateTimeOffset? dateTo = null) =>
        Ok(inventoryWorkflowService.GetSystemLog(new InventoryListQuery(
            page,
            pageSize,
            query,
            EntityType: entityType,
            Action: action,
            Actor: actor,
            DateFrom: dateFrom,
            DateTo: dateTo)));

    [HttpGet("employees")]
    public ActionResult<InventoryListResponseDto<InventoryEmployeeDto>> Employees(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        [FromQuery] string? query = null,
        [FromQuery] string? status = null,
        [FromQuery] string? department = null,
        [FromQuery] string? employeeGroup = null) =>
        Ok(inventoryWorkflowService.GetEmployees(new InventoryListQuery(
            page,
            pageSize,
            query,
            Status: status,
            Department: department,
            EmployeeGroup: employeeGroup)));

    [HttpPost("employees/import/preview")]
    [RequirePermission("inventory.import")]
    public ActionResult<InventoryEmployeeImportPreviewDto> PreviewEmployeesImport([FromForm] IFormFile? file)
    {
        var validation = ValidateEmployeeImportFile(file);
        if (validation is not null)
        {
            return validation;
        }

        var previewToken = CreateEmployeeImportPreviewToken(file!);
        using var stream = file!.OpenReadStream();
        var result = inventoryWorkflowService.PreviewEmployeesImport(stream, file.FileName);
        return result.Succeeded && result.Value is not null
            ? Ok(result.Value with { PreviewToken = previewToken })
            : ToActionResult(result);
    }

    [HttpPost("employees/import")]
    [RequirePermission("inventory.import")]
    public ActionResult<InventoryEmployeeImportResultDto> ImportEmployees([FromForm] IFormFile? file, [FromForm] string? previewToken = null)
    {
        var validation = ValidateEmployeeImportFile(file);
        if (validation is not null)
        {
            return validation;
        }

        if (string.IsNullOrWhiteSpace(previewToken) || !ValidateEmployeeImportPreviewToken(file!, previewToken))
        {
            return EmployeeImportValidationProblem("previewToken", "Employee import must be confirmed from a fresh preview");
        }

        using var stream = file!.OpenReadStream();
        return ToActionResult(inventoryWorkflowService.ImportEmployees(stream, file.FileName, previewToken));
    }

    [HttpPatch("employees/{id:guid}/archive")]
    [RequirePermission("inventory.settings.manage")]
    public ActionResult<InventoryEmployeeDto> ArchiveEmployee(Guid id) =>
        ToActionResult(inventoryWorkflowService.ArchiveEmployee(id));

    [HttpGet("users")]
    [RequirePermission("inventory.users.manage")]
    public ActionResult<InventoryListResponseDto<InventoryUserDto>> Users(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        [FromQuery] string? query = null,
        [FromQuery] string? status = null,
        [FromQuery] string? role = null) =>
        Ok(inventoryWorkflowService.GetUsers(new InventoryListQuery(
            page,
            pageSize,
            query,
            Status: status,
            Role: role)));

    [HttpPost("users")]
    [RequirePermission("inventory.users.manage")]
    public ActionResult<object> CreateInventoryUser() =>
        Accepted(new { status = "use_site_users", message = "Inventory users are managed through the existing Patrol360 user administration." });

    [HttpPut("users/{id:guid}")]
    [RequirePermission("inventory.users.manage")]
    public ActionResult<object> UpdateInventoryUser(Guid id) =>
        Accepted(new { id, status = "use_site_users", message = "Inventory users are managed through the existing Patrol360 user administration." });

    [HttpPatch("users/{id:guid}/disable")]
    [RequirePermission("inventory.users.manage")]
    public ActionResult<InventoryUserDto> DisableInventoryUser(Guid id) =>
        ToActionResult(inventoryWorkflowService.DisableUser(id));

    [HttpGet("settings")]
    public ActionResult<InventorySettingsDto> Settings() => Ok(inventoryCatalogQuery.GetSettings());

    [HttpGet("db-health")]
    [RequirePermission("inventory.audit.view")]
    public ActionResult<InventoryDbHealthDto> DbHealth() => Ok(inventoryCatalogQuery.GetDbHealth());

    [HttpPost("custody/categories")]
    [RequirePermission("inventory.settings.manage")]
    public ActionResult<InventoryReferenceOptionDto> CreateCustodyCategory(CreateInventorySimpleReferenceDto request) =>
        ToActionResult(inventoryCatalogCommandService.CreateCustodyCategory(request));

    [HttpPut("custody/categories/{id:guid}")]
    [RequirePermission("inventory.settings.manage")]
    public ActionResult<InventoryReferenceOptionDto> UpdateCustodyCategory(Guid id, UpdateInventorySimpleReferenceDto request) =>
        ToActionResult(inventoryCatalogCommandService.UpdateCustodyCategory(id, request));

    [HttpPost("settings/return-reasons")]
    [RequirePermission("inventory.settings.manage")]
    public ActionResult<InventoryReferenceOptionDto> CreateReturnReason(CreateInventorySimpleReferenceDto request) =>
        ToActionResult(inventoryCatalogCommandService.CreateReturnReason(request));

    [HttpPut("settings/return-reasons/{id:guid}")]
    [RequirePermission("inventory.settings.manage")]
    public ActionResult<InventoryReferenceOptionDto> UpdateReturnReason(Guid id, UpdateInventorySimpleReferenceDto request) =>
        ToActionResult(inventoryCatalogCommandService.UpdateReturnReason(id, request));

    [HttpPost("settings/write-off-reasons")]
    [RequirePermission("inventory.settings.manage")]
    public ActionResult<InventoryReferenceOptionDto> CreateWriteOffReason(CreateInventorySimpleReferenceDto request) =>
        ToActionResult(inventoryCatalogCommandService.CreateWriteOffReason(request));

    [HttpPut("settings/write-off-reasons/{id:guid}")]
    [RequirePermission("inventory.settings.manage")]
    public ActionResult<InventoryReferenceOptionDto> UpdateWriteOffReason(Guid id, UpdateInventorySimpleReferenceDto request) =>
        ToActionResult(inventoryCatalogCommandService.UpdateWriteOffReason(id, request));

    [HttpPost("settings/employees/{kind}")]
    [RequirePermission("inventory.settings.manage")]
    public ActionResult<InventoryReferenceOptionDto> CreateEmployeeReference(string kind, CreateInventorySimpleReferenceDto request) =>
        ToActionResult(inventoryCatalogCommandService.CreateEmployeeReference(kind, request));

    [HttpPut("settings/employees/{kind}/{id:guid}")]
    [RequirePermission("inventory.settings.manage")]
    public ActionResult<InventoryReferenceOptionDto> UpdateEmployeeReference(string kind, Guid id, UpdateInventorySimpleReferenceDto request) =>
        ToActionResult(inventoryCatalogCommandService.UpdateEmployeeReference(kind, id, request));

    [HttpPost("settings/item-sets")]
    [RequirePermission("inventory.settings.manage")]
    public ActionResult<InventoryItemSetDto> CreateItemSet(CreateInventoryItemSetDto request) =>
        ToActionResult(inventoryCatalogCommandService.CreateItemSet(request));

    [HttpGet("settings/item-sets/{id:guid}")]
    public ActionResult<InventoryItemSetDetailDto> ItemSet(Guid id) =>
        ToActionResult(inventoryCatalogQuery.GetItemSet(id));

    [HttpGet("settings/item-sets/{id:guid}/items")]
    public ActionResult<IReadOnlyList<InventoryItemSetItemDto>> ItemSetItems(Guid id) =>
        ToActionResult(inventoryCatalogQuery.GetItemSetItems(id));

    [HttpPut("settings/item-sets/{id:guid}")]
    [RequirePermission("inventory.settings.manage")]
    public ActionResult<InventoryItemSetDto> UpdateItemSet(Guid id, UpdateInventoryItemSetDto request) =>
        ToActionResult(inventoryCatalogCommandService.UpdateItemSet(id, request));

    [HttpPut("settings/item-sets/{id:guid}/items")]
    [RequirePermission("inventory.settings.manage")]
    public ActionResult<InventoryItemSetDetailDto> UpdateItemSetItems(Guid id, UpsertInventoryItemSetItemsDto request) =>
        ToActionResult(inventoryCatalogCommandService.UpdateItemSetItems(id, request));

    [HttpPost("settings/position-norms")]
    [RequirePermission("inventory.settings.manage")]
    public ActionResult<InventoryPositionNormDto> UpsertPositionNorm(UpsertInventoryPositionNormDto request) =>
        ToActionResult(inventoryCatalogCommandService.UpsertPositionNorm(request));

    [HttpPost("categories")]
    [RequirePermission("inventory.items.manage")]
    public ActionResult<InventoryReferenceOptionDto> CreateCategory(CreateInventoryCategoryDto request) =>
        ToActionResult(inventoryCatalogCommandService.CreateCategory(request));

    [HttpPut("categories/{id:guid}")]
    [RequirePermission("inventory.items.manage")]
    public ActionResult<InventoryReferenceOptionDto> UpdateCategory(Guid id, UpdateInventoryCategoryDto request) =>
        ToActionResult(inventoryCatalogCommandService.UpdateCategory(id, request));

    [HttpPost("units")]
    [RequirePermission("inventory.items.manage")]
    public ActionResult<InventoryReferenceOptionDto> CreateUnit(CreateInventoryUnitDto request) =>
        ToActionResult(inventoryCatalogCommandService.CreateUnit(request));

    [HttpPut("units/{id:guid}")]
    [RequirePermission("inventory.items.manage")]
    public ActionResult<InventoryReferenceOptionDto> UpdateUnit(Guid id, UpdateInventoryUnitDto request) =>
        ToActionResult(inventoryCatalogCommandService.UpdateUnit(id, request));

    [HttpPost("warehouses")]
    [RequirePermission("inventory.items.manage")]
    public ActionResult<InventoryReferenceOptionDto> CreateWarehouse(CreateInventoryWarehouseDto request) =>
        ToActionResult(inventoryCatalogCommandService.CreateWarehouse(request));

    [HttpPut("warehouses/{id:guid}")]
    [RequirePermission("inventory.items.manage")]
    public ActionResult<InventoryReferenceOptionDto> UpdateWarehouse(Guid id, UpdateInventoryWarehouseDto request) =>
        ToActionResult(inventoryCatalogCommandService.UpdateWarehouse(id, request));

    [HttpPost("items")]
    [RequirePermission("inventory.items.manage")]
    public ActionResult<InventoryItemDto> CreateItem(UpsertInventoryItemDto request) =>
        ToActionResult(inventoryCatalogCommandService.CreateItem(request));

    [HttpPut("items/{id:guid}")]
    [RequirePermission("inventory.items.manage")]
    public ActionResult<InventoryItemDto> UpdateItem(Guid id, UpsertInventoryItemDto request) =>
        ToActionResult(inventoryCatalogCommandService.UpdateItem(id, request));

    [HttpPost("stock/initial")]
    [RequirePermission("inventory.items.manage")]
    public ActionResult<InventoryStockBalanceDto> SetInitialStock(InventoryInitialStockDto request) =>
        ToActionResult(inventoryCatalogCommandService.SetInitialStock(request));

    [HttpPost("documents")]
    [RequirePermission("inventory.issue.manage")]
    public ActionResult<InventoryDocumentDto> CreateOperation(CreateInventoryOperationDto request) =>
        ToActionResult(inventoryCatalogCommandService.CreateOperation(request));

    [HttpPost("legacy/import")]
    [RequirePermission("inventory.import")]
    public async Task<ActionResult<InventoryLegacyImportRunDto>> ImportLegacy(CancellationToken cancellationToken) =>
        ToActionResult(await inventoryLegacyImportService.ImportAsync(new InventoryLegacyImportRequestDto(false), cancellationToken));

    [HttpPost("legacy/import/dry-run")]
    [RequirePermission("inventory.import")]
    public async Task<ActionResult<InventoryLegacyImportRunDto>> DryRunLegacyImport(CancellationToken cancellationToken) =>
        ToActionResult(await inventoryLegacyImportService.ImportAsync(new InventoryLegacyImportRequestDto(true), cancellationToken));

    [HttpGet("legacy/import-runs/{id:guid}")]
    [RequirePermission("inventory.import")]
    public ActionResult<InventoryLegacyImportRunDto> LegacyImportRun(Guid id) =>
        ToActionResult(inventoryLegacyImportService.GetRun(id));

    [HttpGet("legacy/import-runs/{id:guid}/tables")]
    [RequirePermission("inventory.import")]
    public ActionResult<IReadOnlyList<InventoryLegacyImportTableDto>> LegacyImportRunTables(Guid id)
    {
        var result = inventoryLegacyImportService.GetRun(id);
        if (result.Succeeded && result.Value is not null)
        {
            return Ok(result.Value.Tables);
        }

        return ValidationProblem(new ValidationProblemDetails(result.Errors.ToDictionary(error => error.Key, error => error.Value))
        {
            Title = "Inventory command validation failed",
            Status = StatusCodes.Status400BadRequest
        });
    }

    private static (int Page, int PageSize) NormalizeControllerPaging(int page, int pageSize) =>
        (Math.Max(1, page), Math.Clamp(pageSize, 1, 100));

    private static bool IsSystemLogReport(string reportId) =>
        string.Equals(reportId?.Trim(), "system_log", StringComparison.OrdinalIgnoreCase);

    private ObjectResult ForbidReport(string permission) =>
        new(new ProblemDetails
        {
            Title = "Недостаточно прав",
            Detail = $"Для действия требуется право {permission}.",
            Status = StatusCodes.Status403Forbidden
        })
        {
            StatusCode = StatusCodes.Status403Forbidden
        };

    private bool CurrentUserHasPermission(string permission)
    {
        var token = ReadBearerToken();
        var user = token is null ? null : authSessionService.GetCurrentUser(token);
        return user?.Permissions.Contains(permission, StringComparer.OrdinalIgnoreCase) == true;
    }

    private string? ReadBearerToken()
    {
        if (!Request.Headers.TryGetValue(HeaderNames.Authorization, out var values))
        {
            return null;
        }

        const string bearerPrefix = "Bearer ";
        var value = values.ToString();
        return value.StartsWith(bearerPrefix, StringComparison.OrdinalIgnoreCase)
            ? value[bearerPrefix.Length..].Trim()
            : null;
    }

    private static IReadOnlyList<T> LoadAllPages<T>(Func<int, InventoryListResponseDto<T>> loader)
    {
        var page = 1;
        var rows = new List<T>();
        InventoryListResponseDto<T> result;
        do
        {
            result = loader(page);
            rows.AddRange(result.Rows);
            page++;
        }
        while (page <= result.PageCount);

        return rows;
    }

    private List<InventoryItemDto> LoadPpeItems(string? query, Guid? categoryId) =>
        LoadAllPages(page => inventoryCatalogQuery.GetItems(new InventoryListQuery(
                Page: page,
                PageSize: 100,
                Query: query,
                Status: "active",
                CategoryId: categoryId)))
            .Where(IsPpeItem)
            .OrderBy(item => item.Category)
            .ThenBy(item => item.Name)
            .ToList();

    private static bool IsPpeItem(InventoryItemDto item)
    {
        if (!item.IsActive)
        {
            return false;
        }

        var kind = item.ItemKind.Trim();
        if (kind.Contains("СИЗ", StringComparison.OrdinalIgnoreCase)
            || kind.Contains("спец", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }
        if (kind.Equals("ppe", StringComparison.OrdinalIgnoreCase)
            || kind.Equals("siz", StringComparison.OrdinalIgnoreCase)
            || kind.Contains("glove", StringComparison.OrdinalIgnoreCase)
            || kind.Contains("СИЗ", StringComparison.OrdinalIgnoreCase)
            || kind.Contains("спец", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        var category = item.Category.Trim();
        if (category.Contains("СИЗ", StringComparison.OrdinalIgnoreCase)
            || category.Contains("спецодеж", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return category.Contains("СИЗ", StringComparison.OrdinalIgnoreCase)
            || category.Contains("спецодеж", StringComparison.OrdinalIgnoreCase)
            || category.Contains("ppe", StringComparison.OrdinalIgnoreCase);
    }

    private static string CreateEmployeeImportPreviewToken(IFormFile file)
    {
        var fileHash = ComputeSha256Hex(file);
        var payload = $"employee-import-preview:v1:{fileHash}";
        var signature = Convert.ToHexString(HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(EmployeeImportPreviewTokenSecret),
            Encoding.UTF8.GetBytes(payload)));
        return $"{fileHash}.{signature}";
    }

    private static bool ValidateEmployeeImportPreviewToken(IFormFile file, string previewToken)
    {
        var expected = CreateEmployeeImportPreviewToken(file);
        var provided = previewToken.Trim();
        if (provided.Length != expected.Length)
        {
            return false;
        }

        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(expected),
            Encoding.UTF8.GetBytes(provided));
    }

    private static string ComputeSha256Hex(IFormFile file)
    {
        using var stream = file.OpenReadStream();
        return Convert.ToHexString(SHA256.HashData(stream));
    }

    private ActionResult? ValidateEmployeeImportFile(IFormFile? file)
    {
        if (file is null)
        {
            return EmployeeImportValidationProblem("file", "Import file is required");
        }

        if (file.Length == 0)
        {
            return EmployeeImportValidationProblem("file", "Import file is empty");
        }

        if (file.Length > EmployeeImportMaxFileSizeBytes)
        {
            return EmployeeImportValidationProblem("file", "Import file must be 10 MB or smaller");
        }

        var extension = Path.GetExtension(file.FileName);
        if (!EmployeeImportAllowedExtensions.Contains(extension))
        {
            return EmployeeImportValidationProblem("file", "Supported import formats are .xlsx, .csv and .txt");
        }

        return null;
    }

    private ActionResult EmployeeImportValidationProblem(string key, string message) =>
        ValidationProblem(new ValidationProblemDetails(new Dictionary<string, string[]>
        {
            [key] = [message]
        })
        {
            Title = "Inventory command validation failed",
            Status = StatusCodes.Status400BadRequest
        });

    private ActionResult ToFileResult(InventoryCommandResult<InventoryGeneratedFileDto> result)
    {
        if (result.Succeeded && result.Value is not null)
        {
            return File(result.Value.Content, result.Value.ContentType, result.Value.DownloadName);
        }

        return ValidationProblem(new ValidationProblemDetails(result.Errors.ToDictionary(error => error.Key, error => error.Value))
        {
            Title = "Inventory file generation failed",
            Status = StatusCodes.Status400BadRequest
        });
    }

    private ActionResult<T> ToActionResult<T>(InventoryCommandResult<T> result)
    {
        if (result.Succeeded && result.Value is not null)
        {
            return Ok(result.Value);
        }

        var statusCode = result.Errors.ContainsKey("conflict")
            ? StatusCodes.Status409Conflict
            : StatusCodes.Status400BadRequest;
        var details = new ValidationProblemDetails(result.Errors.ToDictionary(error => error.Key, error => error.Value))
        {
            Title = "Inventory command validation failed",
            Status = statusCode
        };
        return new ObjectResult(details) { StatusCode = statusCode };
    }
}
