import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { isPpeIssueDocumentConfirmable, mergeServerLines, problemMessagesOf, toLineInput, validateDraftLines } from "../features/inventory/PpeIssueDocumentConstructor";
import { PpeIssueDocumentConstructor } from "../features/inventory/PpeIssueDocumentConstructor";
import { ApiError } from "../api/client";
import { InventoryRepositoryProvider } from "../repositories/inventoryRepositoryContext";
import { createMockInventoryRepository } from "../repositories/mockInventoryRepository";

describe("PPE issue document confirmation", () => {
  it("does not overwrite edits or resurrect removed lines after a delayed save", () => {
    const line = { id: "line", normRowId: "norm", itemId: "item", issueDate: "2026-09-08", quantity: 1, unitPriceMinor: 100, itemName: "Каска", normName: "Защита головы", unitSymbol: "шт.", approved: true };
    const document = { content: { lines: [line], normRows: [] } } as never;
    expect(mergeServerLines(document, [{ ...line, quantity: 3 }], [toLineInput(line)])[0].quantity).toBe(3);
    expect(mergeServerLines(document, [], [toLineInput(line)])).toEqual([]);
    const added = { ...line, id: "new" };
    expect(mergeServerLines(document, [line, added], [toLineInput(line)]).map((entry) => entry.id)).toEqual(["line", "new"]);
  });

  it("allows only a non-confirmed document with no server validation errors", () => {
    const clean = { status: "draft", validation: { errors: [] } };
    expect(isPpeIssueDocumentConfirmable(clean as never)).toBe(true);
    expect(isPpeIssueDocumentConfirmable({ ...clean, validation: { errors: [{ code: "price", lineId: "line", message: "Цена обязательна" }] } } as never)).toBe(false);
    expect(isPpeIssueDocumentConfirmable({ ...clean, status: "confirmed" } as never)).toBe(false);
  });

  it("renders ValidationProblemDetails fields and blocks manual control without a reason", () => {
    const error = new ApiError("Validation failed", 400, { problem: { errors: { normChanged: ["Подтвердите изменение нормы"], lines: ["Цена должна быть положительной"] } } });
    expect(problemMessagesOf(error)).toEqual(["Подтвердите изменение нормы", "lines: Цена должна быть положительной"]);
    expect(validateDraftLines([{ itemName: "Каска", manualControlConfirmed: true, exceptionReason: "" }] as never)).toContain("Каска");
    expect(validateDraftLines([{ itemName: "Каска", manualControlConfirmed: true, exceptionReason: "Переходный период" }] as never)).toBe("");
  });

  it("does not include server display fields in the persisted line fingerprint", () => {
    const input = toLineInput({ id: "line", normRowId: "norm", itemId: "item", issueDate: "2026-09-08", quantity: 1, unitPriceMinor: 100, itemName: "Каска", normName: "Защита головы", unitSymbol: "ед. не подтверждена", approved: true });
    expect(input).toEqual({ id: "line", normRowId: "norm", itemId: "item", issueDate: "2026-09-08", quantity: 1, unitPriceMinor: 100, sizeText: "", exceptionReason: "", manualControlConfirmed: false });
  });

  it("ignores stale norm list and norm detail responses", async () => {
    const storage = new Map<string, string>();
    Object.defineProperty(window, "localStorage", { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key), clear: () => storage.clear() } });
    const user = userEvent.setup();
    const repository = createMockInventoryRepository();
    const employeeA = { id: "employee-a", fullName: "Первый Сотрудник", personnelNo: "1", position: "A", department: "Цех", status: "active" };
    const employeeB = { ...employeeA, id: "employee-b", fullName: "Второй Сотрудник", personnelNo: "2", position: "B" };
    const normA = { id: "norm-a", positionName: "A", versionName: "1" };
    const normB1 = { id: "norm-b1", positionName: "B", versionName: "1" };
    const normB2 = { id: "norm-b2", positionName: "B", versionName: "2" };
    let releaseEmployeeA!: (value: unknown) => void;
    const employeeAGate = new Promise((resolve) => { releaseEmployeeA = resolve; });
    let releaseNormB1!: (value: unknown) => void;
    const normB1Gate = new Promise((resolve) => { releaseNormB1 = resolve; });
    vi.spyOn(repository, "getEmployees").mockResolvedValue({ rows: [employeeA, employeeB], total: 2, page: 1, pageSize: 200, pageCount: 1 } as never);
    vi.spyOn(repository, "getPpeIssueDocuments").mockResolvedValue([]);
    vi.spyOn(repository, "getPpeIssueDocumentNorms").mockImplementation((employeeId) => employeeId === employeeA.id ? employeeAGate as never : Promise.resolve([normB1, normB2] as never));
    vi.spyOn(repository, "getPpeNormSet").mockImplementation((id) => id === normB1.id ? normB1Gate as never : Promise.resolve(normDetailFixture(normB2.id, "Товар второй нормы") as never));
    vi.spyOn(repository, "createPpeIssueDocument").mockImplementation(async (payload) => ({
      id: "document", version: 1, status: "draft", createdAt: "2026-09-13T00:00:00Z", confirmedAt: null,
      content: { employee: { ...employeeB, details: payload.employeeDetails }, normSetId: payload.normSetId, normSetVersion: 1, normVersionName: "2", normSourceName: "test", documentDate: payload.documentDate, responsibleName: payload.responsibleName, basis: payload.basis, normRows: normDetailFixture(normB2.id, "Товар второй нормы").rows, lines: [] },
      validation: { errors: [], warnings: [], entitlements: [], totalMinor: 0 },
    } as never));

    render(createElement(InventoryRepositoryProvider, { value: repository }, createElement(PpeIssueDocumentConstructor, { canManage: true, onNavigate: vi.fn(), onNotify: vi.fn() })));
    const employeeSelect = await screen.findByLabelText("Сотрудник");
    await user.selectOptions(employeeSelect, employeeA.id);
    await user.selectOptions(employeeSelect, employeeB.id);
    expect(await screen.findByRole("option", { name: "B · 2" })).toBeInTheDocument();
    releaseEmployeeA([normA]);
    await waitFor(() => expect(screen.queryByRole("option", { name: "A · 1" })).not.toBeInTheDocument());

    const normSelect = screen.getByLabelText("Нормативный набор");
    await user.selectOptions(normSelect, normB1.id);
    await user.selectOptions(normSelect, normB2.id);
    await waitFor(() => expect(normSelect).toHaveValue(normB2.id));
    await user.click(screen.getByRole("button", { name: "Далее" }));
    expect(await screen.findByText("Товар второй нормы")).toBeInTheDocument();
    releaseNormB1(normDetailFixture(normB1.id, "Устаревший товар"));
    await waitFor(() => expect(screen.queryByText("Устаревший товар")).not.toBeInTheDocument());
  });
});

function normDetailFixture(id: string, itemName: string) {
  return {
    normSet: { id, positionName: "B", versionName: id, effectiveFrom: "2026-01-01", status: "active", rowsCount: 1 },
    rows: [{ id: `${id}-row`, parentRowId: null, rowType: "item", sortOrder: 1, normItemName: itemName, normPoint: "", issuePeriodText: "1 год", quantity: 1, quantityText: "1 шт.", lifeMonths: 12, unitSymbol: "шт.", mappings: [] }],
    itemRowsCount: 1, mappedItemRowsCount: 0, unmappedItemRowsCount: 1,
  };
}
