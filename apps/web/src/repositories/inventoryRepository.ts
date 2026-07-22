import { ApiClient } from "../api/client";
import type {
  ApplyInventoryPpeLineActionDto,
  CreateEmployeeDto,
  CreateInventoryCategoryDto,
  CreateInventoryCustodyRecordDto,
  InventoryCustodyModuleOptionsDto,
  CreateInventoryItemSetDto,
  CreateInventoryOperationDto,
  CreateInventoryPpeCardDto,
  CreateInventoryPpeCardDraftDto,
  CreateInventoryPpeIssueDto,
  CreateInventorySimpleReferenceDto,
  CreateInventoryUnitDto,
  CreateInventoryWarehouseDto,
  InventoryCustodyDocumentDetailDto,
  InventoryCustodyDocumentDto,
  InventoryDbHealthDto,
  InventoryInitialStockDto,
  InventoryCustodyRecordDto,
  InventoryDocumentDto,
  EmployeeDto,
  InventoryEmployeeDto,
  InventoryEmployeeImportPreviewDto,
  InventoryEmployeeImportResultDto,
  InventoryExportJobDto,
  InventoryItemFacetsDto,
  InventoryHistoryDto,
  InventoryItemSetDetailDto,
  InventoryItemSetDto,
  InventoryItemSetItemDto,
  InventoryItemDto,
  InventoryLegacyImportRunDto,
  InventoryListResponseDto,
  InventoryOverviewDto,
  InventoryOperationsModuleOptionsDto,
  InventoryPpeCardDetailDto,
  InventoryPpeCardLineDto,
  InventoryPpeMovementDto,
  InventoryPpeHistoryRowDto,
  InventoryPpeNormImportResultDto,
  InventoryPpeNormMappingDto,
  InventoryPpeNormSetDto,
  InventoryPpeWorkspaceDto,
  InventoryPpeModuleOptionsDto,
  InventoryPpeCardsResponseDto,
  InventoryPpeCardDto,
  InventoryReportDto,
  InventoryReferenceOptionDto,
  InventorySettingsDto,
  InventoryStockBalanceDto,
  InventorySystemLogDto,
  InventoryUserDto,
  UpdateInventoryCategoryDto,
  UpdateEmployeeDto,
  UpdateInventorySimpleReferenceDto,
  UpdateInventoryItemSetDto,
  UpdateInventoryStatusDto,
  TransferInventoryCustodyRecordDto,
  UpdateInventoryUnitDto,
  UpdateInventoryWarehouseDto,
  UpsertInventoryItemSetItemsDto,
  UpsertInventoryPpeCardLineDto,
  UpdateInventoryPpeCardNormRowsDto,
  PublishInventoryPpeNormSetDto,
  UpsertInventoryPpeNormMappingDto,
  UpsertInventoryPositionNormDto,
  UpsertInventoryItemDto,
} from "../api/contracts";

export type InventoryListParams = {
  action?: string;
  actor?: string;
  categoryId?: string;
  dateFrom?: string;
  dateTo?: string;
  department?: string;
  employeeId?: string;
  employeeGroup?: string;
  entityType?: string;
  format?: string;
  itemId?: string;
  itemKind?: string;
  includeLines?: boolean;
  cardNo?: string;
  direction?: string;
  item?: string;
  position?: string;
  priceState?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
  query?: string;
  role?: string;
  status?: string;
  trackingType?: string;
  type?: string;
  unitId?: string;
};

export type InventoryRepository = ReturnType<typeof createInventoryRepository>;

