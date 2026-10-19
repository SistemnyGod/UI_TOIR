import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { PpeIssueDocumentDto, SavePpeIssueDocumentDto } from "../api/contracts";
import { PpeIssueDocumentConstructor } from "../features/inventory/PpeIssueDocumentConstructor";
import { InventoryPpeCreateScreen } from "../features/inventory/InventoryPpeCreateScreen";
import { documentMatchesSave } from "../features/inventory/ppe/documentPersistence";
import { InventoryRepositoryProvider } from "../repositories/inventoryRepositoryContext";
import { createMockInventoryRepository } from "../repositories/mockInventoryRepository";

const employee = { id: "employee", fullName: "Тестовый сотрудник", personnelNo: "TEST-1", position: "Испытатель", department: "Тестовый цех", status: "active", employeeGroup: "", birthDate: null, hiredAt: null };
const details = { gender: "", height: "", clothingSize: "", shoeSize: "", headSize: "", respiratorSize: "", handProtectionSize: "" };
const norm = { id: "norm", positionName: employee.position, versionName: "test", status: "active" };
const fromRequest = (request: SavePpeIssueDocumentDto): PpeIssueDocumentDto => ({ id: request.clientDocumentId!, version: 1, status: "draft", createdAt: "2026-10-04T00:00:00Z", confirmedAt: null,
  content: { employee: { ...employee, details: request.employeeDetails ?? details }, normSetId: request.normSetId, normSetVersion: 1, normVersionName: "test", normSourceName: "synthetic", documentDate: request.documentDate, responsibleName: request.responsibleName, basis: request.basis, normRows: [], lines: [] },
  validation: { errors: [], warnings: [], entitlements: [], totalMinor: 0 } } as PpeIssueDocumentDto);

let storage: Map<string, string>;
beforeEach(() => {
  storage = new Map();
  for (const name of ["localStorage", "sessionStorage"]) Object.defineProperty(window, name, { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key), clear: () => storage.clear(),
  } });
});
afterEach(() => vi.restoreAllMocks());

function repositoryFixture() {
  const repository = createMockInventoryRepository();
  vi.spyOn(repository, "getEmployees").mockResolvedValue({ rows: [employee], page: 1, pageSize: 50, pageCount: 1, total: 1 } as never);
  vi.spyOn(repository, "getEmployee").mockResolvedValue(employee as never);
  vi.spyOn(repository, "getPpeIssueDocumentNorms").mockResolvedValue([norm] as never);
  vi.spyOn(repository, "getPpeNormSet").mockResolvedValue({ normSet: norm, rows: [], itemRowsCount: 0, mappedItemRowsCount: 0, unmappedItemRowsCount: 0 } as never);
  vi.spyOn(repository, "getPpeIssueDocuments").mockResolvedValue([]);
  return repository;
}
async function chooseEmployee() {
  fireEvent.click(screen.getByRole("combobox", { name: "Сотрудник" }));
  fireEvent.click(await screen.findByRole("option", { name: /Тестовый сотрудник/ }));
  await screen.findByRole("option", { name: /Испытатель · test/ });
  fireEvent.change(screen.getByRole("combobox", { name: "Нормативный набор" }), { target: { value: "norm" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Ответственный" }), { target: { value: "Тестовый ответственный" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Сохранить черновик" })).toBeEnabled());
}

