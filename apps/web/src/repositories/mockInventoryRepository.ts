import type {
  ApplyInventoryPpeLineActionDto,
  CreateEmployeeDto,
  CreateInventoryCategoryDto,
  CreateInventoryCustodyRecordDto,
  CreateInventoryItemSetDto,
  CreateInventoryOperationDto,
  CreateInventoryPpeCardDto,
  CreateInventoryPpeCardDraftDto,
  CreateInventoryPpeIssueBatchDto,
  CreateInventoryPpeIssueDto,
  CreateInventorySimpleReferenceDto,
  CreateInventoryUnitDto,
  CreateInventoryWarehouseDto,
  InventoryCustodyDocumentDetailDto,
  InventoryCustodyDocumentDto,
  InventoryCustodyRecordDto,
  InventoryDbHealthDto,
  InventoryDocumentDto,
  InventoryEmployeeDto,
  InventoryEmployeeImportPreviewDto,
  InventoryEmployeeImportPreviewRowDto,
  InventoryExportJobDto,
  InventoryFacetDto,
  InventoryHistoryDto,
  InventoryInitialStockDto,
  InventoryItemDto,
  InventoryItemFacetsDto,
  InventoryItemSetDetailDto,
  InventoryItemSetDto,
  InventoryItemSetItemDto,
  InventoryLegacyImportRunDto,
  InventoryListResponseDto,
  InventoryOperationsModuleOptionsDto,
  InventoryOverviewDto,
  InventoryPpeCardDetailDto,
  InventoryPpeCardDto,
  InventoryPpeEmployeeDetailsDto,
  InventoryPpeCardLineDto,
  InventoryPpeModuleOptionsDto,
  InventoryPpeCardNormRowDto,
  InventoryPpeHistoryRowDto,
  InventoryPpeNormMappingDto,
  InventoryPpeSummaryDto,
  InventoryReferenceOptionDto,
  InventoryReportDto,
  InventorySettingsDto,
  InventoryStockBalanceDto,
  InventorySystemLogDto,
  InventoryUserDto,
  UpdateInventoryCategoryDto,
  UpdateEmployeeDto,
  UpdateInventoryItemSetDto,
  UpdateInventorySimpleReferenceDto,
  UpdateInventoryStatusDto,
  TransferInventoryCustodyRecordDto,
  UpdateInventoryUnitDto,
  UpdateInventoryWarehouseDto,
  UpsertInventoryItemDto,
  UpsertInventoryItemSetItemsDto,
  UpsertInventoryPpeCardLineDto,
  UpdateInventoryPpeCardDraftDto,
  UpdateInventoryPpeCardNormRowsDto,
  UpsertInventoryPpeNormMappingDto,
  UpsertInventoryPositionNormDto,
} from "../api/contracts";
import type { ApiFileResponse } from "../api/client";
import { createClientUuid } from "../shared/clientUuid";
import type { InventoryListParams, InventoryRepository } from "./inventoryRepository";

const STORAGE_KEY = "patrol360.inventory.mock.v1";

type InventoryMockStore = {
  custodyDocuments: InventoryCustodyDocumentDto[];
  custodyRecords: InventoryCustodyRecordDto[];
  documents: InventoryDocumentDto[];
  employees: InventoryEmployeeDto[];
  history: InventoryHistoryDto[];
  itemSetItems: Record<string, InventoryItemSetItemDto[]>;
  items: InventoryItemDto[];
  legacyRuns: InventoryLegacyImportRunDto[];
  ppeCards: InventoryPpeCardDetailDto[];
  ppeMappings: Record<string, InventoryPpeNormMappingDto[]>;
  settings: InventorySettingsDto;
  stock: InventoryStockBalanceDto[];
  systemLog: InventorySystemLogDto[];
  users: InventoryUserDto[];
};

const emptyPpeSummary = {
  active: 0,
  issued: 0,
  issuedLines: 0,
  issuing: 0,
  linesTotal: 0,
  notIssued: 0,
  notIssuedLines: 0,
  partial: 0,
  problem: 0,
  returned: 0,
  total: 0,
  writtenOff: 0,
};

function emptyPpeEmployeeDetails(): InventoryPpeEmployeeDetailsDto {
  return {
    clothingSize: "",
    gender: "",
    handProtectionSize: "",
    headSize: "",
    height: "",
    respiratorSize: "",
    shoeSize: "",
  };
}

let memoryStore: InventoryMockStore | null = null;

