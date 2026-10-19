import { act, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { PpeIssueJournal } from "../features/inventory/ppe/PpeIssueJournal";
import { createMockInventoryRepository } from "../repositories/mockInventoryRepository";
import { InventoryRepositoryProvider } from "../repositories/inventoryRepositoryContext";
import type { PpeIssueJournalPage } from "../api/ppeJournalContracts";
import { readJournalColumns } from "../features/inventory/ppe/journal/journalColumns";
import type { PpeIssueDocumentDto } from "../api/contracts";
import type { ApiFileResponse } from "../api/client";

afterEach(() => vi.restoreAllMocks());

const row = { id: "document", employeeId: "employee-exact", employeeName: "Иванов Иван", personnelNo: "001", version: 1, status: "confirmed", documentDate: "2026-09-14", linesCount: 0, totalMinor: 0 };
function result(name = row.employeeName): PpeIssueJournalPage {
  return { items: [{ ...row, employeeName: name }], total: 230, page: 1, pageSize: 10, pageCount: 23, departments: ["Цех"], summary: { total: 230, confirmed: 200, draft: 30, cancelled: 0, overdue: 4 } };
}
function setup() {
  const repository = createMockInventoryRepository();
  vi.spyOn(repository, "getPpeIssueDocumentCapabilities").mockResolvedValue({ enabled: true });
  const journal = vi.spyOn(repository, "getPpeIssueJournal").mockResolvedValue(result());
  const view = () => render(<InventoryRepositoryProvider value={repository}><PpeIssueJournal canManage canExport onNavigate={vi.fn()} onNotify={vi.fn()} /></InventoryRepositoryProvider>);
  return { repository, journal, view };
}

describe("server PPE journal", () => {
  it("loads rows without waiting for capabilities and does not repeat capabilities on search", async () => {
    const { repository, journal, view } = setup();
    const capabilities = vi.mocked(repository.getPpeIssueDocumentCapabilities).mockReturnValue(new Promise(() => {}));
    view();
    await screen.findByRole("button", { name: "Иванов Иван" });
    fireEvent.change(screen.getByPlaceholderText("ФИО или табельный номер"), { target: { value: "Иванов" } });
    await waitFor(() => expect(journal).toHaveBeenLastCalledWith(expect.objectContaining({ query: "Иванов" }), expect.any(AbortSignal)));
    expect(capabilities).toHaveBeenCalledTimes(1);
  });

  it("retains the open document and table during background refresh", async () => {
    const { repository, journal, view } = setup();
    vi.spyOn(repository, "getPpeIssueDocument").mockResolvedValue(documentFixture());
    view();
    const employeeButton = await screen.findByRole("button", { name: "Иванов Иван" });
    journal.mockReturnValue(new Promise(() => {}));
    fireEvent.click(screen.getByRole("button", { name: "Обновить" }));
    fireEvent.click(employeeButton);
    const dialog = await screen.findByRole("dialog");
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(employeeButton).toBeInTheDocument();
    expect(employeeButton.closest("[aria-hidden='true']")).not.toBeNull();
    expect(screen.getByText("Обновление журнала…")).toBeInTheDocument();
  });

  it("opening a document does not invalidate an in-flight export", async () => {
    const { repository, view } = setup();
    let finish!: (value: ApiFileResponse) => void;
    vi.spyOn(repository, "exportPpeIssueJournal").mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    vi.spyOn(repository, "getPpeIssueDocument").mockResolvedValue(documentFixture());
    const download = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-journal");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    view(); await screen.findByRole("button", { name: "Иванов Иван" });
    const exportButton = screen.getByRole("button", { name: "Экспорт" });
    fireEvent.click(exportButton);
    fireEvent.click(screen.getByRole("button", { name: "Иванов Иван" }));
    await screen.findByRole("dialog");
    await act(async () => finish(fileFixture()));
    expect(download).toHaveBeenCalledTimes(1);
    expect(exportButton).toBeEnabled();
  });

  it("ignores document and export responses after the owner changes", async () => {
    const { repository } = setup();
    let finishDocument!: (value: PpeIssueDocumentDto) => void;
    let finishExport!: (value: ApiFileResponse) => void;
    vi.spyOn(repository, "getPpeIssueDocument").mockImplementation(() => new Promise(resolve => { finishDocument = resolve; }));
    vi.spyOn(repository, "exportPpeIssueJournal").mockImplementation(() => new Promise(resolve => { finishExport = resolve; }));
    const download = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const ui = (user: string) => <InventoryRepositoryProvider value={repository}><PpeIssueJournal currentUserId={user} canManage canExport onNavigate={vi.fn()} onNotify={vi.fn()} /></InventoryRepositoryProvider>;
    const view = render(ui("first")); await screen.findByRole("button", { name: "Иванов Иван" });
    fireEvent.click(screen.getByRole("button", { name: "Экспорт" }));
    fireEvent.click(screen.getByRole("button", { name: "Иванов Иван" }));
    view.rerender(ui("second"));
    await act(async () => { finishDocument(documentFixture()); finishExport(fileFixture()); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(download).not.toHaveBeenCalled();
  });

  it("rejects inherited and duplicate column names while preserving an explicit empty selection", () => {
    const getItem = vi.fn().mockReturnValue('["department","__proto__","toString","department",null,"total"]');
    vi.stubGlobal("localStorage", { getItem });
    try {
      expect(readJournalColumns("user")).toEqual(["department", "total"]);
      getItem.mockReturnValue("[]"); expect(readJournalColumns("user")).toEqual([]);
      getItem.mockImplementation(() => { throw new Error("storage denied"); });
      expect(readJournalColumns("user")).toEqual(["department", "date", "status", "quantity"]);
    } finally { vi.unstubAllGlobals(); }
  });
  it("requests server pages and shows full-filter totals", async () => {
    const { journal, view } = setup(); view();
    await screen.findByRole("button", { name: "Иванов Иван" });
    expect(screen.getByText("1 / 23")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    await waitFor(() => expect(journal).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, pageSize: 10 }), expect.any(AbortSignal)));
    fireEvent.change(screen.getByLabelText("На странице"), { target: { value: "100" } });
    await waitFor(() => expect(journal).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, pageSize: 100 }), expect.any(AbortSignal)));
  });

  it("uses exact employee id for history even with duplicate names", async () => {
    const { repository, journal, view } = setup();
    vi.spyOn(repository, "getPpeIssueDocument").mockResolvedValue({ ...row, createdAt: "", confirmedAt: "", content: { employee: { id: "employee-exact", fullName: "Иванов Иван", personnelNo: "001" }, documentDate: row.documentDate, lines: [], normRows: [] }, validation: {} } as never);
    view(); fireEvent.click(await screen.findByRole("button", { name: "Иванов Иван" }));
    fireEvent.click(await screen.findByRole("button", { name: "История сотрудника" }));
    await waitFor(() => expect(journal).toHaveBeenLastCalledWith(expect.objectContaining({ employeeId: "employee-exact", query: "" }), expect.any(AbortSignal)));
  });

  it("discards an obsolete search response and aborts its request", async () => {
    const { journal, view } = setup();
    let release!: (value: PpeIssueJournalPage) => void;
    journal.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    view(); await waitFor(() => expect(journal).toHaveBeenCalledTimes(1));
    const oldSignal = journal.mock.calls[0][1];
    fireEvent.change(screen.getByPlaceholderText("ФИО или табельный номер"), { target: { value: "Новый" } });
    journal.mockResolvedValue(result("Новый сотрудник"));
    await screen.findByRole("button", { name: "Новый сотрудник" });
    release(result("Устаревший сотрудник"));
    expect(oldSignal?.aborted).toBe(true);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Устаревший сотрудник" })).not.toBeInTheDocument());
  });
});

function documentFixture(): PpeIssueDocumentDto {
  return { ...row, createdAt: "", confirmedAt: "", content: {
    employee: { id: "employee-exact", fullName: "Иванов Иван", personnelNo: "001", department: "Цех", position: "Испытатель", details: { gender: "", height: "", clothingSize: "", shoeSize: "", headSize: "", respiratorSize: "", handProtectionSize: "" } },
    normSetId: "norm", normSetVersion: 1, normVersionName: "Тест", normSourceName: "Синтетический источник", responsibleName: "", basis: "",
    documentDate: row.documentDate, lines: [], normRows: [],
  }, validation: { errors: [], warnings: [], entitlements: [], totalMinor: 0 } };
}
function fileFixture(): ApiFileResponse { return { blob: new Blob(["test"]), fileName: "journal.csv", downloadName: "journal.csv", contentType: "text/csv", headers: {} }; }