export function createInventoryRepository({ baseUrl }: { baseUrl?: string } = {}) {
  const client = new ApiClient({ baseUrl });

  return {
    getOverview() {
      return client.get<InventoryOverviewDto>("/api/v1/inventory/overview");
    },

    getItems(params: InventoryListParams = {}) {
      return client.get<InventoryListResponseDto<InventoryItemDto>>(
        `/api/v1/inventory/items${toQueryString(params)}`,
      );
    },

    getItemFacets() {
      return client.get<InventoryItemFacetsDto>("/api/v1/inventory/items/facets");
    },

    getStock(params: InventoryListParams = {}) {
      return client.get<InventoryListResponseDto<InventoryStockBalanceDto>>(
        `/api/v1/inventory/stock${toQueryString(params)}`,
      );
    },

    getDocuments(params: InventoryListParams = {}) {
      return client.get<InventoryListResponseDto<InventoryDocumentDto>>(
        `/api/v1/inventory/documents${toQueryString(params)}`,
      );
    },

    getIssues(params: InventoryListParams = {}) {
      return client.get<InventoryListResponseDto<InventoryDocumentDto>>(
        `/api/v1/inventory/issues${toQueryString(params)}`,
      );
    },

    getIssueOptions() {
      return client.get<InventoryOperationsModuleOptionsDto>("/api/v1/inventory/issues/options");
    },

    getOperationsOptions() {
      return client.get<InventoryOperationsModuleOptionsDto>("/api/v1/inventory/operations/options");
    },

    getCustodyRecords(params: InventoryListParams = {}) {
      return client.get<InventoryListResponseDto<InventoryCustodyRecordDto>>(
        `/api/v1/inventory/custody/records${toQueryString(params)}`,
      );
    },

    getCustodyOptions() {
      return client.get<InventoryCustodyModuleOptionsDto>("/api/v1/inventory/custody/options");
    },

    createCustodyRecord(payload: CreateInventoryCustodyRecordDto) {
      return client.post<InventoryCustodyRecordDto, CreateInventoryCustodyRecordDto>(
        "/api/v1/inventory/custody/records",
        payload,
      );
    },

    updateCustodyRecordStatus(id: string, payload: UpdateInventoryStatusDto) {
      return client.patch<InventoryCustodyRecordDto, UpdateInventoryStatusDto>(
        `/api/v1/inventory/custody/records/${id}/status`,
        payload,
      );
    },

    transferCustodyRecord(id: string, payload: TransferInventoryCustodyRecordDto) {
      return client.patch<InventoryCustodyRecordDto, TransferInventoryCustodyRecordDto>(
        `/api/v1/inventory/custody/records/${id}/transfer`,
        payload,
      );
    },

    archiveCustodyRecord(id: string) {
      return client.patch<InventoryCustodyRecordDto, undefined>(
        `/api/v1/inventory/custody/records/${id}/archive`,
        undefined,
      );
    },

    getCustodyDocuments(params: InventoryListParams = {}) {
      return client.get<InventoryListResponseDto<InventoryCustodyDocumentDto>>(
        `/api/v1/inventory/custody/documents${toQueryString(params)}`,
      );
    },

    getCustodyDocument(id: string) {
      return client.get<InventoryCustodyDocumentDetailDto>(`/api/v1/inventory/custody/documents/${id}`);
    },

    closeCustodyDocument(id: string) {
      return client.patch<InventoryCustodyDocumentDto, undefined>(
        `/api/v1/inventory/custody/documents/${id}/close`,
        undefined,
      );
    },

    openCustodyDocument(id: string) {
      return client.patch<InventoryCustodyDocumentDto, undefined>(
        `/api/v1/inventory/custody/documents/${id}/open`,
        undefined,
      );
    },

    archiveCustodyDocument(id: string) {
      return client.patch<InventoryCustodyDocumentDto, undefined>(
        `/api/v1/inventory/custody/documents/${id}/archive`,
        undefined,
      );
    },

    getCustodyRecordHistory(id: string, params: InventoryListParams = {}) {
      return client.get<InventoryListResponseDto<InventoryHistoryDto>>(
        `/api/v1/inventory/custody/records/${id}/history${toQueryString(params)}`,
      );
    },

    getCustodyDocumentHistory(id: string, params: InventoryListParams = {}) {
      return client.get<InventoryListResponseDto<InventoryHistoryDto>>(
        `/api/v1/inventory/custody/documents/${id}/history${toQueryString(params)}`,
      );
    },

    getPpeCards(params: InventoryListParams = {}) {
      return client.get<InventoryPpeCardsResponseDto>(
        `/api/v1/inventory/ppe/cards${toQueryString(params)}`,
      );
    },

    getPpeWorkspace(employeeId: string) {
      return client.get<InventoryPpeWorkspaceDto>(`/api/v1/inventory/ppe/employees/${employeeId}/workspace`);
    },

    getPpeHistory(params: InventoryListParams = {}) {
      return client.get<InventoryListResponseDto<InventoryPpeHistoryRowDto>>(
        `/api/v1/inventory/ppe/history${toQueryString(params)}`,
      );
    },

    createPpeCardDraft(payload: CreateInventoryPpeCardDraftDto) {
      return client.post<InventoryPpeCardDetailDto, CreateInventoryPpeCardDraftDto>(
        "/api/v1/inventory/ppe/cards/drafts",
        payload,
      );
    },

    updatePpeCardNormRows(cardId: string, payload: UpdateInventoryPpeCardNormRowsDto) {
      return client.put<InventoryPpeCardDetailDto, UpdateInventoryPpeCardNormRowsDto>(
        `/api/v1/inventory/ppe/cards/${cardId}/norm-rows`,
        payload,
      );
    },

    createPpeIssue(cardId: string, payload: CreateInventoryPpeIssueDto) {
      return client.post<InventoryPpeCardLineDto, CreateInventoryPpeIssueDto>(
        `/api/v1/inventory/ppe/cards/${cardId}/issues`,
        payload,
      );
    },

    applyPpeLineAction(cardId: string, lineId: string, payload: ApplyInventoryPpeLineActionDto) {
      return client.post<InventoryPpeCardLineDto, ApplyInventoryPpeLineActionDto>(
        `/api/v1/inventory/ppe/cards/${cardId}/lines/${lineId}/actions`,
        payload,
      );
    },

    getPpeNormRowMappings(normRowId: string) {
      return client.get<InventoryListResponseDto<InventoryPpeNormMappingDto>>(`/api/v1/inventory/ppe/norm-rows/${normRowId}/mappings`);
    },

    upsertPpeNormRowMapping(normRowId: string, payload: UpsertInventoryPpeNormMappingDto) {
      return client.put<InventoryPpeNormMappingDto, UpsertInventoryPpeNormMappingDto>(
        `/api/v1/inventory/ppe/norm-rows/${normRowId}/mappings`,
        payload,
      );
    },

    getPpeNormSets(params: InventoryListParams = {}) {
      return client.get<InventoryListResponseDto<InventoryPpeNormSetDto>>(
        `/api/v1/inventory/ppe/norm-sets${toQueryString(params)}`,
      );
    },

    importPpeNormSetsDraft(file: File) {
      const formData = new FormData();
      formData.append("file", file);
      return client.postForm<InventoryPpeNormImportResultDto>(
        "/api/v1/inventory/ppe/norm-sets/import-draft",
        formData,
      );
    },

    publishPpeNormSet(normSetId: string, payload: PublishInventoryPpeNormSetDto) {
      return client.post<InventoryPpeNormSetDto, PublishInventoryPpeNormSetDto>(
        `/api/v1/inventory/ppe/norm-sets/${normSetId}/publish`,
        payload,
      );
    },
    getPpeCard(id: string) {
      return client.get<InventoryPpeCardDetailDto>(`/api/v1/inventory/ppe/cards/${id}`);
    },

    updatePpeCard(id: string, payload: CreateInventoryPpeCardDto) {
      return client.put<InventoryPpeCardDetailDto, CreateInventoryPpeCardDto>(
        `/api/v1/inventory/ppe/cards/${id}`,
        payload,
      );
    },

    archivePpeCard(id: string) {
      return client.patch<InventoryPpeCardDetailDto, undefined>(
        `/api/v1/inventory/ppe/cards/${id}/archive`,
        undefined,
      );
    },

    getPpeOptions() {
      return client.get<InventoryPpeModuleOptionsDto>("/api/v1/inventory/ppe/options");
    },

    getPpeItems(params: InventoryListParams = {}) {
      return client.get<InventoryListResponseDto<InventoryItemDto>>(
        `/api/v1/inventory/ppe/items${toQueryString(params)}`,
      );
    },

    getPpeCardHistory(id: string, params: InventoryListParams = {}) {
      return client.get<InventoryListResponseDto<InventoryHistoryDto>>(
        `/api/v1/inventory/ppe/cards/${id}/history${toQueryString(params)}`,
      );
    },

    getPpeCardLinesHistory(id: string, params: InventoryListParams = {}) {
      return client.get<InventoryListResponseDto<InventoryHistoryDto>>(
        `/api/v1/inventory/ppe/cards/${id}/lines/history${toQueryString(params)}`,
      );
    },

    createPpeCard(payload: CreateInventoryPpeCardDto) {
      return client.post<InventoryPpeCardDetailDto, CreateInventoryPpeCardDto>(
        "/api/v1/inventory/ppe/cards",
        payload,
      );
    },

    addPpeCardLine(cardId: string, payload: UpsertInventoryPpeCardLineDto) {
      return client.post<InventoryPpeCardLineDto, UpsertInventoryPpeCardLineDto>(
        `/api/v1/inventory/ppe/cards/${cardId}/lines`,
        payload,
      );
    },

    updatePpeCardLine(cardId: string, lineId: string, payload: UpsertInventoryPpeCardLineDto) {
      return client.put<InventoryPpeCardLineDto, UpsertInventoryPpeCardLineDto>(
        `/api/v1/inventory/ppe/cards/${cardId}/lines/${lineId}`,
        payload,
      );
    },

    updatePpeCardLineStatus(cardId: string, lineId: string, payload: UpdateInventoryStatusDto) {
      return client.patch<InventoryPpeCardLineDto, UpdateInventoryStatusDto>(
        `/api/v1/inventory/ppe/cards/${cardId}/lines/${lineId}/status`,
        payload,
      );
    },

    archivePpeCardLine(cardId: string, lineId: string) {
      return client.patch<InventoryPpeCardLineDto, undefined>(
        `/api/v1/inventory/ppe/cards/${cardId}/lines/${lineId}/archive`,
        undefined,
      );
    },

    getPpeCardLineHistory(cardId: string, lineId: string, params: InventoryListParams = {}) {
      return client.get<InventoryListResponseDto<InventoryHistoryDto>>(
        `/api/v1/inventory/ppe/cards/${cardId}/lines/${lineId}/history${toQueryString(params)}`,
      );
    },

    getPpeMovements(params: InventoryListParams = {}) {
      return client.get<InventoryListResponseDto<InventoryPpeMovementDto>>(
        `/api/v1/inventory/ppe/movements${toQueryString(params)}`,
      );
    },

    getHistory(params: InventoryListParams = {}) {
      return client.get<InventoryListResponseDto<InventoryHistoryDto>>(
        `/api/v1/inventory/history${toQueryString(params)}`,
      );
    },

    getReports(params: InventoryListParams = {}) {
      return client.get<InventoryListResponseDto<InventoryReportDto>>(
        `/api/v1/inventory/reports${toQueryString(params)}`,
      );
    },

    exportReport(reportId: string, format = "xlsx") {
      return client.download(
        `/api/v1/inventory/reports/${reportId}/export${toQueryString({ format })}`,
        { method: "POST" },
      );
    },

    getExport(exportId: string) {
      return client.get<InventoryExportJobDto>(`/api/v1/inventory/exports/${exportId}`);
    },

    printCustodyDocument(documentId: string, format = "pdf") {
      return client.download(
        `/api/v1/inventory/custody/documents/${documentId}/print${toQueryString({ format })}`,
      );
    },

    printPpeCard(cardId: string, type = "card", format = "pdf") {
      return client.download(
        `/api/v1/inventory/ppe/cards/${cardId}/print${toQueryString({ format, type })}`,
      );
    },

    getSystemLog(params: InventoryListParams = {}) {
      return client.get<InventoryListResponseDto<InventorySystemLogDto>>(
        `/api/v1/inventory/system-log${toQueryString(params)}`,
      );
    },

    getEmployees(params: InventoryListParams = {}) {
      return client.get<InventoryListResponseDto<InventoryEmployeeDto>>(
        `/api/v1/inventory/employees${toQueryString(params)}`,
      );
    },

    async createEmployee(payload: CreateEmployeeDto) {
      const employee = await client.post<EmployeeDto, CreateEmployeeDto>("/api/v1/employees", payload);
      return mapEmployeeToInventoryEmployee(employee);
    },

    async updateEmployee(id: string, payload: UpdateEmployeeDto) {
      const employee = await client.put<EmployeeDto, UpdateEmployeeDto>(`/api/v1/employees/${id}`, payload);
      return mapEmployeeToInventoryEmployee(employee);
    },

    importEmployees(file: File, previewToken?: string) {
      const formData = new FormData();
      formData.append("file", file);
      if (previewToken) formData.append("previewToken", previewToken);
      return client.postForm<InventoryEmployeeImportResultDto>("/api/v1/inventory/employees/import", formData);
    },

    previewEmployeesImport(file: File) {
      const formData = new FormData();
      formData.append("file", file);
      return client.postForm<InventoryEmployeeImportPreviewDto>("/api/v1/inventory/employees/import/preview", formData);
    },

    archiveEmployee(id: string) {
      return client.patch<InventoryEmployeeDto, undefined>(`/api/v1/inventory/employees/${id}/archive`, undefined);
    },

    getUsers(params: InventoryListParams = {}) {
      return client.get<InventoryListResponseDto<InventoryUserDto>>(
        `/api/v1/inventory/users${toQueryString(params)}`,
      );
    },

    disableUser(id: string) {
      return client.patch<InventoryUserDto, undefined>(`/api/v1/inventory/users/${id}/disable`, undefined);
    },

    getSettings() {
      return client.get<InventorySettingsDto>("/api/v1/inventory/settings");
    },

    getItemSet(id: string) {
      return client.get<InventoryItemSetDetailDto>(`/api/v1/inventory/settings/item-sets/${id}`);
    },

    getItemSetItems(id: string) {
      return client.get<InventoryItemSetItemDto[]>(`/api/v1/inventory/settings/item-sets/${id}/items`);
    },

    getDbHealth() {
      return client.get<InventoryDbHealthDto>("/api/v1/inventory/db-health");
    },

    createCategory(payload: CreateInventoryCategoryDto) {
      return client.post<InventoryReferenceOptionDto, CreateInventoryCategoryDto>(
        "/api/v1/inventory/categories",
        payload,
      );
    },

    updateCategory(id: string, payload: UpdateInventoryCategoryDto) {
      return client.put<InventoryReferenceOptionDto, UpdateInventoryCategoryDto>(
        `/api/v1/inventory/categories/${id}`,
        payload,
      );
    },

    createUnit(payload: CreateInventoryUnitDto) {
      return client.post<InventoryReferenceOptionDto, CreateInventoryUnitDto>(
        "/api/v1/inventory/units",
        payload,
      );
    },

    updateUnit(id: string, payload: UpdateInventoryUnitDto) {
      return client.put<InventoryReferenceOptionDto, UpdateInventoryUnitDto>(
        `/api/v1/inventory/units/${id}`,
        payload,
      );
    },

    createWarehouse(payload: CreateInventoryWarehouseDto) {
      return client.post<InventoryReferenceOptionDto, CreateInventoryWarehouseDto>(
        "/api/v1/inventory/warehouses",
        payload,
      );
    },

    updateWarehouse(id: string, payload: UpdateInventoryWarehouseDto) {
      return client.put<InventoryReferenceOptionDto, UpdateInventoryWarehouseDto>(
        `/api/v1/inventory/warehouses/${id}`,
        payload,
      );
    },

    createCustodyCategory(payload: CreateInventorySimpleReferenceDto) {
      return client.post<InventoryReferenceOptionDto, CreateInventorySimpleReferenceDto>(
        "/api/v1/inventory/custody/categories",
        payload,
      );
    },

    updateCustodyCategory(id: string, payload: UpdateInventorySimpleReferenceDto) {
      return client.put<InventoryReferenceOptionDto, UpdateInventorySimpleReferenceDto>(
        `/api/v1/inventory/custody/categories/${id}`,
        payload,
      );
    },

    createReturnReason(payload: CreateInventorySimpleReferenceDto) {
      return client.post<InventoryReferenceOptionDto, CreateInventorySimpleReferenceDto>(
        "/api/v1/inventory/settings/return-reasons",
        payload,
      );
    },

    updateReturnReason(id: string, payload: UpdateInventorySimpleReferenceDto) {
      return client.put<InventoryReferenceOptionDto, UpdateInventorySimpleReferenceDto>(
        `/api/v1/inventory/settings/return-reasons/${id}`,
        payload,
      );
    },

    createWriteOffReason(payload: CreateInventorySimpleReferenceDto) {
      return client.post<InventoryReferenceOptionDto, CreateInventorySimpleReferenceDto>(
        "/api/v1/inventory/settings/write-off-reasons",
        payload,
      );
    },

    updateWriteOffReason(id: string, payload: UpdateInventorySimpleReferenceDto) {
      return client.put<InventoryReferenceOptionDto, UpdateInventorySimpleReferenceDto>(
        `/api/v1/inventory/settings/write-off-reasons/${id}`,
        payload,
      );
    },

    createEmployeeReference(kind: "position" | "department" | "group", payload: CreateInventorySimpleReferenceDto) {
      return client.post<InventoryReferenceOptionDto, CreateInventorySimpleReferenceDto>(
        `/api/v1/inventory/settings/employees/${kind}`,
        payload,
      );
    },

    updateEmployeeReference(kind: "position" | "department" | "group", id: string, payload: UpdateInventorySimpleReferenceDto) {
      return client.put<InventoryReferenceOptionDto, UpdateInventorySimpleReferenceDto>(
        `/api/v1/inventory/settings/employees/${kind}/${id}`,
        payload,
      );
    },

    createItemSet(payload: CreateInventoryItemSetDto) {
      return client.post<InventoryItemSetDto, CreateInventoryItemSetDto>("/api/v1/inventory/settings/item-sets", payload);
    },

    updateItemSet(id: string, payload: UpdateInventoryItemSetDto) {
      return client.put<InventoryItemSetDto, UpdateInventoryItemSetDto>(`/api/v1/inventory/settings/item-sets/${id}`, payload);
    },

    updateItemSetItems(id: string, payload: UpsertInventoryItemSetItemsDto) {
      return client.put<InventoryItemSetDetailDto, UpsertInventoryItemSetItemsDto>(
        `/api/v1/inventory/settings/item-sets/${id}/items`,
        payload,
      );
    },

    upsertPositionNorm(payload: UpsertInventoryPositionNormDto) {
      return client.post("/api/v1/inventory/settings/position-norms", payload);
    },

    createItem(payload: UpsertInventoryItemDto) {
      return client.post<InventoryItemDto, UpsertInventoryItemDto>("/api/v1/inventory/items", payload);
    },

    updateItem(id: string, payload: UpsertInventoryItemDto) {
      return client.put<InventoryItemDto, UpsertInventoryItemDto>(`/api/v1/inventory/items/${id}`, payload);
    },

    setInitialStock(payload: InventoryInitialStockDto) {
      return client.post<InventoryStockBalanceDto, InventoryInitialStockDto>(
        "/api/v1/inventory/stock/initial",
        payload,
      );
    },

    createOperation(payload: CreateInventoryOperationDto) {
      return client.post<InventoryDocumentDto, CreateInventoryOperationDto>(
        "/api/v1/inventory/documents",
        payload,
      );
    },

    importLegacy(dryRun = false) {
      return client.post<InventoryLegacyImportRunDto, undefined>(
        dryRun ? "/api/v1/inventory/legacy/import/dry-run" : "/api/v1/inventory/legacy/import",
        undefined,
      );
    },

    getLegacyImportRun(id: string) {
      return client.get<InventoryLegacyImportRunDto>(`/api/v1/inventory/legacy/import-runs/${id}`);
    },

    getLegacyImportRunTables(id: string) {
      return client.get(`/api/v1/inventory/legacy/import-runs/${id}/tables`);
    },
  };
}

function mapEmployeeToInventoryEmployee(employee: EmployeeDto): InventoryEmployeeDto {
  return {
    birthDate: employee.birthDate,
    department: employee.department,
    employeeGroup: employee.employeeGroup,
    fullName: employee.fullName,
    hiredAt: employee.hiredAt,
    id: employee.id,
    personnelNo: employee.personnelNo,
    position: employee.position,
    status: mapEmployeeStatusSafe(employee.status),
  };
}

function mapEmployeeStatusSafe(status: string) {
  const normalized = status.trim().toLowerCase();
  if (["архив", "archived", "офлайн"].includes(normalized)) return "archived";
  if (["disabled", "отключен"].includes(normalized)) return "disabled";
  if (["inactive", "неактивен"].includes(normalized)) return "inactive";
  return "active";
}

function toQueryString(params: InventoryListParams) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      query.set(key, String(value));
    }
  }

  const queryString = query.toString();
  return queryString ? `?${queryString}` : "";
}