export function createMockInventoryRepository(): InventoryRepository {
  return {
    async getOverview() {
      const store = readStore();
      return buildOverview(store);
    },

    async getItems(params = {}) {
      const store = readStore();
      let rows = store.items;
      if (params.status === "active") rows = rows.filter((row) => row.isActive);
      if (params.status === "inactive") rows = rows.filter((row) => !row.isActive);
      if (params.categoryId) rows = rows.filter((row) => row.categoryId === params.categoryId);
      if (params.unitId) rows = rows.filter((row) => row.unitId === params.unitId);
      if (params.trackingType) rows = rows.filter((row) => row.trackingType === params.trackingType);
      if (params.itemKind) rows = rows.filter((row) => row.itemKind === params.itemKind);
      rows = filterByQuery(rows, params.query, (row) => [row.name, row.sku, row.article, row.category, row.unit]);
      return pageRows(rows, params);
    },

    async getItemFacets() {
      const store = readStore();
      return buildFacets(store);
    },

    async getStock(params = {}) {
      const store = readStore();
      let rows = store.stock;
      if (params.itemId) rows = rows.filter((row) => row.itemId === params.itemId);
      rows = filterByQuery(rows, params.query, (row) => [row.itemName, row.warehouseName, row.status]);
      return pageRows(rows, params);
    },

    async getDocuments(params = {}) {
      const store = readStore();
      let rows = sortDocuments(store.documents);
      if (params.type) rows = rows.filter((row) => row.type === params.type);
      rows = filterByQuery(rows, params.query, (row) => [row.number, row.itemName ?? "", row.employeeName, row.warehouseName ?? ""]);
      return pageRows(rows, params);
    },

    async getIssues(params = {}) {
      const store = readStore();
      return pageRows(
        filterByQuery(store.documents.filter((row) => row.type === "issue"), params.query, (row) => [
          row.number,
          row.itemName ?? "",
          row.employeeName,
        ]),
        params,
      );
    },

    async getIssueOptions() {
      return buildOperationsOptions(readStore());
    },

    async getOperationsOptions() {
      return buildOperationsOptions(readStore());
    },

    async getCustodyRecords(params = {}) {
      const store = readStore();
      let rows = store.custodyRecords;
      if (params.status) rows = rows.filter((row) => row.status === params.status);
      rows = filterByQuery(rows, params.query, (row) => [row.employeeName, row.itemName, row.warehouseName, row.comment]);
      return pageRows(rows, params);
    },

    async getCustodyOptions() {
      const store = readStore();
      return {
        custodyCategories: store.settings.custodyCategories,
        documentStatuses: ["open", "closed", "archived"],
        employees: activeEmployees(store),
        items: activeItems(store),
        recordStatuses: ["in_use", "returned", "written_off", "lost", "archived"],
        warehouses: activeReferences(store.settings.warehouses),
      };
    },

    async createCustodyRecord(payload) {
      const store = readStore();
      const employee = required(store.employees.find((row) => row.id === payload.employeeId), "Сотрудник не найден");
      const item = required(store.items.find((row) => row.id === payload.itemId), "Позиция не найдена");
      const latestRecord = latestCustodyRecordForItem(store, item.id);
      if (latestRecord && ["in_use", "issued"].includes(latestRecord.status)) {
        throw new Error("Предмет уже на руках. Используйте передачу.");
      }
      if (latestRecord && ["written_off", "lost", "archived"].includes(latestRecord.status)) {
        throw new Error("Предмет заблокирован текущим статусом.");
      }
      const warehouse = payload.warehouseId
        ? store.settings.warehouses.find((row) => row.id === payload.warehouseId)
        : null;
      const now = new Date().toISOString();
      const documentId = payload.documentId || id("custody-document");
      const existingDocument = store.custodyDocuments.find((row) => row.id === documentId);
      const document = existingDocument ?? {
        createdAt: now,
        employeeName: employee.fullName,
        id: documentId,
        number: nextNumber("MOCK-CUST", store.custodyDocuments.length + 1),
        recordsCount: 0,
        status: "open",
      };
      const record: InventoryCustodyRecordDto = {
        closedAt: null,
        comment: payload.comment ?? "",
        documentId,
        employeeName: employee.fullName,
        id: id("custody-record"),
        issuedAt: now,
        itemId: item.id,
        itemName: item.name,
        quantity: payload.quantity,
        status: "in_use",
        unit: item.unit,
        warehouseId: warehouse?.id ?? "",
        warehouseName: warehouse?.name ?? "",
      };
      if (!existingDocument) store.custodyDocuments.unshift(document);
      store.custodyRecords.unshift(record);
      document.recordsCount = store.custodyRecords.filter((row) => row.documentId === documentId).length;
      addHistory(store, "custody_record", "created", `Выдано под запись: ${item.name}`, "Mock", record.id);
      if (warehouse) {
        adjustStock(store, item.id, warehouse.id, -payload.quantity);
      }
      writeStore(store);
      return record;
    },

    async updateCustodyRecordStatus(recordId, payload) {
      const store = readStore();
      const record = required(store.custodyRecords.find((row) => row.id === recordId), "Строка под запись не найдена");
      record.status = payload.status;
      record.comment = payload.comment ?? record.comment;
      if (["returned", "written_off", "lost"].includes(payload.status)) record.closedAt = new Date().toISOString();
      addHistory(store, "custody_record", payload.status, `Статус строки: ${payload.status}`, "Mock", record.id);
      writeStore(store);
      return record;
    },

    async transferCustodyRecord(recordId, payload: TransferInventoryCustodyRecordDto) {
      const store = readStore();
      const record = required(store.custodyRecords.find((row) => row.id === recordId), "Строка под запись не найдена");
      const targetEmployeeId = payload.toEmployeeId ?? payload.employeeId;
      const employee = required(store.employees.find((row) => row.id === targetEmployeeId), "Сотрудник не найден");
      if (!["in_use", "issued"].includes(record.status)) {
        throw new Error("Передача доступна только для предмета на руках");
      }
      if (record.employeeName === employee.fullName) {
        throw new Error("Предмет уже закреплен за этим сотрудником");
      }

      const previousEmployee = record.employeeName;
      const comment = payload.comment?.trim();
      record.employeeName = employee.fullName;
      record.status = "in_use";
      record.closedAt = null;
      record.comment = [
        record.comment,
        comment
          ? `Передача: ${previousEmployee} -> ${employee.fullName}. ${comment}`
          : `Передача: ${previousEmployee} -> ${employee.fullName}`,
      ].filter(Boolean).join("\n");
      addHistory(
        store,
        "custody_record",
        "transferred",
        comment
          ? `Передано от ${previousEmployee} к ${employee.fullName}: ${comment}`
          : `Передано от ${previousEmployee} к ${employee.fullName}`,
        "Mock",
        record.id,
      );
      writeStore(store);
      return record;
    },

    async archiveCustodyRecord(recordId) {
      const store = readStore();
      const record = required(store.custodyRecords.find((row) => row.id === recordId), "Строка под запись не найдена");
      record.status = "archived";
      record.closedAt = new Date().toISOString();
      addHistory(store, "custody_record", "archived", `Строка перенесена в архив: ${record.itemName}`, "Mock", record.id);
      writeStore(store);
      return record;
    },

    async getCustodyDocuments(params = {}) {
      const store = readStore();
      return pageRows(filterByQuery(store.custodyDocuments, params.query, (row) => [row.number, row.employeeName]), params);
    },

    async getCustodyDocument(documentId) {
      const store = readStore();
      const document = required(store.custodyDocuments.find((row) => row.id === documentId), "Акт под запись не найден");
      const employee = store.employees.find((row) => row.fullName === document.employeeName);
      return {
        closedAt: document.status === "closed" ? document.createdAt : null,
        createdAt: document.createdAt,
        employeeDepartment: employee?.department ?? "",
        employeeId: employee?.id ?? "",
        employeeName: document.employeeName,
        employeePersonnelNo: employee?.personnelNo ?? "",
        history: store.history.filter((row) =>
          (row.entityType === "custody_document" && row.entityId === document.id)
          || (row.entityType === "custody_record" && store.custodyRecords.some((record) => record.id === row.entityId && record.documentId === document.id)),
        ),
        id: document.id,
        number: document.number,
        records: store.custodyRecords.filter((row) => row.documentId === document.id),
        status: document.status,
      };
    },

    async closeCustodyDocument(documentId) {
      return updateCustodyDocument(documentId, "closed");
    },

    async openCustodyDocument(documentId) {
      return updateCustodyDocument(documentId, "open");
    },

    async archiveCustodyDocument(documentId) {
      return updateCustodyDocument(documentId, "archived");
    },

    async getCustodyRecordHistory(recordId, params = {}) {
      return pageRows(readStore().history.filter((row) => row.entityType === "custody_record" && row.entityId === recordId), params);
    },

    async getCustodyDocumentHistory(documentId, params = {}) {
      const store = readStore();
      const documentRecordIds = new Set(store.custodyRecords.filter((row) => row.documentId === documentId).map((row) => row.id));
      return pageRows(
        store.history.filter((row) =>
          (row.entityType === "custody_document" && row.entityId === documentId)
          || (row.entityType === "custody_record" && documentRecordIds.has(row.entityId ?? "")),
        ),
        params,
      );
    },

    async getPpeCards(params = {}) {
      const store = readStore();
      const allRows = store.ppeCards;
      let rows = allRows;
      if (params.employeeId) {
        rows = rows.filter((row) => row.employeeId === params.employeeId);
      }
      if (params.status && params.status !== "all") {
        rows = rows.filter((row) => row.status === params.status || row.lines.some((line) => line.status === params.status));
      }
      if (params.department) {
        rows = rows.filter((row) => row.employeeDepartment === params.department);
      }
      if (params.priceState === "missing") {
        rows = rows.filter((row) => cardSummary(row).zeroPriceLines > 0);
      }
      if (params.priceState === "priced") {
        rows = rows.filter((row) => cardSummary(row).zeroPriceLines === 0);
      }
      rows = filterByQuery(rows, params.query, (row) => [
        row.employeeName,
        row.employeePersonnelNo,
        row.position,
        row.employeeDepartment,
        row.status,
        ...row.lines.map((line) => line.itemName),
      ]);
      const response = pageRows(rows, params);
      return {
        ...response,
        rows: response.rows.map(cardSummary),
        summary: ppeSummary(allRows),
        filteredSummary: ppeSummary(rows),
      };
    },

    async getPpeWorkspace(employeeId) {
      const store = readStore();
      const employee = required(store.employees.find((row) => row.id === employeeId), "Сотрудник не найден");
      const card = store.ppeCards
        .filter((row) => row.employeeId === employeeId && row.status !== "archived")
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
      const normRows = buildMockPpeNormRows(store, employee.position, card);
      if (card) card.normRows = normRows;
      const issues = normRows.filter((row) => row.rowType === "item");
      return {
        activeNormSet: null,
        card,
        employee,
        errors: issues.filter((row) => !row.mappedItemId).length,
        issued: issues.filter((row) => row.coverageStatus === "issued").length,
        normRows,
        normsTotal: issues.length,
        notIssued: issues.filter((row) => row.coverageStatus === "not_issued").length,
        overdue: issues.filter((row) => row.coverageStatus === "overdue").length,
        partial: issues.filter((row) => row.coverageStatus === "partial").length,
        recentHistory: store.history
          .filter((row) => row.entityId === card?.id || row.entityType === "ppe_line")
          .slice(0, 12),
      };
    },

    async getPpeHistory(params = {}) {
      const store = readStore();
      let rows: InventoryPpeHistoryRowDto[] = store.ppeCards.flatMap((card) =>
        card.lines.map((line) => ({
          action: line.status === "returned" ? "returned" : line.status === "written_off" ? "written_off" : line.status === "defective" ? "defective" : "issued",
          actionLabel: line.status === "returned" ? "Возвращено" : line.status === "written_off" ? "Списано" : line.status === "defective" ? "Неисправно" : "Выдано",
          actor: "Mock",
          cardId: card.id,
          cardNormRowId: line.cardNormRowId ?? null,
          comment: line.normPoint || "",
          createdAt: line.issuedAt ?? card.createdAt,
          employeeId: card.employeeId,
          employeeName: card.employeeName,
          fromStatus: "",
          id: `event-${line.id}-${line.status}`,
          itemId: line.itemId,
          itemName: line.itemName,
          lineId: line.id,
          normItemName: line.printItemName || line.itemName,
          quantity: line.quantity,
          toStatus: line.status,
          unit: line.unit,
        })),
      );
      if (params.employeeId) rows = rows.filter((row) => row.employeeId === params.employeeId);
      if (params.itemId) rows = rows.filter((row) => row.itemId === params.itemId);
      if (params.action) rows = rows.filter((row) => row.action === params.action);
      if (params.status) rows = rows.filter((row) => row.toStatus === params.status);
      if (params.query) rows = filterByQuery(rows, params.query, (row) => [row.employeeName, row.itemName, row.normItemName ?? ""]);
      if (params.dateFrom) rows = rows.filter((row) => row.createdAt.slice(0, 10) >= params.dateFrom!);
      if (params.dateTo) rows = rows.filter((row) => row.createdAt.slice(0, 10) <= params.dateTo!);
      rows.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      return pageRows(rows, params);
    },

    async createPpeCardDraft(payload: CreateInventoryPpeCardDraftDto) {
      const store = readStore();
      const employee = required(store.employees.find((row) => row.id === payload.employeeId), "Сотрудник не найден");
      const sourceCard = payload.sourceCardId
        ? required(store.ppeCards.find((row) => row.id === payload.sourceCardId), "Исходная карточка не найдена")
        : store.ppeCards.find((row) => row.employeeId === employee.id);
      const card: InventoryPpeCardDetailDto = {
        comment: payload.comment ?? "",
        createdAt: payload.cardDate,
        employeeDepartment: employee.department,
        employeeDetails: payload.employeeDetails ?? sourceCard?.employeeDetails ?? emptyPpeEmployeeDetails(),
        employeeId: employee.id,
        employeeName: employee.fullName,
        employeePersonnelNo: employee.personnelNo,
        id: id("ppe-card"),
        lines: [],
        normRows: [],
        position: employee.position,
        status: "draft",
        issueType: payload.issueType ?? "planned",
        responsibleName: payload.responsibleName ?? "",
        basis: payload.basis ?? "",
        version: 1,
      };
      if (payload.source === "previous_card" && sourceCard) {
        card.normRows = buildMockPpeNormRows(store, employee.position, sourceCard).map((row, index) => ({
          ...row,
          id: id("ppe-norm-row"),
          sortOrder: index,
        }));
      } else if (payload.source === "active_norms") {
        card.normRows = buildMockPpeNormRows(store, employee.position, null);
      }
      store.ppeCards.unshift(card);
      addHistory(store, "ppe_card", "created", `Создан черновик карточки СИЗ: ${employee.fullName}`, "Mock", card.id);
      writeStore(store);
      return card;
    },

    async updatePpeCardDraft(cardId, payload: UpdateInventoryPpeCardDraftDto) {
      const store = readStore();
      const card = required(store.ppeCards.find((row) => row.id === cardId), "Карточка СИЗ не найдена");
      if ((card.version ?? 1) !== payload.expectedVersion) throw new Error("Карточка была изменена другим пользователем");
      card.createdAt = payload.cardDate;
      card.issueType = payload.issueType;
      card.responsibleName = payload.responsibleName;
      card.basis = payload.basis;
      card.employeeDetails = payload.employeeDetails ?? card.employeeDetails;
      card.version = (card.version ?? 1) + 1;
      writeStore(store);
      return card;
    },

    async updatePpeCardNormRows(cardId, payload: UpdateInventoryPpeCardNormRowsDto) {
      const store = readStore();
      const card = required(store.ppeCards.find((row) => row.id === cardId), "Карточка СИЗ не найдена");
      if ((card.version ?? 1) !== payload.expectedVersion) throw new Error("Карточка была изменена другим пользователем");
      card.normRows = payload.rows.map((row, index) => ({
        brandModelArticle: row.brandModelArticle ?? "",
        coverageStatus: "not_issued",
        defaultUnitPriceMinor: row.defaultUnitPriceMinor ?? null,
        id: row.id ?? id("ppe-norm-row"),
        issuePeriodText: row.issuePeriodText,
        issuedQuantity: 0,
        lifeMonths: row.lifeMonths ?? null,
        mappedItemId: row.mappedItemId ?? null,
        mappedItemName: store.items.find((item) => item.id === row.mappedItemId)?.name ?? "",
        mappings: [],
        normItemName: row.normItemName,
        normPoint: row.normPoint,
        parentRowId: row.parentRowId ?? null,
        quantity: row.quantity,
        quantityText: row.quantityText,
        rowType: row.rowType,
        sortOrder: index,
        sourceNormRowId: row.sourceNormRowId ?? null,
      }));
      card.version = (card.version ?? 1) + 1;
      writeStore(store);
      return card;
    },

    async createPpeIssue(cardId, payload: CreateInventoryPpeIssueDto) {
      const store = readStore();
      const card = required(store.ppeCards.find((row) => row.id === cardId), "Карточка СИЗ не найдена");
      if (payload.expectedVersion != null && (card.version ?? 1) !== payload.expectedVersion) throw new Error("Карточка СИЗ была изменена другим пользователем");
      const normRow = required(card.normRows?.find((row) => row.id === payload.cardNormRowId), "Строка нормы не найдена");
      const item = required(store.items.find((row) => row.id === payload.itemId), "Номенклатура не найдена");
      const unitPriceMinor = payload.unitPriceMinor ?? item.defaultUnitPriceMinor ?? 0;
      const line: InventoryPpeCardLineDto = {
        amountMinor: unitPriceMinor * payload.quantity,
        brandModelArticle: payload.brandModelArticle ?? normRow.brandModelArticle,
        cardNormRowId: normRow.id,
        dueAt: normRow.lifeMonths ? addMonthsIso(payload.issuedAt, normRow.lifeMonths) : null,
        id: id("ppe-line"),
        issueMethod: payload.issueMethod,
        issuedAt: payload.issuedAt,
        issuePeriodText: normRow.issuePeriodText,
        itemId: item.id,
        itemName: item.name,
        modelDescription: payload.brandModelArticle ?? "",
        normPoint: normRow.normPoint,
        printItemName: normRow.normItemName,
        quantity: payload.quantity,
        quantityText: normRow.quantityText,
        sizeText: payload.sizeText ?? "",
        status: "issued",
        unit: item.unit,
        unitPriceMinor,
        warehouseId: payload.warehouseId ?? null,
        warehouseName: "",
      };
      card.lines.push(line);
      card.status = "active";
      card.version = (card.version ?? 1) + 1;
      addHistory(store, "ppe_line", "issued", `Выдано СИЗ: ${normRow.normItemName}`, "Mock", card.id);
      writeStore(store);
      return line;
    },

    async createPpeIssueBatch(cardId, payload: CreateInventoryPpeIssueBatchDto) {
      const store = readStore();
      const card = required(store.ppeCards.find((row) => row.id === cardId), "Карточка СИЗ не найдена");
      if ((card.version ?? 1) !== payload.expectedVersion) throw new Error("Карточка СИЗ была изменена другим пользователем");
      if (!payload.lines.length) throw new Error("Добавьте хотя бы одну позицию СИЗ");
      const seen = new Set<string>();
      const prepared = payload.lines.map((linePayload) => {
        if (seen.has(linePayload.cardNormRowId)) throw new Error("Строка нормы повторяется в документе");
        seen.add(linePayload.cardNormRowId);
        const normRow = required(card.normRows?.find((row) => row.id === linePayload.cardNormRowId), "Строка нормы не найдена");
        const item = required(store.items.find((row) => row.id === linePayload.itemId && row.isActive), "Номенклатура не найдена");
        if (linePayload.quantity <= 0) throw new Error("Количество должно быть больше нуля");
        const unitPriceMinor = linePayload.unitPriceMinor ?? item.defaultUnitPriceMinor ?? 0;
        return { linePayload, normRow, item, unitPriceMinor };
      });
      for (const { linePayload, normRow, item, unitPriceMinor } of prepared) {
        card.lines.push({
          amountMinor: unitPriceMinor * linePayload.quantity,
          brandModelArticle: linePayload.brandModelArticle ?? normRow.brandModelArticle,
          cardNormRowId: normRow.id,
          dueAt: normRow.lifeMonths ? addMonthsIso(linePayload.issuedAt, normRow.lifeMonths) : null,
          id: id("ppe-line"), issueMethod: linePayload.issueMethod, issuedAt: linePayload.issuedAt,
          issuePeriodText: normRow.issuePeriodText, itemId: item.id, itemName: item.name,
          modelDescription: linePayload.brandModelArticle ?? "", normPoint: normRow.normPoint,
          printItemName: normRow.normItemName, quantity: linePayload.quantity,
          quantityText: normRow.quantityText, sizeText: linePayload.sizeText ?? "", status: "issued",
          unit: item.unit, unitPriceMinor, warehouseId: linePayload.warehouseId ?? null, warehouseName: "",
        });
        addHistory(store, "ppe_line", "issued", `Выдано СИЗ: ${normRow.normItemName}`, "Mock", card.id);
      }
      card.status = "active";
      card.version = (card.version ?? 1) + 1;
      writeStore(store);
      return card;
    },

    async applyPpeLineAction(cardId, lineId, payload: ApplyInventoryPpeLineActionDto) {
      const store = readStore();
      const card = required(store.ppeCards.find((row) => row.id === cardId), "Карточка СИЗ не найдена");
      if (payload.expectedVersion != null && (card.version ?? 1) !== payload.expectedVersion) throw new Error("Карточка СИЗ была изменена другим пользователем");
      const line = required(card.lines.find((row) => row.id === lineId), "Факт выдачи не найден");
      line.status = payload.action;
      if (payload.action === "returned") {
        line.returnedAt = payload.occurredAt;
        line.returnedQuantity = payload.quantity ?? line.quantity;
      }
      if (payload.action === "written_off") {
        line.writeOffActDate = payload.writeOffActDate ?? payload.occurredAt;
        line.writeOffActNumber = payload.writeOffActNumber ?? "";
      }
      card.version = (card.version ?? 1) + 1;
      addHistory(store, "ppe_line", payload.action, `${payload.action}: ${line.printItemName || line.itemName}`, "Mock", card.id);
      writeStore(store);
      return line;
    },

    async getPpeNormRowMappings(normRowId) {
      return pageRows(readStore().ppeMappings[normRowId] ?? [], {});
    },

    async upsertPpeNormRowMapping(normRowId, payload: UpsertInventoryPpeNormMappingDto) {
      const store = readStore();
      const item = required(store.items.find((row) => row.id === payload.itemId), "Номенклатура не найдена");
      const mappings = store.ppeMappings[normRowId] ?? [];
      if (payload.isDefault !== false) mappings.forEach((row) => { row.isDefault = false; });
      let mapping = mappings.find((row) => row.itemId === item.id);
      if (!mapping) {
        mapping = {
          brandModelArticle: payload.brandModelArticle ?? "",
          comment: payload.comment ?? "",
          defaultUnitPriceMinor: payload.defaultUnitPriceMinor ?? item.defaultUnitPriceMinor ?? null,
          id: id("ppe-mapping"),
          isDefault: payload.isDefault !== false,
          itemId: item.id,
          itemName: item.name,
          itemSku: item.sku,
          normRowId,
        };
        mappings.push(mapping);
      } else {
        mapping.brandModelArticle = payload.brandModelArticle ?? mapping.brandModelArticle;
        mapping.defaultUnitPriceMinor = payload.defaultUnitPriceMinor ?? mapping.defaultUnitPriceMinor;
        mapping.isDefault = payload.isDefault !== false;
        mapping.comment = payload.comment ?? mapping.comment;
      }
      store.ppeMappings[normRowId] = mappings;
      writeStore(store);
      return mapping;
    },

    async getPpeNormSets() {
      return pageRows([], {});
    },

    async importPpeNormSetsDraft() {
      return {
        groupsCreated: 0,
        itemsCreated: 0,
        normSets: [],
        normSetsCreated: 0,
        skippedRows: 0,
        sourceRows: 0,
        warnings: [],
      };
    },

    async publishPpeNormSet() {
      throw new Error("В демонстрационном режиме публикация нормативных наборов недоступна");
    },
    async getPpeCard(cardId) {
      return required(readStore().ppeCards.find((row) => row.id === cardId), "Карточка СИЗ не найдена");
    },

    async updatePpeCard(cardId, payload) {
      const store = readStore();
      const card = required(store.ppeCards.find((row) => row.id === cardId), "Карточка СИЗ не найдена");
      const employee = required(store.employees.find((row) => row.id === payload.employeeId), "Сотрудник не найден");
      if (card.employeeId !== employee.id) {
        throw new Error("Нельзя изменить сотрудника существующей карточки СИЗ");
      }
      card.employeeName = employee.fullName;
      card.employeePersonnelNo = employee.personnelNo;
      card.employeeDepartment = employee.department;
      card.employeeDetails = payload.employeeDetails ?? emptyPpeEmployeeDetails();
      card.position = employee.position;
      writeStore(store);
      return card;
    },

    async archivePpeCard(cardId) {
      const store = readStore();
      const card = required(store.ppeCards.find((row) => row.id === cardId), "Карточка СИЗ не найдена");
      store.ppeCards = store.ppeCards.filter((row) => row.id !== cardId);
      addHistory(store, "ppe_card", "archived", `Архивирована карточка СИЗ: ${card.employeeName}`, "Mock");
      writeStore(store);
      return card;
    },

    async getPpeOptions() {
      const store = readStore();
      return {
        employees: activeEmployees(store),
        items: activeItems(store),
        settings: store.settings,
        statuses: ["draft", "issued", "closed", "problem"],
      };
    },

    async getPpeItems(params = {}) {
      const store = readStore();
      const normalized = (params.query ?? "").trim().toLowerCase();
      const categoryId = params.categoryId ?? "";
      const rows = activeItems(store).filter((item) => {
        const matchesQuery =
          !normalized ||
          [item.name, item.article, item.sku, item.category].join(" ").toLowerCase().includes(normalized);
        const matchesCategory = !categoryId || item.categoryId === categoryId;
        return matchesQuery && matchesCategory;
      });
      return pageRows(rows, params);
    },

    async getPpeCardHistory() {
      return pageRows(readStore().history.filter((row) => row.entityType === "ppe_card"), {});
    },

    async getPpeCardLinesHistory() {
      return pageRows(readStore().history.filter((row) => row.entityType === "ppe_line"), {});
    },

    async createPpeCard(payload) {
      const store = readStore();
      const employee = required(store.employees.find((row) => row.id === payload.employeeId), "Сотрудник не найден");
      const existing = store.ppeCards.find((row) => row.employeeId === employee.id);
      if (existing) {
        existing.comment = payload.comment ?? existing.comment;
        existing.employeeDetails = payload.employeeDetails ?? existing.employeeDetails;
        writeStore(store);
        return existing;
      }
      const detail: InventoryPpeCardDetailDto = {
        createdAt: new Date().toISOString(),
        employeeDepartment: employee.department,
        employeeId: employee.id,
        employeeDetails: payload.employeeDetails ?? emptyPpeEmployeeDetails(),
        employeeName: employee.fullName,
        employeePersonnelNo: employee.personnelNo,
        id: id("ppe-card"),
        lines: [],
        position: employee.position,
        status: "draft",
      };
      store.ppeCards.unshift(detail);
      addHistory(store, "ppe_card", "created", `Создана карточка СИЗ: ${employee.fullName}`, "Mock");
      writeStore(store);
      return detail;
    },

    async addPpeCardLine(cardId, payload) {
      const store = readStore();
      const card = required(store.ppeCards.find((row) => row.id === cardId), "Карточка СИЗ не найдена");
      const item = required(store.items.find((row) => row.id === payload.itemId), "Позиция не найдена");
      const warehouse = payload.warehouseId ? store.settings.warehouses.find((row) => row.id === payload.warehouseId) : null;
      const unitPriceMinor = payload.unitPriceMinor ?? item.defaultUnitPriceMinor ?? 0;
      const line: InventoryPpeCardLineDto = {
        amountMinor: unitPriceMinor * payload.quantity,
        brandModelArticle: payload.brandModelArticle ?? [item.brandName, item.modelName, item.article].filter(Boolean).join(" "),
        dueAt: payload.dueAt ?? null,
        id: id("ppe-line"),
        isSectionTitle: Boolean(payload.isSectionTitle),
        issuedAt: payload.status === "issued" ? new Date().toISOString() : null,
        issuePeriodText: payload.issuePeriodText ?? "",
        itemId: item.id,
        itemName: item.name,
        modelDescription: [item.brandName, item.modelName, item.article].filter(Boolean).join(" "),
        normPoint: payload.normPoint ?? "",
        printItemName: payload.printItemName ?? (item.normItemName || item.name),
        quantity: payload.quantity,
        quantityText: payload.quantityText ?? `${payload.quantity} ${item.unit || "шт."}`,
        status: payload.status ?? "draft",
        unit: item.unit,
        unitPriceMinor,
        warehouseId: warehouse?.id ?? null,
        warehouseName: warehouse?.name ?? "",
      };
      card.lines.push(line);
      card.status = card.lines.some((row) => row.status === "issued") ? "issued" : card.status;
      addHistory(store, "ppe_line", "created", `Добавлена строка СИЗ: ${item.name}`, "Mock");
      writeStore(store);
      return line;
    },

    async updatePpeCardLine(cardId, lineId, payload) {
      const store = readStore();
      const card = required(store.ppeCards.find((row) => row.id === cardId), "Карточка СИЗ не найдена");
      const line = required(card.lines.find((row) => row.id === lineId), "Строка СИЗ не найдена");
      const item = required(store.items.find((row) => row.id === payload.itemId), "Позиция не найдена");
      const warehouse = payload.warehouseId ? store.settings.warehouses.find((row) => row.id === payload.warehouseId) : null;
      const unitPriceMinor = payload.unitPriceMinor ?? item.defaultUnitPriceMinor ?? 0;
      line.dueAt = payload.dueAt ?? null;
      line.isSectionTitle = Boolean(payload.isSectionTitle);
      line.issuePeriodText = payload.issuePeriodText ?? line.issuePeriodText ?? "";
      line.itemId = item.id;
      line.itemName = item.name;
      line.modelDescription = [item.brandName, item.modelName, item.article].filter(Boolean).join(" ");
      line.brandModelArticle = payload.brandModelArticle ?? line.modelDescription;
      line.normPoint = payload.normPoint ?? line.normPoint ?? "";
      line.printItemName = payload.printItemName ?? line.printItemName ?? (item.normItemName || item.name);
      line.quantity = payload.quantity;
      line.quantityText = payload.quantityText ?? line.quantityText ?? `${payload.quantity} ${item.unit || "шт."}`;
      line.status = payload.status ?? line.status;
      line.unit = item.unit;
      line.unitPriceMinor = unitPriceMinor;
      line.amountMinor = unitPriceMinor * payload.quantity;
      line.warehouseId = warehouse?.id ?? null;
      line.warehouseName = warehouse?.name ?? "";
      writeStore(store);
      return line;
    },

    async updatePpeCardLineStatus(cardId, lineId, payload) {
      const store = readStore();
      const card = required(store.ppeCards.find((row) => row.id === cardId), "Карточка СИЗ не найдена");
      const line = required(card.lines.find((row) => row.id === lineId), "Строка СИЗ не найдена");
      line.status = payload.status;
      if (payload.status === "issued" && !line.issuedAt) line.issuedAt = new Date().toISOString();
      card.status = card.lines.some((row) => row.status === "issued") ? "issued" : "draft";
      addHistory(store, "ppe_line", "status_changed", `Статус СИЗ: ${payload.status}`, "Mock");
      writeStore(store);
      return line;
    },

    async archivePpeCardLine(cardId, lineId) {
      const store = readStore();
      const card = required(store.ppeCards.find((row) => row.id === cardId), "Карточка СИЗ не найдена");
      const line = required(card.lines.find((row) => row.id === lineId), "Строка СИЗ не найдена");
      if (line.status === "issued") {
        throw new Error("Выданную строку СИЗ нужно сначала вернуть или списать");
      }
      line.status = "archived";
      card.lines = card.lines.filter((row) => row.id !== lineId);
      addHistory(store, "ppe_line", "archived", `Строка СИЗ архивирована: ${line.itemName}`, "Mock");
      writeStore(store);
      return line;
    },

    async getPpeCardLineHistory() {
      return pageRows(readStore().history.filter((row) => row.entityType === "ppe_line"), {});
    },

    async getPpeMovements(params = {}) {
      const store = readStore();
      const rows = store.ppeCards.flatMap((card) =>
        card.lines.map((line) => ({
          amountMinor: line.amountMinor ?? (line.unitPriceMinor ?? 0) * line.quantity,
          cardId: card.id,
          comment: line.normPoint || "",
          createdAt: card.createdAt,
          dueAt: line.dueAt,
          employeeDepartment: card.employeeDepartment,
          employeeId: card.employeeId,
          employeeName: card.employeeName,
          employeePersonnelNo: card.employeePersonnelNo,
          issuedAt: line.issuedAt,
          itemId: line.itemId,
          itemName: line.itemName,
          lineId: line.id,
          quantity: line.quantity,
          returnedAt: line.status === "returned" ? new Date().toISOString() : null,
          status: line.status,
          unit: line.unit,
          unitPriceMinor: line.unitPriceMinor ?? 0,
          writtenOffAt: line.status === "written_off" ? new Date().toISOString() : null,
        })),
      );
      return pageRows(
        rows.filter((row) =>
          (!params.employeeId || row.employeeId === params.employeeId) &&
          (!params.itemId || row.itemId === params.itemId) &&
          (!params.status || row.status === params.status),
        ),
        params,
      );
    },

    async getHistory(params = {}) {
      const store = readStore();
      let rows = store.history;
      if (params.entityType) rows = rows.filter((row) => row.entityType === params.entityType);
      if (params.action) rows = rows.filter((row) => row.action === params.action);
      rows = filterByQuery(rows, params.query, (row) => [row.entityType, row.action, row.description, row.actor]);
      return pageRows(rows, params);
    },

    async getReports(params = {}) {
      return pageRows(mockReports(), params);
    },

    async exportReport(reportId, format = "xlsx") {
      return fileResponse(`${reportId}.${format}`, `Mock export ${reportId}`);
    },

    async getExport(exportId) {
      return {
        createdAt: new Date().toISOString(),
        downloadName: `${exportId}.xlsx`,
        format: "xlsx",
        id: exportId,
        reportId: "stock",
        status: "ready",
      };
    },

    async printCustodyDocument(documentId, format = "pdf") {
      return fileResponse(`custody-${documentId}.${format}`, "Mock custody print");
    },

    async printPpeCard(cardId, type = "card", format = "pdf") {
      return fileResponse(`ppe-${type}-${cardId}.${format}`, "Mock PPE print");
    },

    async getSystemLog(params = {}) {
      const store = readStore();
      let rows = store.systemLog;
      if (params.action) rows = rows.filter((row) => row.action === params.action);
      if (params.entityType) rows = rows.filter((row) => row.entityType === params.entityType);
      rows = filterByQuery(rows, params.query, (row) => [row.entityType, row.action, row.details, row.actor]);
      return pageRows(rows, params);
    },

    async getEmployees(params = {}) {
      const store = readStore();
      let rows = store.employees;
      if (params.status === "active") rows = rows.filter((row) => row.status !== "archived");
      if (params.status === "archived") rows = rows.filter((row) => row.status === "archived");
      if (params.department) rows = rows.filter((row) => row.department === params.department);
      if (params.employeeGroup) rows = rows.filter((row) => row.employeeGroup === params.employeeGroup);
      rows = filterByQuery(rows, params.query, (row) => [row.fullName, row.personnelNo, row.position, row.department, row.employeeGroup]);
      return pageRows(rows, params);
    },

    async createEmployee(payload: CreateEmployeeDto) {
      const store = readStore();
      const fullName = payload.fullName.trim();
      if (!fullName) {
        throw new Error("Укажите ФИО сотрудника");
      }

      const personnelNo = payload.personnelNo.trim() || `MOCK-${Date.now()}`;
      if (store.employees.some((row) => normalize(row.personnelNo) === normalize(personnelNo))) {
        throw new Error("Сотрудник с таким табельным номером уже есть");
      }

      const employee: InventoryEmployeeDto = {
        birthDate: payload.birthDate,
        department: payload.department.trim() || "Не указано",
        employeeGroup: payload.employeeGroup.trim(),
        fullName,
        hiredAt: payload.hiredAt,
        id: id("employee"),
        personnelNo,
        position: payload.position.trim() || "Сотрудник",
        status: "active",
      };
      store.employees.unshift(employee);
      upsertReference(store.settings.employeePositions, employee.position);
      upsertReference(store.settings.employeeDepartments, employee.department);
      if (employee.employeeGroup) upsertReference(store.settings.employeeGroups, employee.employeeGroup);
      addHistory(store, "employee", "created", `Создан сотрудник: ${employee.fullName}`, "Mock");
      addSystemLog(store, "employee", "created", employee.fullName);
      writeStore(store);
      return employee;
    },

    async updateEmployee(employeeId: string, payload: UpdateEmployeeDto) {
      const store = readStore();
      const employee = required(store.employees.find((row) => row.id === employeeId), "Сотрудник не найден");
      const fullName = payload.fullName.trim();
      if (!fullName) {
        throw new Error("Укажите ФИО сотрудника");
      }

      const personnelNo = payload.personnelNo.trim() || employee.personnelNo || `MOCK-${Date.now()}`;
      const duplicate = store.employees.some(
        (row) => row.id !== employeeId && normalize(row.personnelNo) === normalize(personnelNo),
      );
      if (duplicate) {
        throw new Error("Сотрудник с таким табельным номером уже есть");
      }

      employee.fullName = fullName;
      employee.personnelNo = personnelNo;
      employee.position = payload.position.trim() || "Сотрудник";
      employee.department = payload.department.trim() || "Не указано";
      employee.employeeGroup = payload.employeeGroup.trim();
      employee.hiredAt = payload.hiredAt;
      employee.birthDate = payload.birthDate;
      employee.status = normalizeEmployeeStatus(payload.status);
      upsertReference(store.settings.employeePositions, employee.position);
      upsertReference(store.settings.employeeDepartments, employee.department);
      if (employee.employeeGroup) upsertReference(store.settings.employeeGroups, employee.employeeGroup);
      addHistory(store, "employee", "updated", `Обновлена карточка сотрудника: ${employee.fullName}`, "Mock");
      addSystemLog(store, "employee", "updated", employee.fullName);
      writeStore(store);
      return employee;
    },

    async importEmployees(file, previewToken) {
      const store = readStore();
      const preview = await buildImportPreview(store, file);
      if (!previewToken || previewToken !== preview.previewToken) {
        return {
          errors: ["Импорт сотрудников нужно подтвердить из актуального предпросмотра"],
          insertedRows: 0,
          rowsRead: preview.rowsRead,
          skippedRows: preview.rowsRead,
          updatedRows: 0,
        };
      }

      if (preview.errors.length) {
        return {
          errors: preview.errors,
          insertedRows: 0,
          rowsRead: preview.rowsRead,
          skippedRows: preview.skippedRows,
          updatedRows: 0,
        };
      }

      for (const row of preview.rows) {
        const existing = store.employees.find(
          (employee) =>
            normalize(employee.personnelNo) === normalize(row.personnelNo)
            || normalizeFullName(employee.fullName) === normalizeFullName(row.fullName),
        );
        upsertReference(store.settings.employeePositions, row.position);
        upsertReference(store.settings.employeeDepartments, row.department);
        upsertReference(store.settings.employeeGroups, row.employeeGroup);
        if (existing) {
          existing.fullName = row.fullName;
          existing.personnelNo = row.personnelNo;
          existing.position = row.position;
          existing.department = row.department;
          existing.employeeGroup = row.employeeGroup;
          existing.hiredAt = row.hiredAt;
          existing.birthDate = row.birthDate;
          existing.status = "active";
        } else {
          store.employees.push({
            birthDate: row.birthDate,
            department: row.department,
            employeeGroup: row.employeeGroup,
            fullName: row.fullName,
            hiredAt: row.hiredAt,
            id: id("employee"),
            personnelNo: row.personnelNo,
            position: row.position,
            status: "active",
          });
        }
      }
      addSystemLog(store, "employee", "import", `${file.name}: inserted=${preview.newRows}, updated=${preview.updateRows}`);
      writeStore(store);
      return {
        errors: [],
        insertedRows: preview.newRows,
        rowsRead: preview.rowsRead,
        skippedRows: preview.skippedRows,
        updatedRows: preview.updateRows,
      };
    },

    async previewEmployeesImport(file) {
      return buildImportPreview(readStore(), file);
    },

    async archiveEmployee(employeeId) {
      const store = readStore();
      const employee = required(store.employees.find((row) => row.id === employeeId), "Сотрудник не найден");
      employee.status = "archived";
      addHistory(store, "employee", "archived", `Сотрудник перенесен в архив: ${employee.fullName}`, "Mock");
      addSystemLog(store, "employee", "archived", employee.fullName);
      writeStore(store);
      return employee;
    },

    async getUsers(params = {}) {
      return pageRows(readStore().users, params);
    },

    async disableUser(userId) {
      const store = readStore();
      const user = required(store.users.find((row) => row.id === userId), "Пользователь не найден");
      user.status = "disabled";
      addSystemLog(store, "user", "disabled", user.displayName);
      writeStore(store);
      return user;
    },

    async getSettings() {
      return readStore().settings;
    },

    async getItemSet(itemSetId) {
      const store = readStore();
      const itemSet = required(store.settings.itemSets.find((row) => row.id === itemSetId), "Набор не найден");
      return { ...itemSet, items: store.itemSetItems[itemSetId] ?? [] };
    },

    async getItemSetItems(itemSetId) {
      return readStore().itemSetItems[itemSetId] ?? [];
    },

    async getDbHealth() {
      return {
        createdAt: new Date().toISOString(),
        criticalCount: 0,
        issueCount: 0,
        issues: [],
        warningCount: 0,
      } satisfies InventoryDbHealthDto;
    },

    async createCategory(payload) {
      return createReference("categories", payload.name, payload.parentId ?? null);
    },

    async updateCategory(categoryId, payload) {
      return updateReference("categories", categoryId, payload.name, payload.isArchived);
    },

    async createUnit(payload) {
      const created = createReference("units", payload.name, null);
      created.code = payload.symbol;
      return created;
    },

    async updateUnit(unitId, payload) {
      const updated = updateReference("units", unitId, payload.name, false);
      updated.code = payload.symbol;
      return updated;
    },

    async createWarehouse(payload) {
      return createReference("warehouses", payload.name, null, payload.isDefault ? "default" : "");
    },

    async updateWarehouse(warehouseId, payload) {
      return updateReference("warehouses", warehouseId, payload.name, payload.isArchived, payload.isDefault ? "default" : "");
    },

    async createCustodyCategory(payload) {
      return createReference("custodyCategories", payload.name);
    },

    async updateCustodyCategory(idValue, payload) {
      return updateReference("custodyCategories", idValue, payload.name, payload.isArchived);
    },

    async createReturnReason(payload) {
      return createReference("returnReasons", payload.name);
    },

    async updateReturnReason(idValue, payload) {
      return updateReference("returnReasons", idValue, payload.name, payload.isArchived);
    },

    async createWriteOffReason(payload) {
      return createReference("writeOffReasons", payload.name);
    },

    async updateWriteOffReason(idValue, payload) {
      return updateReference("writeOffReasons", idValue, payload.name, payload.isArchived);
    },

    async createEmployeeReference(kind, payload) {
      return createReference(employeeReferenceKey(kind), payload.name);
    },

    async updateEmployeeReference(kind, idValue, payload) {
      return updateReference(employeeReferenceKey(kind), idValue, payload.name, payload.isArchived);
    },

    async createItemSet(payload) {
      const store = readStore();
      const itemSet: InventoryItemSetDto = { id: id("item-set"), isActive: true, itemsCount: 0, name: payload.name };
      store.settings.itemSets.push(itemSet);
      store.itemSetItems[itemSet.id] = [];
      writeStore(store);
      return itemSet;
    },

    async updateItemSet(itemSetId, payload) {
      const store = readStore();
      const itemSet = required(store.settings.itemSets.find((row) => row.id === itemSetId), "Набор не найден");
      itemSet.name = payload.name;
      itemSet.isActive = !payload.isArchived;
      writeStore(store);
      return itemSet;
    },

    async updateItemSetItems(itemSetId, payload) {
      const store = readStore();
      const itemSet = required(store.settings.itemSets.find((row) => row.id === itemSetId), "Набор не найден");
      const rows = payload.items.map((row) => {
        const item = required(store.items.find((candidate) => candidate.id === row.itemId), "Позиция не найдена");
        return { id: id("item-set-item"), item, quantity: row.quantity };
      });
      store.itemSetItems[itemSetId] = rows;
      itemSet.itemsCount = rows.length;
      writeStore(store);
      return { ...itemSet, items: rows };
    },

    async upsertPositionNorm(payload) {
      const store = readStore();
      const item = required(store.items.find((row) => row.id === payload.itemId), "Позиция не найдена");
      const existing = store.settings.positionNorms.find((row) => row.positionName === payload.positionName && row.itemId === payload.itemId);
      if (existing) {
        existing.quantity = payload.quantity;
        existing.lifeMonths = payload.lifeMonths ?? null;
        existing.normItemName = payload.normItemName ?? item.normItemName ?? item.name;
        existing.normPoint = payload.normPoint ?? existing.normPoint ?? "";
        existing.issuePeriodText = payload.issuePeriodText ?? existing.issuePeriodText ?? "";
        existing.quantityText = payload.quantityText ?? existing.quantityText ?? `${payload.quantity} ${item.unit || "шт."}`;
        existing.isSectionTitle = Boolean(payload.isSectionTitle);
      } else {
        store.settings.positionNorms.push({
          id: id("position-norm"),
          itemId: item.id,
          itemName: item.name,
          issuePeriodText: payload.issuePeriodText ?? "",
          isSectionTitle: Boolean(payload.isSectionTitle),
          lifeMonths: payload.lifeMonths ?? null,
          normItemName: payload.normItemName ?? item.normItemName ?? item.name,
          normPoint: payload.normPoint ?? "",
          positionName: payload.positionName,
          quantity: payload.quantity,
          quantityText: payload.quantityText ?? `${payload.quantity} ${item.unit || "шт."}`,
        });
      }
      writeStore(store);
      return {};
    },

    async createItem(payload) {
      const store = readStore();
      const item = mapItemPayload(payload, id("item"), store);
      store.items.unshift(item);
      writeStore(store);
      return item;
    },

    async updateItem(itemId, payload) {
      const store = readStore();
      const index = store.items.findIndex((row) => row.id === itemId);
      if (index < 0) throw new Error("Позиция не найдена");
      store.items[index] = { ...mapItemPayload(payload, itemId, store), balance: store.items[index].balance };
      writeStore(store);
      return store.items[index];
    },

    async setInitialStock(payload) {
      const store = readStore();
      const item = required(store.items.find((row) => row.id === payload.itemId), "Позиция не найдена");
      const warehouse = required(store.settings.warehouses.find((row) => row.id === payload.warehouseId), "Склад не найден");
      const stock = upsertStock(store, item, warehouse);
      stock.stockPhysical = payload.quantity;
      stock.stockAvailable = payload.quantity - stock.stockReserved;
      stock.balance = stock.stockAvailable;
      updateItemBalance(store, item.id);
      addHistory(store, "stock_move", "initial_stock", payload.note ?? `Начальный остаток: ${payload.quantity}`, "Mock");
      writeStore(store);
      return stock;
    },

    async createOperation(payload) {
      const store = readStore();
      const item = required(store.items.find((row) => row.id === payload.itemId), "Позиция не найдена");
      const warehouse = payload.warehouseId
        ? required(store.settings.warehouses.find((row) => row.id === payload.warehouseId), "Склад не найден")
        : null;
      const employee = payload.employeeId ? store.employees.find((row) => row.id === payload.employeeId) : null;
      const quantity = payload.quantity;
      const signed = isNegativeMovement(payload.type) ? -quantity : quantity;
      if (warehouse) {
        adjustStock(store, item.id, warehouse.id, signed);
      }
      const document: InventoryDocumentDto = {
        comment: payload.comment ?? "",
        createdAt: payload.movedAt ?? new Date().toISOString(),
        employeeName: employee?.fullName ?? "",
        id: id("document"),
        itemName: item.name,
        number: nextNumber("MOCK-INV", store.documents.length + 1),
        quantity: signed,
        status: "posted",
        type: payload.type,
        unit: item.unit,
        warehouseName: warehouse?.name ?? "",
      };
      store.documents.unshift(document);
      addHistory(store, "stock_move", payload.type, `${operationLabel(payload.type)}: ${item.name}`, "Mock");
      addSystemLog(store, "stock_move", payload.type, `${item.name}: ${quantity} ${item.unit}`);
      writeStore(store);
      return document;
    },

    async importLegacy(dryRun = false) {
      const run = buildLegacyRun(dryRun);
      const store = readStore();
      store.legacyRuns.unshift(run);
      writeStore(store);
      return run;
    },

    async getLegacyImportRun(runId) {
      return required(readStore().legacyRuns.find((row) => row.id === runId), "Legacy import run не найден");
    },

    async getLegacyImportRunTables(runId) {
      return required(readStore().legacyRuns.find((row) => row.id === runId), "Legacy import run не найден").tables;
    },
  };
}