describe("PPE recovery boundaries", () => {
  it("reconciles a lost POST using the UUID issued before the request", async () => {
    const repository = repositoryFixture(); let stored: PpeIssueDocumentDto;
    const create = vi.spyOn(repository, "createPpeIssueDocument").mockImplementation(async request => { stored = fromRequest(request); throw new Error("Lost response"); });
    const get = vi.spyOn(repository, "getPpeIssueDocument").mockImplementation(async () => stored!);
    render(<InventoryRepositoryProvider value={repository}><PpeIssueDocumentConstructor currentUserId="lost-post" canManage onNavigate={vi.fn()} onNotify={vi.fn()} /></InventoryRepositoryProvider>);
    await chooseEmployee(); fireEvent.click(screen.getByRole("button", { name: "Сохранить черновик" }));
    await screen.findByText(/Черновик · версия 1/);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].clientDocumentId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(get).toHaveBeenCalledWith(create.mock.calls[0][0].clientDocumentId);
    expect(screen.queryByText(/Не удалось сохранить/)).not.toBeInTheDocument();
  });

  it("ignores a save reply belonging to a previous user", async () => {
    const repository = repositoryFixture(); let resolve!: (value: PpeIssueDocumentDto) => void; let sent!: SavePpeIssueDocumentDto;
    vi.spyOn(repository, "createPpeIssueDocument").mockImplementation(request => { sent = request; return new Promise(done => { resolve = done; }); });
    vi.spyOn(repository, "getPpeIssueDocument").mockRejectedValue(new Error("Not stored yet"));
    const props = { canManage: true, onNavigate: vi.fn(), onNotify: vi.fn() };
    const view = render(<InventoryRepositoryProvider value={repository}><PpeIssueDocumentConstructor currentUserId="old-owner" {...props} /></InventoryRepositoryProvider>);
    await chooseEmployee(); fireEvent.click(screen.getByRole("button", { name: "Сохранить черновик" }));
    await waitFor(() => expect(resolve).toBeTypeOf("function"));
    view.rerender(<InventoryRepositoryProvider value={repository}><PpeIssueDocumentConstructor currentUserId="new-owner" {...props} /></InventoryRepositoryProvider>);
    await act(async () => resolve(fromRequest(sent)));
    expect(screen.queryByText(/Черновик · версия/)).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Ответственный" })).toHaveValue("");
    expect(props.onNotify).not.toHaveBeenCalled();
  });

  it("keeps a saved document successful when browser storage throws", async () => {
    Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new Error("Storage unavailable"); } });
    const repository = repositoryFixture(); const notify = vi.fn();
    vi.spyOn(repository, "createPpeIssueDocument").mockImplementation(async request => fromRequest(request));
    render(<InventoryRepositoryProvider value={repository}><PpeIssueDocumentConstructor currentUserId="storage-failed" canManage onNavigate={vi.fn()} onNotify={notify} /></InventoryRepositoryProvider>);
    await chooseEmployee(); fireEvent.click(screen.getByRole("button", { name: "Сохранить черновик" }));
    await screen.findByText(/Черновик · версия 1/);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("Документ сохранён в БД"));
    expect(screen.queryByText(/Не удалось сохранить/)).not.toBeInTheDocument();
  });

  it("keeps an existing document open across rerenders while issuance is disabled", async () => {
    const repository = repositoryFixture(); storage.set("ppe.open-document.readonly-disabled", "document");
    vi.spyOn(repository, "getPpeIssueDocumentCapabilities").mockResolvedValue({ enabled: false });
    const document = fromRequest({ employeeId: employee.id, normSetId: "norm", documentDate: "2026-10-04", basis: "Тест", responsibleName: "Тест", lines: [], clientDocumentId: "document" });
    vi.spyOn(repository, "getPpeIssueDocument").mockResolvedValue({ ...document, status: "confirmed" });
    const view = render(<InventoryRepositoryProvider value={repository}><InventoryPpeCreateScreen currentUserId="readonly-disabled" canExport onNavigate={vi.fn()} onNotify={vi.fn()} /></InventoryRepositoryProvider>);
    await screen.findByText("Выдача подтверждена");
    view.rerender(<InventoryRepositoryProvider value={repository}><InventoryPpeCreateScreen currentUserId="readonly-disabled" canExport onNavigate={vi.fn()} onNotify={vi.fn()} /></InventoryRepositoryProvider>);
    expect(screen.getByText("Выдача подтверждена")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Подтвердить выдачу/ })).not.toBeInTheDocument();
  });

  it("does not confuse another writer's version with the result of our timed-out save", () => {
    const request = { employeeId: employee.id, normSetId: "norm", documentDate: "2026-10-04", responsibleName: "Тест", basis: "Мой ввод", lines: [], clientDocumentId: "document" };
    const document = fromRequest(request);
    expect(documentMatchesSave(document, request)).toBe(true);
    expect(documentMatchesSave({ ...document, version: 8, content: { ...document.content, basis: "Другой ввод" } }, request)).toBe(false);
  });
});
