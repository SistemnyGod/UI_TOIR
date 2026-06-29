import { beforeEach, describe, expect, it } from "vitest";
import { createMockInventoryRepository } from "../repositories/mockInventoryRepository";

describe("mock Inventory repository", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", { configurable: true, value: createMemoryStorage() });
    Object.defineProperty(window, "sessionStorage", { configurable: true, value: createMemoryStorage() });
  });

  it("previews and confirms employee imports without duplicating personnel numbers", async () => {
    const repository = createMockInventoryRepository();
    const file = new File(
      [
        [
          "ФИО;Табель;Должность;Подразделение;Группа;Дата приема;Дата рождения",
          "Иванов Иван Иванович;T-001;Слесарь;Участок обогащения;Атом;2024-01-15;1990-02-20",
          "Смирнов Дмитрий Андреевич;M-101;Электромонтер;Энергоучасток;Атом Экология;2025-03-10;1991-02-03",
        ].join("\n"),
      ],
      "employees.csv",
      { type: "text/csv" },
    );

    const preview = await repository.previewEmployeesImport(file);
    expect(preview.rowsRead).toBe(2);
    expect(preview.updateRows).toBe(1);
    expect(preview.newRows).toBe(1);
    expect(preview.newPositions).toContain("Электромонтер");

    const result = await repository.importEmployees(file, preview.previewToken);
    expect(result.insertedRows).toBe(1);
    expect(result.updatedRows).toBe(1);

    const employees = await repository.getEmployees({ pageSize: 100 });
    expect(employees.rows.filter((row) => row.personnelNo === "T-001")).toHaveLength(1);
    expect(employees.rows.some((row) => row.fullName === "Смирнов Дмитрий Андреевич")).toBe(true);

    const settings = await repository.getSettings();
    expect(settings.employeePositions.some((row) => row.name === "Электромонтер")).toBe(true);
  });

  it("updates employees by full name instead of creating duplicates", async () => {
    const repository = createMockInventoryRepository();
    const file = new File(
      [
        [
          "ФИО;Табель;Должность;Подразделение;Группа",
          "Иванов Иван Иванович;T-777;Слесарь;Участок обогащения;Атом",
        ].join("\n"),
      ],
      "employees.csv",
      { type: "text/csv" },
    );

    const preview = await repository.previewEmployeesImport(file);
    expect(preview.updateRows).toBe(1);

    const directImport = await repository.importEmployees(file);
    expect(directImport.errors[0]).toContain("предпросмотра");

    const result = await repository.importEmployees(file, preview.previewToken);
    expect(result.insertedRows).toBe(0);
    expect(result.updatedRows).toBe(1);

    const employees = await repository.getEmployees({ pageSize: 100 });
    expect(employees.rows.filter((row) => row.fullName === "Иванов Иван Иванович")).toHaveLength(1);
    expect(employees.rows.find((row) => row.fullName === "Иванов Иван Иванович")?.personnelNo).toBe("T-777");
  });

  it("posts issue operations, updates stock, and writes history", async () => {
    const repository = createMockInventoryRepository();
    const before = await repository.getStock({ pageSize: 100 });
    const stockBefore = before.rows.find((row) => row.itemId === "item-helmet" && row.warehouseId === "wh-ppe");
    expect(stockBefore?.stockAvailable).toBe(24);

    const document = await repository.createOperation({
      comment: "Unit issue",
      employeeId: "emp-1",
      itemId: "item-helmet",
      quantity: 2,
      type: "issue",
      warehouseId: "wh-ppe",
    });

    expect(document.quantity).toBe(-2);
    expect(document.comment).toBe("Unit issue");

    const after = await repository.getStock({ pageSize: 100 });
    const stockAfter = after.rows.find((row) => row.itemId === "item-helmet" && row.warehouseId === "wh-ppe");
    expect(stockAfter?.stockAvailable).toBe(22);

    const history = await repository.getHistory({ pageSize: 100 });
    expect(history.rows.some((row) => row.action === "issue" && row.entityType === "stock_move")).toBe(true);
  });

  it("posts issue operations without warehouse as accounting movements", async () => {
    const repository = createMockInventoryRepository();
    const before = await repository.getStock({ pageSize: 100 });
    const stockBefore = before.rows.find((row) => row.itemId === "item-helmet" && row.warehouseId === "wh-ppe");

    const document = await repository.createOperation({
      comment: "No warehouse issue",
      employeeId: "emp-1",
      itemId: "item-helmet",
      quantity: 2,
      type: "issue",
      warehouseId: null,
    });

    expect(document.quantity).toBe(-2);
    expect(document.comment).toBe("No warehouse issue");
    expect(document.type).toBe("issue");
    expect(document.warehouseName).toBe("");

    const after = await repository.getStock({ pageSize: 100 });
    const stockAfter = after.rows.find((row) => row.itemId === "item-helmet" && row.warehouseId === "wh-ppe");
    expect(stockAfter?.stockAvailable).toBe(stockBefore?.stockAvailable);

    const documents = await repository.getDocuments({ pageSize: 100 });
    expect(documents.rows.some((row) => row.id === document.id && row.type === "issue")).toBe(true);

    const history = await repository.getHistory({ pageSize: 100 });
    expect(history.rows.some((row) => row.action === "issue" && row.entityType === "stock_move")).toBe(true);
  });

  it("returns movement documents sorted, filtered, and without reload duplicates", async () => {
    const repository = createMockInventoryRepository();

    const issue = await repository.createOperation({
      employeeId: "emp-1",
      itemId: "item-helmet",
      movedAt: "2026-01-10T10:00:00.000Z",
      quantity: 1,
      type: "issue",
      warehouseId: null,
    });
    const returned = await repository.createOperation({
      employeeId: "emp-1",
      itemId: "item-helmet",
      movedAt: "2026-01-12T10:00:00.000Z",
      quantity: 1,
      type: "return",
      warehouseId: null,
    });
    const defective = await repository.createOperation({
      comment: "Broken latch",
      employeeId: "emp-1",
      itemId: "item-helmet",
      movedAt: "2026-01-11T10:00:00.000Z",
      quantity: 1,
      type: "defective",
      warehouseId: null,
    });

    const documents = await repository.getDocuments({ pageSize: 100 });
    expect(documents.rows.map((row) => row.id).slice(0, 3)).toEqual([returned.id, defective.id, issue.id]);
    expect(new Set(documents.rows.map((row) => row.id)).size).toBe(documents.rows.length);

    const issueDocuments = await repository.getDocuments({ pageSize: 100, type: "issue" });
    expect(issueDocuments.rows).toHaveLength(1);
    expect(issueDocuments.rows[0].id).toBe(issue.id);

    const reloaded = await repository.getDocuments({ pageSize: 100 });
    expect(reloaded.rows.map((row) => row.id)).toEqual(documents.rows.map((row) => row.id));
  });

  it("creates custody records as active in-use items and writes scoped history", async () => {
    const repository = createMockInventoryRepository();

    const first = await repository.createCustodyRecord({
      comment: "Issued to shift",
      documentId: null,
      employeeId: "emp-1",
      itemId: "item-wrench",
      quantity: 1,
      warehouseId: null,
    });
    const second = await repository.createCustodyRecord({
      comment: "Separate employee record",
      documentId: null,
      employeeId: "emp-2",
      itemId: "item-wrench",
      quantity: 1,
      warehouseId: null,
    });

    expect(first.status).toBe("in_use");

    const active = await repository.getCustodyRecords({ pageSize: 100, status: "in_use" });
    expect(active.rows.some((row) => row.id === first.id)).toBe(true);

    const recordHistory = await repository.getCustodyRecordHistory(first.id, { pageSize: 100 });
    expect(recordHistory.rows).toHaveLength(1);
    expect(recordHistory.rows.every((row) => row.entityId === first.id)).toBe(true);
    expect(recordHistory.rows.some((row) => row.action === "created")).toBe(true);

    const secondRecordHistory = await repository.getCustodyRecordHistory(second.id, { pageSize: 100 });
    expect(secondRecordHistory.rows.every((row) => row.entityId === second.id)).toBe(true);
    expect(secondRecordHistory.rows.some((row) => row.entityId === first.id)).toBe(false);
  });

  it("updates custody lifecycle statuses and records each movement history event", async () => {
    const repository = createMockInventoryRepository();
    const returned = await repository.createCustodyRecord({
      employeeId: "emp-1",
      itemId: "item-wrench",
      quantity: 1,
      warehouseId: null,
    });
    const writtenOff = await repository.createCustodyRecord({
      employeeId: "emp-1",
      itemId: "item-wrench",
      quantity: 1,
      warehouseId: null,
    });
    const defective = await repository.createCustodyRecord({
      employeeId: "emp-1",
      itemId: "item-wrench",
      quantity: 1,
      warehouseId: null,
    });

    const returnedResult = await repository.updateCustodyRecordStatus(returned.id, { comment: "Returned clean", status: "returned" });
    const writeOffResult = await repository.updateCustodyRecordStatus(writtenOff.id, { comment: "Broken handle", status: "written_off" });
    const defectiveResult = await repository.updateCustodyRecordStatus(defective.id, { comment: "Needs repair", status: "lost" });

    expect(returnedResult.status).toBe("returned");
    expect(returnedResult.closedAt).toBeTruthy();
    expect(writeOffResult.status).toBe("written_off");
    expect(writeOffResult.comment).toBe("Broken handle");
    expect(defectiveResult.status).toBe("lost");
    expect(defectiveResult.comment).toBe("Needs repair");

    await repository.closeCustodyDocument(returned.documentId);

    const returnedHistory = await repository.getCustodyRecordHistory(returned.id, { pageSize: 100 });
    expect(returnedHistory.rows.map((row) => row.action)).toEqual(["returned", "created"]);

    const writtenOffHistory = await repository.getCustodyRecordHistory(writtenOff.id, { pageSize: 100 });
    expect(writtenOffHistory.rows.some((row) => row.action === "written_off" && row.entityId === writtenOff.id)).toBe(true);

    const defectiveHistory = await repository.getCustodyRecordHistory(defective.id, { pageSize: 100 });
    expect(defectiveHistory.rows.some((row) => row.action === "lost" && row.entityId === defective.id)).toBe(true);

    const documentHistory = await repository.getCustodyDocumentHistory(returned.documentId, { pageSize: 100 });
    expect(documentHistory.rows.every((row) => row.entityId === returned.documentId || row.entityId === returned.id)).toBe(true);
    expect(documentHistory.rows.some((row) => row.entityType === "custody_document" && row.entityId === returned.documentId)).toBe(true);
    expect(documentHistory.rows.some((row) => row.entityId === writtenOff.id || row.entityId === defective.id)).toBe(false);
  });

  it("archives employees without deleting historical events", async () => {
    const repository = createMockInventoryRepository();

    await repository.archiveEmployee("emp-1");

    const employees = await repository.getEmployees({ pageSize: 100, status: "archived" });
    expect(employees.rows.some((row) => row.id === "emp-1" && row.status === "archived")).toBe(true);

    const history = await repository.getHistory({ pageSize: 100 });
    expect(history.rows.some((row) => row.entityType === "employee" && row.action === "archived")).toBe(true);
  });
});

function createMemoryStorage(): Storage {
  const rows = new Map<string, string>();

  return {
    clear: () => rows.clear(),
    getItem: (key: string) => rows.get(key) ?? null,
    key: (index: number) => Array.from(rows.keys())[index] ?? null,
    get length() {
      return rows.size;
    },
    removeItem: (key: string) => {
      rows.delete(key);
    },
    setItem: (key: string, value: string) => {
      rows.set(key, value);
    },
  };
}