function readStore(): InventoryMockStore {
  if (typeof window === "undefined") {
    memoryStore ??= createSeedStore();
    return clone(memoryStore);
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seed = createSeedStore();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }

  try {
    const store = JSON.parse(raw) as InventoryMockStore;
    store.ppeMappings ??= {};
    store.ppeCards.forEach((card) => {
      card.version ??= 1;
      card.normRows ??= [];
    });
    return store;
  } catch {
    const seed = createSeedStore();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }
}

function writeStore(store: InventoryMockStore) {
  if (typeof window === "undefined") {
    memoryStore = clone(store);
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function createSeedStore(): InventoryMockStore {
  const now = new Date().toISOString();
  const categories = [
    ref("cat-ppe", "СИЗ", "ppe"),
    ref("cat-tools", "Инструмент", "tools"),
    ref("cat-consumables", "Расходники", "consumables"),
  ];
  const units = [ref("unit-pcs", "Штука", "шт"), ref("unit-pair", "Пара", "пар"), ref("unit-set", "Комплект", "компл")];
  const warehouses = [ref("wh-main", "Основной склад", "default"), ref("wh-ppe", "Склад СИЗ", "ppe")];
  const employees: InventoryEmployeeDto[] = [
    employee("emp-1", "Иванов Иван Иванович", "T-001", "Слесарь", "Участок обогащения", "Атом"),
    employee("emp-2", "Петров Петр Петрович", "T-002", "Электрик", "Энергоучасток", "Атом Экология"),
    employee("emp-3", "Сидоров Алексей Петрович", "T-003", "Кладовщик", "Склад", "Атом"),
  ];
  const items: InventoryItemDto[] = [
    item("item-helmet", "Каска защитная", "PPE-001", categories[0], units[0], 24, "ppe"),
    item("item-gloves", "Перчатки диэлектрические", "PPE-002", categories[0], units[1], 18, "ppe"),
    {
      ...item("item-ppe-section-winter", "На наружных работах, зимой дополнительно:", "PPE-SEC-WINTER", categories[0], units[0], 0, "ppe"),
      normItemName: "На наружных работах, зимой дополнительно:",
    },
    {
      ...item("item-arc-suit-summer", "Костюм летний термостойкий", "PPE-ARC-SUMMER", categories[0], units[0], 8, "ppe"),
      defaultLifeMonths: 48,
      normItemName: "Костюм летний (куртка, брюки или полукомбинезон) термостойкий для защиты электротехнического персонала от термических рисков электрической дуги",
    },
    {
      ...item("item-arc-suit-winter", "Костюм зимний термостойкий", "PPE-ARC-WINTER", categories[0], units[0], 6, "ppe"),
      defaultLifeMonths: 48,
      normItemName: "Костюм от пониженных температур (куртка, брюки или полукомбинезон) термостойкий для защиты электротехнического персонала от термических рисков электрической дуги",
    },
    {
      ...item("item-raincoat", "Плащ от воды", "PPE-RAIN", categories[0], units[0], 10, "ppe"),
      normItemName: "Плащ от воды 3 класса защиты, растворов нетоксичных веществ и общих производственных загрязнений",
    },
    item("item-wrench", "Ключ гаечный 24", "TOOL-024", categories[1], units[0], 7, "custody"),
  ];
  const stock: InventoryStockBalanceDto[] = [
    stockRow(items[0], warehouses[1], 24),
    stockRow(items[1], warehouses[1], 18),
    stockRow(items[6], warehouses[0], 7),
  ];
  const itemSets: InventoryItemSetDto[] = [{ id: "set-electrician", isActive: true, itemsCount: 2, name: "Бригада электрика" }];
  const itemSetItems = {
    [itemSets[0].id]: [
      { id: "set-line-1", item: items[0], quantity: 1 },
      { id: "set-line-2", item: items[1], quantity: 1 },
    ],
  };
  const ppeCard: InventoryPpeCardDetailDto = {
    createdAt: now,
    employeeDepartment: employees[0].department,
    employeeId: employees[0].id,
    employeeDetails: emptyPpeEmployeeDetails(),
    employeeName: employees[0].fullName,
    employeePersonnelNo: employees[0].personnelNo,
    id: "ppe-card-1",
    lines: [
      {
        dueAt: null,
        id: "ppe-line-1",
        issuedAt: now,
        itemId: items[0].id,
        itemName: items[0].name,
        modelDescription: "Стандарт",
        brandModelArticle: "Стандарт",
        normPoint: "п. 1",
        quantity: 1,
        status: "issued",
        unit: items[0].unit,
        warehouseId: warehouses[1].id,
        warehouseName: warehouses[1].name,
      },
    ],
    position: employees[0].position,
    status: "issued",
  };

  return {
    custodyDocuments: [],
    custodyRecords: [],
    documents: [],
    employees,
    history: [
      history("history-1", "employee", "import", "Mock employees seeded", "System", now),
      history("history-2", "ppe_card", "created", "Создана тестовая карточка СИЗ", "System", now),
    ],
    itemSetItems,
    items,
    legacyRuns: [],
    ppeCards: [ppeCard],
    ppeMappings: {},
    settings: {
      categories,
      custodyCategories: [ref("custody-tool", "Инструмент под запись", "tool")],
      employeeDepartments: [ref("dep-enrichment", "Участок обогащения"), ref("dep-energy", "Энергоучасток"), ref("dep-store", "Склад")],
      employeeGroups: [ref("group-atom", "Атом"), ref("group-atom-eco", "Атом Экология")],
      employeePositions: [ref("pos-locksmith", "Слесарь"), ref("pos-electrician", "Электрик"), ref("pos-storekeeper", "Кладовщик")],
      itemSets,
      positionNorms: [
        positionNorm("norm-electric-arc-summer", "Электрик", items[3], 2, 48, "п. 5294 Приложения № 1; п.2.1.1., п.3.5. Приложения № 2", "2 шт., на 4 года", "2 шт."),
        positionNorm("norm-electric-section-winter", "Электрик", items[2], 1, null, "", "", "", true),
        positionNorm("norm-electric-arc-winter", "Электрик", items[4], 2, 48, "п.4.7. Приложения № 2", "2 шт., на 4 года", "2 шт."),
        positionNorm("norm-electric-raincoat", "Электрик", items[5], 1, 12, "п.4.9. Приложения № 2", "шт., на год", "1 шт."),
        positionNorm("norm-electrician-arc-summer", "Электромонтер", items[3], 2, 48, "п. 5294 Приложения № 1; п.2.1.1., п.3.5. Приложения № 2", "2 шт., на 4 года", "2 шт."),
      ],
      returnReasons: [ref("return-wear", "Износ"), ref("return-replace", "Замена")],
      units,
      warehouses,
      writeOffReasons: [ref("writeoff-broken", "Поломка"), ref("writeoff-lost", "Утеря")],
    },
    stock,
    systemLog: [
      { action: "seed", actor: "System", createdAt: now, details: "Mock Inventory initialized", entityId: null, entityType: "inventory", id: "log-1" },
    ],
    users: [{ displayName: "Пользователь панели", id: "mock-user-1", login: "mock", roles: ["admin"], status: "active" }],
  };
}

function buildOverview(store: InventoryMockStore): InventoryOverviewDto {
  return {
    activeCustodyRecords: store.custodyRecords.filter((row) => row.status === "in_use").length,
    activeIssues: store.documents.filter((row) => row.type === "issue").length,
    attention: store.stock
      .filter((row) => row.stockAvailable <= 2)
      .map((row) => ({
        description: `Доступно ${row.stockAvailable} ${row.unit}`,
        id: `stock-${row.itemId}-${row.warehouseId}`,
        target: "inventory-items",
        title: row.itemName,
        tone: "warning",
      })),
    categoriesTotal: store.settings.categories.length,
    criticalStockItems: store.stock.filter((row) => row.stockAvailable <= 2).length,
    employeesTotal: store.employees.filter((row) => row.status !== "archived").length,
    itemsTotal: store.items.filter((row) => row.isActive).length,
    ppeCardsTotal: store.ppeCards.length,
    reportsReady: mockReports().length,
    unitsTotal: store.settings.units.length,
    warehousesTotal: store.settings.warehouses.length,
  };
}

function buildFacets(store: InventoryMockStore): InventoryItemFacetsDto {
  return {
    active: store.items.filter((row) => row.isActive).length,
    categories: facetRows(store.settings.categories, (refRow) => store.items.filter((itemRow) => itemRow.categoryId === refRow.id).length),
    inactive: store.items.filter((row) => !row.isActive).length,
    itemKinds: facetFromValues(store.items.map((row) => row.itemKind)),
    total: store.items.length,
    trackingTypes: facetFromValues(store.items.map((row) => row.trackingType)),
    units: facetRows(store.settings.units, (refRow) => store.items.filter((itemRow) => itemRow.unitId === refRow.id).length),
  };
}

function buildOperationsOptions(store: InventoryMockStore): InventoryOperationsModuleOptionsDto {
  return {
    employees: activeEmployees(store),
    items: activeItems(store),
    operationTypes: ["receipt", "return", "write_off", "issue"],
    settings: store.settings,
    stock: store.stock,
  };
}

async function buildImportPreview(store: InventoryMockStore, file: File): Promise<InventoryEmployeeImportPreviewDto> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!["csv", "txt", "xlsx"].includes(extension)) {
    return emptyImportPreview([`Неподдерживаемый формат файла: .${extension}`]);
  }

  const text = await file.text();
  if (!text.trim()) return emptyImportPreview(["Файл импорта пуст"]);
  if (extension === "xlsx" && !text.includes(";")) {
    return emptyImportPreview(["Mock-режим читает CSV/TXT; XLSX проверяется backend-интеграцией"]);
  }

  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const separator = lines[0]?.includes(";") ? ";" : ",";
  const headers = (lines[0] ?? "").split(separator).map(normalizeHeader);
  const rows: InventoryEmployeeImportPreviewRowDto[] = [];
  const errors: string[] = [];
  const seenNames = new Set<string>();
  const seenPersonnel = new Set<string>();
  for (let index = 1; index < lines.length; index += 1) {
    const values = lines[index].split(separator).map((value) => value.trim());
    const row = Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex] ?? ""]));
    const previewRow: InventoryEmployeeImportPreviewRowDto = {
      birthDate: readField(row, "дата рождения", "birthdate", "birth_date") || null,
      changeType: "create",
      department: readField(row, "подразделение", "department") || "Без подразделения",
      employeeGroup: readField(row, "группа", "организация", "employee_group", "company") || "Атом",
      error: "",
      fullName: readField(row, "фио", "сотрудник", "full_name", "name"),
      hiredAt: readField(row, "дата приема", "дата приёма", "hired_at", "hire_date") || null,
      personnelNo: readField(row, "табельный", "табель", "personnel_no", "number"),
      position: readField(row, "должность", "position") || "Сотрудник учета",
      rowNumber: index + 1,
    };
    if (!previewRow.fullName) previewRow.error = "Не указано ФИО";
    if (!previewRow.personnelNo) previewRow.personnelNo = `INV-${mockImportToken(previewRow.fullName).slice(0, 10)}`;
    const normalizedName = normalizeFullName(previewRow.fullName);
    if (!previewRow.error && seenNames.has(normalizedName)) previewRow.error = `Дублируется ФИО ${previewRow.fullName}`;
    if (!previewRow.error && seenPersonnel.has(normalize(previewRow.personnelNo))) previewRow.error = `Дублируется табельный номер ${previewRow.personnelNo}`;
    seenNames.add(normalizedName);
    seenPersonnel.add(normalize(previewRow.personnelNo));
    const existing = store.employees.find(
      (employeeRow) =>
        normalize(employeeRow.personnelNo) === normalize(previewRow.personnelNo)
        || normalizeFullName(employeeRow.fullName) === normalizedName,
    );
    previewRow.changeType = previewRow.error ? "error" : existing ? "update" : "create";
    if (previewRow.error) errors.push(`Строка ${previewRow.rowNumber}: ${previewRow.error}`);
    rows.push(previewRow);
  }

  const validRows = rows.filter((row) => !row.error);
  return {
    errors,
    newDepartments: newValues(validRows.map((row) => row.department), store.settings.employeeDepartments),
    newGroups: newValues(validRows.map((row) => row.employeeGroup), store.settings.employeeGroups),
    newPositions: newValues(validRows.map((row) => row.position), store.settings.employeePositions),
    newRows: validRows.filter((row) => row.changeType === "create").length,
    previewToken: mockImportToken(`${file.name}:${text}`),
    rows,
    rowsRead: rows.length,
    skippedRows: rows.filter((row) => row.error).length,
    updateRows: validRows.filter((row) => row.changeType === "update").length,
  };
}

