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
