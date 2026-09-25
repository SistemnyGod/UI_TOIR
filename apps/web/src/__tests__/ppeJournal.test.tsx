import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PpeIssueJournal } from "../features/inventory/ppe/PpeIssueJournal";
import { createMockInventoryRepository } from "../repositories/mockInventoryRepository";
import { InventoryRepositoryProvider } from "../repositories/inventoryRepositoryContext";
import type { PpeIssueJournalPage } from "../api/ppeJournalContracts";

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