function emptyImportPreview(errors: string[]): InventoryEmployeeImportPreviewDto {
  return {
    errors,
    newDepartments: [],
    newGroups: [],
    newPositions: [],
    newRows: 0,
    previewToken: "",
    rows: [],
    rowsRead: 0,
    skippedRows: errors.length,
    updateRows: 0,
  };
}

function updateCustodyDocument(documentId: string, status: string) {
  const store = readStore();
  const document = required(store.custodyDocuments.find((row) => row.id === documentId), "Акт под запись не найден");
  document.status = status;
  addHistory(store, "custody_document", "status_changed", `Статус акта: ${status}`, "Mock", document.id);
  writeStore(store);
  return Promise.resolve(document);
}

function createReference(key: ReferenceKey, name: string, parentId: string | null = null, code = "") {
  const store = readStore();
  const row = upsertReference(store.settings[key], name, code || parentId || "");
  writeStore(store);
  return row;
}

function updateReference(key: ReferenceKey, idValue: string, name: string, isArchived: boolean, code?: string) {
  const store = readStore();
  const row = required(store.settings[key].find((candidate) => candidate.id === idValue), "Справочник не найден");
  row.name = name;
  row.isActive = !isArchived;
  if (code !== undefined) row.code = code;
  writeStore(store);
  return row;
}

