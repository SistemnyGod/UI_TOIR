import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmployeeDirectoryItem } from "../types";
import { PercoIntegrationScreen } from "../features/perco/PercoIntegrationScreen";
import { buildPercoQuality, buildPresenceAnalytics, ClosePresenceModal, preserveMatchSelection, usePercoPagination } from "../features/perco/percoScreenSupport";
import { PercoAnalytics } from "../features/perco/PercoAnalytics";
import { percoDiagnostics, percoLogs, percoSettings, percoUnmatched } from "../../e2e/fixtures/perco";

const api = vi.hoisted(() => ({ getSettings: vi.fn(), getDiagnostics: vi.fn(), getLogs: vi.fn(), getUnmatchedEmployees: vi.fn(), updateSettings: vi.fn(), syncEmployees: vi.fn(), syncEvents: vi.fn(), testConnection: vi.fn(), checkSecret: vi.fn(), matchEmployee: vi.fn(), closePresenceInterval: vi.fn() }));
vi.mock("../repositories/percoRepository", () => ({ createPercoRepository: () => api }));
const employees = ["Иванов Иван Иванович", "Петров Андрей Сергеевич"].map((fullName, i) => ({ id: `emp-${i + 1}`, fullName, personnelNo: `10${i + 1}`, position: "Слесарь", department: "Производство", employeeGroup: "Основной" } as EmployeeDirectoryItem));
const user = { id: "owner-a", login: "admin", displayName: "Администратор", roles: ["admin"], permissions: [] };
const props = { currentUser: user, employeeDirectory: employees, onNotify: vi.fn() };
const ready = () => screen.findByRole("heading", { name: "Кто сейчас на территории" });

