import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { formatDocumentStatus, formatNormQuantity, formatRuDate, isPpeIssueDocumentConfirmable, mergeServerLines, parsePriceInput, problemMessagesOf, toLineInput, validateDraftLines } from "../features/inventory/PpeIssueDocumentConstructor";
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
    expect(input).toEqual({ id: "line", normRowId: "norm", itemId: "item", issueDate: "2026-09-08", quantity: 1, unitPriceMinor: 100, sizeText: "", exceptionReason: "", manualControlConfirmed: false, lifeMonths: null });
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
    const employeeSelect = await screen.findByRole("combobox", { name: "Сотрудник" });
    const chooseEmployee = async (name: string) => {
      await user.click(employeeSelect);
      await user.click(await screen.findByRole("option", { name: new RegExp(name) }));
      if (screen.queryByRole("dialog", { name: "Сменить сотрудника?" })) await user.click(screen.getByRole("button", { name: "Сменить сотрудника" }));
    };
    await chooseEmployee("Первый Сотрудник");
    await chooseEmployee("Второй Сотрудник");
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

  it("keeps a restored draft read-only without manage permission or PUT mutations", async () => {
    const storage = new Map<string, string>();
    Object.defineProperty(window, "localStorage", { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key), clear: () => storage.clear() } });
    const repository = createMockInventoryRepository();
    const employee = { id: "employee", fullName: "Сотрудник", personnelNo: "1", position: "Монтажник", department: "Цех", status: "active" };
    const detail = normDetailFixture("norm", "Каска snapshot");
    (detail.rows[0].mappings as unknown[]) = [{ id: "mapping", normRowId: "norm-row", itemId: "item", itemName: "Каска readonly", itemSku: "PPE-1", brandModelArticle: "", isDefault: true, isApproved: true }];
    const restored = { id: "document", version: 4, status: "draft", createdAt: "2026-09-13T00:00:00Z", confirmedAt: null, content: { employee: { ...employee, details: { gender: "", height: "", clothingSize: "", shoeSize: "", headSize: "", respiratorSize: "", handProtectionSize: "" } }, normSetId: "norm", normSetVersion: 1, normVersionName: "1", normSourceName: "test", documentDate: "2026-09-13", responsibleName: "Ответственный", basis: "Приказ", normRows: detail.rows, lines: [] }, validation: { errors: [], warnings: [], entitlements: [], totalMinor: 0 } };
    vi.spyOn(repository, "getEmployees").mockResolvedValue({ rows: [employee], total: 1, page: 1, pageSize: 200, pageCount: 1 } as never);
    vi.spyOn(repository, "getPpeIssueDocument").mockResolvedValue(restored as never);
    vi.spyOn(repository, "getPpeIssueDocumentNorms").mockResolvedValue([{ id: "norm", positionName: "Монтажник", versionName: "1" }] as never);
    vi.spyOn(repository, "getPpeNormSet").mockResolvedValue(detail as never);
    vi.spyOn(repository, "getPpeIssueDocuments").mockResolvedValue([{ id: "document", version: 4, employeeId: employee.id, employeeName: "Сотрудник", documentDate: "2026-09-13", status: "confirmed", linesCount: 0, totalMinor: 0 }]);
    const update = vi.spyOn(repository, "updatePpeIssueDocument");

    render(createElement(InventoryRepositoryProvider, { value: repository }, createElement(PpeIssueDocumentConstructor, { currentUserId: "readonly", onNavigate: vi.fn(), onNotify: vi.fn() })));
    const employeeSelect = await screen.findByRole("combobox", { name: "Сотрудник" });
    expect(employeeSelect).toBeEnabled();
    const user = userEvent.setup();
    await user.click(employeeSelect);
    await user.click(await screen.findByRole("option", { name: /Сотрудник.*1/ }));
    const historyDocument = await screen.findByRole("button", { name: /13\.09\.2026.*Подтверждён.*0 строк/ });
    await userEvent.setup().click(historyDocument);
    await screen.findByText("Каска snapshot");
    expect(screen.queryByRole("button", { name: "Новая выдача" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Добавить полный комплект" })).not.toBeInTheDocument();
    const product = screen.getByText("Каска snapshot");
    expect(product.closest("button")).toBeNull();
    fireEvent.click(product);
    await new Promise((resolve) => window.setTimeout(resolve, 550));
    expect(update).not.toHaveBeenCalled();
  });

  it("serializes PDF preparation and keeps the prepared form labelled when the selection changes", async () => {
    const storage = new Map<string, string>([["patrol360.inventory.ppe.issue-document.preview-user", "document"]]);
    Object.defineProperty(window, "localStorage", { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key), clear: () => storage.clear() } });
    const repository = createMockInventoryRepository();
    const employee = { id: "employee", fullName: "Сотрудник", personnelNo: "1", position: "Монтажник", department: "Цех", status: "active" };
    const detail = normDetailFixture("norm", "Каска");
    const restored = { id: "document", version: 4, status: "confirmed", createdAt: "2026-09-13T00:00:00Z", confirmedAt: "2026-09-13T01:00:00Z", content: { employee: { ...employee, details: { gender: "", height: "", clothingSize: "", shoeSize: "", headSize: "", respiratorSize: "", handProtectionSize: "" } }, normSetId: "norm", normSetVersion: 1, normVersionName: "1", normSourceName: "test", documentDate: "2026-09-13", responsibleName: "Ответственный", basis: "Приказ", normRows: detail.rows, lines: [] }, validation: { errors: [], warnings: [], entitlements: [], totalMinor: 0 } };
    vi.spyOn(repository, "getEmployees").mockResolvedValue({ rows: [employee], total: 1, page: 1, pageSize: 200, pageCount: 1 } as never);
    vi.spyOn(repository, "getPpeIssueDocument").mockResolvedValue(restored as never);
    let releaseNorms!: (value: unknown) => void;
    let releaseSignature!: (value: unknown) => void;
    const norms = new Promise((resolve) => { releaseNorms = resolve; });
    const signature = new Promise((resolve) => { releaseSignature = resolve; });
    vi.spyOn(repository, "printPpeIssueDocument").mockImplementation((_id, type) => (type === "norms" ? norms : signature) as never);
    const createObjectURL = vi.fn((blob: Blob) => blob.size === 1 ? "blob:signature" : "blob:norms");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

    render(createElement(InventoryRepositoryProvider, { value: repository }, createElement(PpeIssueDocumentConstructor, { currentUserId: "preview-user", canExport: true, onNavigate: vi.fn(), onNotify: vi.fn() })));
    await screen.findByText("Выдача подтверждена");
    await userEvent.click(screen.getByRole("button", { name: "Подготовить выбранную форму" }));
    await userEvent.click(screen.getByRole("button", { name: /02 · Выдача и подписи/ }));
    expect(screen.getByRole("button", { name: "Подготовить выбранную форму" })).toBeDisabled();
    await act(async () => releaseNorms({ blob: new Blob(["norms"]), downloadName: "norms.pdf" }));
    await waitFor(() => expect(screen.getByTitle("Печатный PDF")).toHaveAttribute("src", "blob:norms"));
    expect(screen.getByRole("region", { name: "Подготовленный PDF" })).toHaveTextContent("Личная карточка · PDF");
    await userEvent.click(screen.getByRole("button", { name: "Подготовить выбранную форму" }));
    await act(async () => releaseSignature({ blob: new Blob(["s"]), downloadName: "signature.pdf" }));
    await waitFor(() => expect(screen.getByTitle("Печатный PDF")).toHaveAttribute("src", "blob:signature"));
    expect(screen.getByRole("region", { name: "Подготовленный PDF" })).toHaveTextContent("Выдача и подписи · PDF");
    expect(createObjectURL).toHaveBeenCalledTimes(2);
  });

  it("formats norm quantities, statuses, dates, and commits prices without rewriting partial input", () => {
    expect(formatNormQuantity({ quantity: 1, quantityText: "1 шт.", unitSymbol: "шт." })).toBe("1 шт.");
    expect(formatNormQuantity({ quantity: 2, quantityText: "", unitSymbol: "пара" })).toBe("2 пара");
    expect(formatDocumentStatus("confirmed")).toBe("Подтверждён");
    expect(formatRuDate("2026-09-13T10:00:00Z")).toBe("13.09.2026");
    expect(parsePriceInput("12,")).toBeUndefined();
    expect(parsePriceInput("12,5")).toBe(1250);
    expect(parsePriceInput("")).toBeNull();
  });
});

function normDetailFixture(id: string, itemName: string) {
  return {
    normSet: { id, positionName: "B", versionName: id, effectiveFrom: "2026-01-01", status: "active", rowsCount: 1 },
    rows: [{ id: `${id}-row`, parentRowId: null, rowType: "item", sortOrder: 1, normItemName: itemName, normPoint: "", issuePeriodText: "1 год", quantity: 1, quantityText: "1 шт.", lifeMonths: 12, unitSymbol: "шт.", mappings: [] }],
    itemRowsCount: 1, mappedItemRowsCount: 0, unmappedItemRowsCount: 1,
  };
}