type ReferenceKey =
  | "categories"
  | "custodyCategories"
  | "employeeDepartments"
  | "employeeGroups"
  | "employeePositions"
  | "returnReasons"
  | "units"
  | "warehouses"
  | "writeOffReasons";

function employeeReferenceKey(kind: "position" | "department" | "group"): ReferenceKey {
  if (kind === "position") return "employeePositions";
  if (kind === "department") return "employeeDepartments";
  return "employeeGroups";
}

function mapItemPayload(payload: UpsertInventoryItemDto, itemId: string, store: InventoryMockStore): InventoryItemDto {
  const category = store.settings.categories.find((row) => row.id === payload.categoryId);
  const unit = store.settings.units.find((row) => row.id === payload.unitId);
  const existing = store.items.find((row) => row.id === itemId);
  return {
    actualItemName: payload.actualItemName ?? "",
    article: payload.article ?? "",
    balance: existing?.balance ?? 0,
    brandName: payload.brandName ?? "",
    category: category?.name ?? "",
    categoryId: payload.categoryId ?? null,
    clothingSize: payload.clothingSize ?? "",
    comment: payload.comment ?? "",
    defaultLifeMonths: payload.defaultLifeMonths ?? null,
    defaultUnitPriceMinor: payload.defaultUnitPriceMinor ?? null,
    gloveSize: payload.gloveSize ?? "",
    headSize: payload.headSize ?? "",
    heightSize: payload.heightSize ?? "",
    id: itemId,
    isActive: payload.isActive,
    isConsumable: payload.isConsumable,
    itemKind: payload.itemKind ?? "general",
    minStockQty: payload.minStockQty ?? null,
    modelName: payload.modelName ?? "",
    name: payload.name,
    normItemName: payload.normItemName ?? "",
    protectionClass: payload.protectionClass ?? "",
    respiratorSize: payload.respiratorSize ?? "",
    shoeSize: payload.shoeSize ?? "",
    sku: payload.sku ?? "",
    status: payload.isActive ? "active" : "inactive",
    stockAvailable: existing?.stockAvailable ?? 0,
    stockPhysical: existing?.stockPhysical ?? 0,
    stockReserved: existing?.stockReserved ?? 0,
    stockStatus: existing?.stockStatus ?? "normal",
    trackLife: payload.trackLife,
    trackingType: payload.trackingType ?? "stock",
    unit: unit?.code || unit?.name || "",
    unitId: payload.unitId ?? null,
  };
}