beforeEach(() => {
  Object.values(api).forEach(mock => mock.mockReset());
  api.getSettings.mockResolvedValue(percoSettings);
  api.getDiagnostics.mockResolvedValue(percoDiagnostics);
  api.getLogs.mockResolvedValue(percoLogs);
  api.getUnmatchedEmployees.mockResolvedValue(percoUnmatched);
  api.updateSettings.mockResolvedValue(percoSettings);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-13T10:24:00+05:00"));
});
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe("PERCo workspace continuity", () => {
  it("closes an accepted presence edit even when refreshing fails and blocks a second edit until reload", async () => {
    api.closePresenceInterval.mockResolvedValue({ success: true, message: "Интервал закрыт" }); render(<PercoIntegrationScreen {...props} />); await ready(); fireEvent.click(screen.getAllByRole("button", { name: "Закрыть вручную" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Закрыть присутствие вручную" }); fireEvent.change(within(dialog).getByRole("textbox", { name: "Причина" }), { target: { value: "Выход подтверждён оператором" } }); api.getDiagnostics.mockRejectedValueOnce(new Error("Не удалось обновить")); fireEvent.click(within(dialog).getByRole("button", { name: "Закрыть интервал" }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument()); expect(screen.getByRole("alert")).toHaveTextContent("Изменения сохранены"); expect(screen.queryByRole("button", { name: "Закрыть вручную" })).not.toBeInTheDocument(); api.getDiagnostics.mockResolvedValue({ ...percoDiagnostics, presenceIntervals: [] }); fireEvent.click(screen.getByRole("button", { name: "Обновить данные" })); await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument()); expect(api.closePresenceInterval).toHaveBeenCalledOnce();
  });
  it("keeps ignore confirmation pending, blocks duplicates and preserves it on rejection", async () => {
    let resolve!: (value: unknown) => void; api.matchEmployee.mockReturnValueOnce(new Promise(done => { resolve = done; })).mockResolvedValue({ success: true, message: "Сотрудник исключён" });
    render(<PercoIntegrationScreen {...props} />); await ready(); fireEvent.click(screen.getByRole("tab", { name: "Сопоставление" })); fireEvent.click(screen.getAllByRole("button", { name: "Игнорировать" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Игнорировать сотрудника PERCO?" }), confirm = within(dialog).getByRole("button", { name: "Игнорировать" }); fireEvent.click(confirm); fireEvent.click(confirm);
    expect(api.matchEmployee).toHaveBeenCalledOnce(); expect(dialog).toHaveAttribute("aria-busy", "true"); expect(within(dialog).getByRole("button", { name: "Закрыть" })).toBeDisabled(); fireEvent.keyDown(window, { key: "Escape" }); expect(dialog).toBeInTheDocument();
    await act(async () => resolve({ success: false, message: "Проверьте выбранного сотрудника" })); expect(within(dialog).getByRole("alert")).toHaveTextContent("Проверьте выбранного сотрудника"); expect(confirm).toBeEnabled();
    fireEvent.click(confirm); await waitFor(() => expect(dialog).not.toBeInTheDocument()); expect(api.matchEmployee).toHaveBeenCalledTimes(2);
  });
  it("does not repeat an accepted ignore when refreshing the queue fails", async () => {
    api.matchEmployee.mockResolvedValue({ success: true, message: "Сотрудник исключён" }); render(<PercoIntegrationScreen {...props} />); await ready(); fireEvent.click(screen.getByRole("tab", { name: "Сопоставление" }));
    api.getUnmatchedEmployees.mockRejectedValueOnce(new Error("Нет обновления")); fireEvent.click(screen.getAllByRole("button", { name: "Игнорировать" })[0]); fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Игнорировать" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument()); expect(screen.getByRole("alert")).toHaveTextContent("Изменения сохранены"); expect(screen.getAllByRole("button", { name: "Игнорировать" })).toHaveLength(1); expect(screen.getByRole("button", { name: "Игнорировать" })).toBeDisabled();
    api.getUnmatchedEmployees.mockResolvedValue(percoUnmatched.slice(1)); fireEvent.click(screen.getByRole("button", { name: "Обновить данные" })); await waitFor(() => expect(screen.getByRole("button", { name: "Игнорировать" })).toBeEnabled()); expect(api.matchEmployee).toHaveBeenCalledOnce();
  });
  it("ignores an old owner's pending match without refreshing or notifying the next owner", async () => {
    let resolve!: (value: unknown) => void; api.matchEmployee.mockReturnValue(new Promise(done => { resolve = done; })); const view = render(<PercoIntegrationScreen {...props} />); await ready();
    fireEvent.click(screen.getByRole("tab", { name: "Сопоставление" })); fireEvent.click(screen.getAllByRole("button", { name: "Игнорировать" })[0]); fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Игнорировать" }));
    view.rerender(<PercoIntegrationScreen {...props} currentUser={{ ...user, id: "owner-b" }} />); await ready(); const reads = api.getUnmatchedEmployees.mock.calls.length;
    await act(async () => resolve({ success: true, message: "Старый ответ" })); expect(api.getUnmatchedEmployees).toHaveBeenCalledTimes(reads); expect(props.onNotify).not.toHaveBeenCalled(); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("protects a manual matching choice and stops warning after restoring its original value", async () => {
    render(<PercoIntegrationScreen {...props} />); await ready(); fireEvent.click(screen.getByRole("tab", { name: "Сопоставление" })); const select = screen.getByRole("combobox", { name: "Сотрудник проекта для Иванов Иван Иванович" }); const original = (select as HTMLSelectElement).value;
    fireEvent.change(select, { target: { value: "" } }); const blocked = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(blocked); expect(blocked.defaultPrevented).toBe(true);
    fireEvent.change(select, { target: { value: original } }); const allowed = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(allowed); expect(allowed.defaultPrevented).toBe(false);
  });
  it("keeps employee and interval counts distinct when one employee has several disputed intervals", () => {
    const diagnostics = { ...percoDiagnostics, recentEvents: [], presenceIntervals: [
      { ...percoDiagnostics.presenceIntervals[5], id: "stale-one" },
      { ...percoDiagnostics.presenceIntervals[5], id: "stale-two" },
      percoDiagnostics.presenceIntervals[0], percoDiagnostics.presenceIntervals[6],
    ] };
    const analytics = buildPresenceAnalytics(diagnostics);
    const quality = buildPercoQuality(diagnostics, analytics);
    expect(quality.find(item => item.label === "актуальных интервалов требуют проверки")?.value).toBe("67%");
    expect(quality.find(item => item.label === "интервалов в выборке")?.value).toBe(4);
    render(<PercoAnalytics diagnostics={diagnostics} />);
    const people = screen.getByText("Спорные").closest("div")!;
    expect(within(people).getByText("1")).toBeInTheDocument();
  });
  it("preserves an edited settings form through refresh and saves zero tolerances without returning secrets", async () => {
    render(<PercoIntegrationScreen {...props} />); await ready();
    fireEvent.click(screen.getByRole("tab", { name: "Подключение" }));
    fireEvent.change(screen.getByLabelText("Адрес сервера PERCo"), { target: { value: "http://changed.example.test" } });
    fireEvent.change(screen.getByLabelText("Допуск начала смены, мин"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Допуск конца смены, мин"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Обновить данные" }));
    await waitFor(() => expect(api.getSettings).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "Обновить данные" })).toBeEnabled());
    expect(screen.getByLabelText("Адрес сервера PERCo")).toHaveValue("http://changed.example.test");
    expect(screen.getByText(/Есть несохранённые изменения/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить настройки" }));
    await waitFor(() => expect(api.updateSettings).toHaveBeenCalledOnce());
    expect(api.updateSettings).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: "http://changed.example.test", shiftStartToleranceMinutes: 0, shiftEndToleranceMinutes: 0, password: undefined, token: undefined }));
    await waitFor(() => expect(screen.queryByText(/Есть несохранённые изменения/)).not.toBeInTheDocument());
  });
  it("does not let an old owner's settings replace the new owner's form", async () => {
    let resolve!: (value: typeof percoSettings) => void;
    api.getSettings.mockReturnValueOnce(new Promise(done => { resolve = done; })).mockResolvedValueOnce({ ...percoSettings, baseUrl: "http://new-owner.example.test" });
    const view = render(<PercoIntegrationScreen {...props} />);
    view.rerender(<PercoIntegrationScreen {...props} currentUser={{ ...user, id: "owner-b" }} />);
    await ready();
    fireEvent.click(screen.getByRole("tab", { name: "Подключение" }));
    await waitFor(() => expect(screen.getByLabelText("Адрес сервера PERCo")).toHaveValue("http://new-owner.example.test"));
    await act(async () => resolve(percoSettings));
    expect(screen.getByLabelText("Адрес сервера PERCo")).toHaveValue("http://new-owner.example.test");
  });
  it("ignores a connection test response after changing the workspace owner", async () => {
    let resolve!: (value: unknown) => void;
    api.testConnection.mockReturnValue(new Promise(done => { resolve = done; }));
    const view = render(<PercoIntegrationScreen {...props} />); await ready();
    fireEvent.click(screen.getByRole("tab", { name: "Подключение" }));
    fireEvent.click(screen.getByRole("button", { name: "Проверить подключение" }));
    view.rerender(<PercoIntegrationScreen {...props} currentUser={{ ...user, id: "owner-b" }} />);
    await ready();
    await act(async () => resolve({ success: true, message: "Ответ предыдущего пользователя" }));
    expect(props.onNotify).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: "Дашборд" })).toHaveAttribute("aria-selected", "true");
  });
  it("preserves page during refresh, resets on filter change and clamps a shortened list", () => {
    const items = Array.from({ length: 35 }, (_, id) => ({ id }));
    const view = renderHook(({ items, filter }) => usePercoPagination(items, 10, filter), { initialProps: { items, filter: "all" } });
    act(() => view.result.current.setPage(3));
    view.rerender({ items: [...items], filter: "all" });
    expect(view.result.current.page).toBe(3);
    expect(view.result.current.pageItems[0].id).toBe(20);
    view.rerender({ items: [...items], filter: "inside" });
    expect(view.result.current.page).toBe(1);
    act(() => view.result.current.setPage(3));
    view.rerender({ items: items.slice(0, 5), filter: "inside" });
    expect(view.result.current.page).toBe(1);
  });
  it("preserves manual matching including a cleared suggestion and drops removed rows", () => {
    const selection = preserveMatchSelection(percoUnmatched, { "external-6": null, "external-7": "emp-2", removed: "old" });
    expect(selection).toEqual({ "external-6": null, "external-7": "emp-2" });
  });
  it("runs the full sync in employee/event order and stops when employee sync fails", async () => {
    const success = { success: true, status: "success", message: "Готово", loaded: 2, created: 0, updated: 0, inserted: 0, duplicates: 0, unmatched: 0, errors: 0, lastSyncAt: null };
    api.syncEmployees.mockResolvedValueOnce(success).mockResolvedValueOnce({ ...success, success: false });
    api.syncEvents.mockResolvedValue(success);
    render(<PercoIntegrationScreen {...props} />); await ready();
    fireEvent.click(screen.getByRole("tab", { name: "Синхронизация" }));
    fireEvent.click(screen.getByRole("button", { name: "Запустить полный цикл" }));
    await waitFor(() => expect(screen.getByText("Полный цикл завершён")).toBeVisible());
    expect(api.syncEmployees.mock.invocationCallOrder[0]).toBeLessThan(api.syncEvents.mock.invocationCallOrder[0]);
    fireEvent.click(screen.getByRole("button", { name: "Запустить полный цикл" }));
    await waitFor(() => expect(screen.getByText("Цикл остановлен после ошибки сотрудников")).toBeVisible());
    expect(api.syncEvents).toHaveBeenCalledOnce();
  });
  it("retains selected matching candidates even when the candidate search excludes them", async () => {
    render(<PercoIntegrationScreen {...props} />); await ready();
    fireEvent.click(screen.getByRole("tab", { name: "Сопоставление" }));
    const select = screen.getByRole("combobox", { name: "Сотрудник проекта для Иванов Иван Иванович" });
    fireEvent.change(select, { target: { value: "emp-2" } });
    fireEvent.change(screen.getByRole("searchbox", { name: "Фильтр кандидатов проекта" }), { target: { value: "неизвестный" } });
    expect(select).toHaveValue("emp-2");
    fireEvent.click(screen.getByRole("button", { name: "Обновить данные" }));
    await waitFor(() => expect(api.getUnmatchedEmployees).toHaveBeenCalledTimes(2));
    expect(select).toHaveValue("emp-2");
  });
  it("renders a stale open interval only once in diagnostics", async () => {
    render(<PercoIntegrationScreen {...props} />); await ready();
    fireEvent.click(screen.getByRole("tab", { name: "Проходы и смены" }));
    const heading = screen.getByRole("heading", { name: "Открытые и спорные интервалы" });
    const list = heading.closest("section")!;
    expect(within(list).getAllByText("Соколов Алексей Михайлович")).toHaveLength(1);
    expect(within(list).getAllByRole("button", { name: "Закрыть вручную" })).toHaveLength(5);
  });
  it("does not offer manual closing to a user with view permission only", async () => {
    render(<PercoIntegrationScreen {...props} currentUser={{ ...user, roles: [], permissions: ["integrations.perco.view"] }} />); await ready();
    expect(screen.queryByRole("button", { name: "Закрыть вручную" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Синхронизировать проходы" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Проходы и смены" }));
    expect(screen.queryByRole("button", { name: "Закрыть вручную" })).not.toBeInTheDocument();
  });
  it("keeps the close dialog above the workspace, validates time and prevents resubmission while saving", () => {
    const interval = percoDiagnostics.presenceIntervals[5];
    const onSubmit = vi.fn(); const onCancel = vi.fn();
    const common = { interval, onSubmit, onCancel, onChange: vi.fn() };
    const view = render(<ClosePresenceModal {...common} form={{ endedAt: "2026-10-20T09:00", comment: "Проверено" }} />);
    const dialog = screen.getByRole("dialog", { name: "Закрыть присутствие вручную" });
    expect(within(dialog).getByRole("button", { name: "Закрыть интервал" })).toBeDisabled();
    const endedAt = new Date("2026-10-13T09:00:00+05:00");
    const local = new Date(endedAt.getTime() - endedAt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    view.rerender(<ClosePresenceModal {...common} busy form={{ endedAt: local, comment: "Проверено" }} />);
    expect(within(dialog).getByRole("button", { name: "Сохраняем…" })).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("button", { name: "Закрыть" })).toBeDisabled();
  });
});