function upsertStock(store: InventoryMockStore, itemRow: InventoryItemDto, warehouse: InventoryReferenceOptionDto) {
  let stock = store.stock.find((row) => row.itemId === itemRow.id && row.warehouseId === warehouse.id);
  if (!stock) {
    stock = stockRow(itemRow, warehouse, 0);
    store.stock.push(stock);
  }
  return stock;
}

function adjustStock(store: InventoryMockStore, itemId: string, warehouseId: string, delta: number) {
  const itemRow = required(store.items.find((row) => row.id === itemId), "Позиция не найдена");
  const warehouse = required(store.settings.warehouses.find((row) => row.id === warehouseId), "Склад не найден");
  const stock = upsertStock(store, itemRow, warehouse);
  stock.stockPhysical += delta;
  stock.stockAvailable += delta;
  stock.balance = stock.stockAvailable;
  updateItemBalance(store, itemId);
}

function updateItemBalance(store: InventoryMockStore, itemId: string) {
  const itemRow = store.items.find((row) => row.id === itemId);
  if (!itemRow) return;
  const balances = store.stock.filter((row) => row.itemId === itemId);
  itemRow.stockPhysical = balances.reduce((sum, row) => sum + row.stockPhysical, 0);
  itemRow.stockReserved = balances.reduce((sum, row) => sum + row.stockReserved, 0);
  itemRow.stockAvailable = balances.reduce((sum, row) => sum + row.stockAvailable, 0);
  itemRow.balance = itemRow.stockAvailable;
  itemRow.stockStatus = itemRow.minStockQty !== null && itemRow.stockAvailable <= itemRow.minStockQty ? "critical" : "normal";
}

function pageRows<T>(rows: T[], params: InventoryListParams): InventoryListResponseDto<T> {
  const page = Math.max(1, Number(params.page ?? 1));
  const pageSize = Math.max(1, Number(params.pageSize ?? (rows.length || 25)));
  const total = rows.length;
  return {
    page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    pageSize,
    rows: rows.slice((page - 1) * pageSize, page * pageSize),
    total,
  };
}

function sortDocuments(rows: InventoryDocumentDto[]) {
  return [...rows].sort((left, right) => parseDateTime(right.createdAt) - parseDateTime(left.createdAt));
}

function parseDateTime(value?: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function isNegativeMovement(type: string) {
  return ["issue", "write_off", "defective", "lost", "broken", "failure", "ppe_write_off", "ppe_defective"].includes(type);
}

function filterByQuery<T>(rows: T[], query: string | undefined, fields: (row: T) => string[]) {
  const normalized = normalize(query ?? "");
  if (!normalized) return rows;
  return rows.filter((row) => fields(row).join(" ").toLowerCase().includes(normalized));
}

function activeReferences(rows: InventoryReferenceOptionDto[]) {
  return rows.filter((row) => row.isActive);
}

function activeEmployees(store: InventoryMockStore) {
  return store.employees.filter((row) => row.status !== "archived");
}

function activeItems(store: InventoryMockStore) {
  return store.items.filter((row) => row.isActive);
}

function latestCustodyRecordForItem(store: InventoryMockStore, itemId: string) {
  return store.custodyRecords
    .filter((row) => row.itemId === itemId)
    .sort((left, right) => new Date(right.issuedAt).getTime() - new Date(left.issuedAt).getTime())[0] ?? null;
}

function required<T>(value: T | undefined | null, message: string): T {
  if (!value) throw new Error(message);
  return value;
}

function ref(idValue: string, name: string, code = ""): InventoryReferenceOptionDto {
  return { code, id: idValue, isActive: true, name };
}

function employee(idValue: string, fullName: string, personnelNo: string, position: string, department: string, employeeGroup: string): InventoryEmployeeDto {
  return {
    birthDate: null,
    department,
    employeeGroup,
    fullName,
    hiredAt: "2024-01-15",
    id: idValue,
    personnelNo,
    position,
    status: "active",
  };
}

function item(
  idValue: string,
  name: string,
  sku: string,
  category: InventoryReferenceOptionDto,
  unit: InventoryReferenceOptionDto,
  balance: number,
  itemKind: string,
): InventoryItemDto {
  return {
    actualItemName: name,
    article: sku,
    balance,
    brandName: "",
    category: category.name,
    categoryId: category.id,
    clothingSize: "",
    comment: "",
    defaultLifeMonths: itemKind === "ppe" ? 12 : null,
    defaultUnitPriceMinor: null,
    gloveSize: "",
    headSize: "",
    heightSize: "",
    id: idValue,
    isActive: true,
    isConsumable: itemKind !== "custody",
    itemKind,
    minStockQty: 2,
    modelName: "",
    name,
    normItemName: name,
    protectionClass: "",
    respiratorSize: "",
    shoeSize: "",
    sku,
    status: "active",
    stockAvailable: balance,
    stockPhysical: balance,
    stockReserved: 0,
    stockStatus: balance <= 2 ? "critical" : "normal",
    trackLife: itemKind === "ppe",
    trackingType: "stock",
    unit: unit.code || unit.name,
    unitId: unit.id,
  };
}

function stockRow(itemRow: InventoryItemDto, warehouse: InventoryReferenceOptionDto, quantity: number): InventoryStockBalanceDto {
  return {
    balance: quantity,
    itemId: itemRow.id,
    itemName: itemRow.name,
    status: quantity <= 2 ? "critical" : "normal",
    stockAvailable: quantity,
    stockPhysical: quantity,
    stockReserved: 0,
    unit: itemRow.unit,
    warehouseId: warehouse.id,
    warehouseName: warehouse.name,
  };
}

function positionNorm(
  idValue: string,
  positionName: string,
  itemRow: InventoryItemDto,
  quantity: number,
  lifeMonths: number | null,
  normPoint: string,
  issuePeriodText: string,
  quantityText: string,
  isSectionTitle = false,
): InventorySettingsDto["positionNorms"][number] {
  return {
    id: idValue,
    issuePeriodText,
    isSectionTitle,
    itemId: itemRow.id,
    itemName: itemRow.name,
    lifeMonths,
    normItemName: itemRow.normItemName || itemRow.name,
    normPoint,
    positionName,
    quantity,
    quantityText,
  };
}

function history(idValue: string, entityType: string, action: string, description: string, actor: string, createdAt: string, entityId?: string | null): InventoryHistoryDto {
  return { action, actor, createdAt, description, entityId: entityId ?? null, entityType, id: idValue };
}

function addHistory(store: InventoryMockStore, entityType: string, action: string, description: string, actor: string, entityId?: string | null) {
  store.history.unshift(history(id("history"), entityType, action, description, actor, new Date().toISOString(), entityId));
}

function addSystemLog(store: InventoryMockStore, entityType: string, action: string, details: string) {
  store.systemLog.unshift({ action, actor: "Mock", createdAt: new Date().toISOString(), details, entityId: null, entityType, id: id("log") });
}

function upsertReference(rows: InventoryReferenceOptionDto[], name: string, code = "") {
  const existing = rows.find((row) => normalize(row.name) === normalize(name));
  if (existing) return existing;
  const created = ref(id("ref"), name, code);
  rows.push(created);
  return created;
}

function facetRows(rows: InventoryReferenceOptionDto[], count: (row: InventoryReferenceOptionDto) => number): InventoryFacetDto[] {
  return rows.map((row) => ({ count: count(row), id: row.id, name: row.name }));
}

function facetFromValues(values: string[]): InventoryFacetDto[] {
  return Array.from(new Set(values.filter(Boolean))).map((value) => ({
    count: values.filter((candidate) => candidate === value).length,
    id: value,
    name: value,
  }));
}

function newValues(values: string[], existing: InventoryReferenceOptionDto[]) {
  return Array.from(new Set(values.filter(Boolean))).filter(
    (value) => !existing.some((row) => normalize(row.name) === normalize(value)),
  );
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function normalizeFullName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeEmployeeStatus(value: string) {
  const normalized = normalize(value);
  if (["archived", "архив"].includes(normalized)) return "archived";
  if (["disabled", "отключен"].includes(normalized)) return "disabled";
  if (["inactive", "неактивен"].includes(normalized)) return "inactive";
  return "active";
}

function mockImportToken(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function normalizeHeader(value: string) {
  return normalize(value).replaceAll("ё", "е");
}

function readField(row: Record<string, string>, ...keys: string[]) {
  for (const key of keys.map(normalizeHeader)) {
    if (row[key]) return row[key].trim();
  }
  return "";
}

function cardSummary(card: InventoryPpeCardDetailDto): InventoryPpeCardDto {
  const activeLines = card.lines.filter((line) => line.status !== "archived");
  return {
    amountMinor: activeLines.reduce((sum, line) => sum + (line.amountMinor ?? (line.unitPriceMinor ?? 0) * line.quantity), 0),
    employeeId: card.employeeId,
    employeeName: card.employeeName,
    id: card.id,
    linesCount: activeLines.length,
    position: card.position,
    status: card.status,
    zeroPriceLines: activeLines.filter((line) => (line.unitPriceMinor ?? 0) <= 0).length,
  };
}

function buildMockPpeNormRows(
  store: InventoryMockStore,
  position: string,
  card: InventoryPpeCardDetailDto | null,
): InventoryPpeCardNormRowDto[] {
  const sourceRows = card?.normRows?.length
    ? card.normRows
    : store.settings.positionNorms
        .filter((row) => normalize(row.positionName) === normalize(position))
        .map((row, index) => ({
          brandModelArticle: "",
          coverageStatus: "not_issued" as const,
          defaultUnitPriceMinor: store.items.find((item) => item.id === row.itemId)?.defaultUnitPriceMinor ?? null,
          id: `mock-norm-${row.id}`,
          issuePeriodText: row.issuePeriodText ?? "",
          issuedQuantity: 0,
          lifeMonths: row.lifeMonths,
          mappedItemId: row.isSectionTitle ? null : row.itemId,
          mappedItemName: row.isSectionTitle ? "" : row.itemName,
          mappings: [],
          normItemName: row.normItemName || row.itemName,
          normPoint: row.normPoint ?? "",
          parentRowId: null,
          quantity: row.quantity,
          quantityText: row.quantityText ?? "",
          rowType: row.isSectionTitle ? "group" as const : "item" as const,
          sortOrder: index,
          sourceNormRowId: row.id,
        }));

  if (!sourceRows.length && card?.lines.length) {
    sourceRows.push(...card.lines.map((line, index) => ({
      brandModelArticle: line.brandModelArticle ?? line.modelDescription ?? "",
      coverageStatus: "not_issued" as const,
      defaultUnitPriceMinor: line.unitPriceMinor ?? null,
      id: line.cardNormRowId ?? `mock-legacy-norm-${line.id}`,
      issuePeriodText: line.issuePeriodText ?? "",
      issuedQuantity: 0,
      lifeMonths: null,
      mappedItemId: line.itemId,
      mappedItemName: line.itemName,
      mappings: [],
      normItemName: line.printItemName || line.itemName,
      normPoint: line.normPoint ?? "",
      parentRowId: null,
      quantity: line.quantity,
      quantityText: line.quantityText ?? `${line.quantity} ${line.unit}`,
      rowType: line.isSectionTitle ? "group" as const : "item" as const,
      sortOrder: index,
      sourceNormRowId: null,
    })));
  }

  let currentGroupId: string | null = null;
  return [...sourceRows]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((row) => {
      if (row.rowType === "group") currentGroupId = row.id;
      const issues = card?.lines.filter((line) =>
        line.cardNormRowId === row.id ||
        (!line.cardNormRowId && line.itemId === row.mappedItemId),
      ) ?? [];
      const issuedQuantity = issues
        .filter((line) => !["returned", "written_off", "archived"].includes(line.status))
        .reduce((sum, line) => sum + line.quantity, 0);
      const mappings = row.sourceNormRowId ? store.ppeMappings[row.sourceNormRowId] ?? [] : row.mappings;
      const defaultMapping = mappings.find((mapping) => mapping.isDefault) ?? mappings[0];
      return {
        ...row,
        brandModelArticle: defaultMapping?.brandModelArticle ?? row.brandModelArticle,
        coverageStatus: row.rowType === "group"
          ? "not_issued"
          : issuedQuantity <= 0
            ? "not_issued"
            : issuedQuantity < row.quantity
              ? "partial"
              : "issued",
        defaultUnitPriceMinor: defaultMapping?.defaultUnitPriceMinor ?? row.defaultUnitPriceMinor,
        issuedQuantity,
        mappedItemId: defaultMapping?.itemId ?? row.mappedItemId,
        mappedItemName: defaultMapping?.itemName ?? row.mappedItemName,
        mappings,
        parentRowId: row.rowType === "item" && !row.parentRowId ? currentGroupId : row.parentRowId,
      };
    });
}

function addMonthsIso(value: string, months: number) {
  const date = new Date(value);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString();
}

function ppeSummary(cards: InventoryPpeCardDetailDto[]): InventoryPpeSummaryDto {
  return cards.reduce<InventoryPpeSummaryDto>((summary, card) => {
    const activeLines = card.lines.filter((line) => line.status !== "archived");
    const hasLineStatus = (status: string) => activeLines.some((line) => line.status === status);
    const hasProblem =
      card.status === "warning" ||
      card.status === "overdue" ||
      card.status === "lost" ||
      activeLines.some((line) => (line.unitPriceMinor ?? 0) <= 0) ||
      activeLines.some((line) => ["lost", "overdue"].includes(line.status));

    return {
      active: summary.active + (card.status === "active" ? 1 : 0),
      issued: summary.issued + (card.status === "issued" || hasLineStatus("issued") ? 1 : 0),
      issuedLines: summary.issuedLines + activeLines.filter((line) => line.status === "issued").length,
      issuing: summary.issuing + (card.status === "issuing" || hasLineStatus("issuing") ? 1 : 0),
      linesTotal: summary.linesTotal + activeLines.length,
      notIssued: summary.notIssued + (card.status === "not_issued" || hasLineStatus("not_issued") ? 1 : 0),
      notIssuedLines: summary.notIssuedLines + activeLines.filter((line) => line.status === "not_issued").length,
      partial: summary.partial + (card.status === "partial" || hasLineStatus("partial") ? 1 : 0),
      problem: summary.problem + (hasProblem ? 1 : 0),
      returned: summary.returned + (card.status === "returned" || hasLineStatus("returned") ? 1 : 0),
      total: summary.total + 1,
      writtenOff: summary.writtenOff + (card.status === "written_off" || hasLineStatus("written_off") ? 1 : 0),
    };
  }, { ...emptyPpeSummary });
}

function mockReports(): InventoryReportDto[] {
  return [
    { description: "Остатки по складам", format: "xlsx", id: "stock", title: "Остатки" },
    { description: "Движения и операции", format: "xlsx", id: "movements", title: "Движения" },
    { description: "Карточки СИЗ", format: "xlsx", id: "ppe", title: "СИЗ" },
    { description: "Под запись", format: "xlsx", id: "custody", title: "Под запись" },
    { description: "Сотрудники учета", format: "xlsx", id: "employees", title: "Сотрудники" },
    { description: "Системный журнал", format: "xlsx", id: "system_log", title: "Системный журнал" },
  ];
}

function buildLegacyRun(dryRun: boolean): InventoryLegacyImportRunDto {
  return {
    completedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    dryRun,
    error: "",
    id: id("legacy"),
    rowsInserted: dryRun ? 0 : 1,
    rowsRead: 1,
    rowsSkipped: 0,
    rowsUpdated: 0,
    status: "completed",
    stockChecksum: "mock",
    tables: [
      {
        insertedRows: dryRun ? 0 : 1,
        message: "Mock legacy import",
        skippedRows: 0,
        sourceRows: 1,
        status: "completed",
        tableName: "inventory_items",
        updatedRows: 0,
      },
    ],
    tablesScanned: 1,
  };
}

function fileResponse(fileName: string, text: string): ApiFileResponse {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  return {
    blob,
    contentType: "text/plain;charset=utf-8",
    downloadName: fileName,
    fileName,
    headers: {},
  };
}

function nextNumber(prefix: string, value: number) {
  return `${prefix}-${String(value).padStart(4, "0")}`;
}

function operationLabel(type: string) {
  const labels: Record<string, string> = {
    issue: "Выдача",
    receipt: "Поступление",
    return: "Возврат",
    write_off: "Списание",
  };
  return labels[type] ?? type;
}

function id(prefix: string) {
  return `${prefix}-${createClientUuid()}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
