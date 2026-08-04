import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmuShiftReportsScreen } from "../features/emu/shift-reports/EmuShiftReportsScreen";
import { ApiError } from '../api/client';

const mocks = vi.hoisted(() => ({ create: vi.fn(), getList: vi.fn(), getDetail: vi.fn(), getOptions: vi.fn(), getFavoriteEmployees: vi.fn(), addFavoriteEmployee: vi.fn(), removeFavoriteEmployee: vi.fn(), setEmployeeCategory: vi.fn(), saveDraft: vi.fn(), releaseDraft: vi.fn() }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
vi.mock("../repositories/emuShiftReportsRepository", () => ({ createEmuShiftReportsRepository: () => mocks }));

const currentUser = { id: "user-1", displayName: "Admin", login: "admin", roles: ["admin"], permissions: [] };

async function chooseEmployee(user: ReturnType<typeof userEvent.setup>, employeeId: string) {
  await user.click(screen.getByRole("combobox", { name: /Сотрудник/ }));
  await user.click(screen.getByRole("tab", { name: /Все сотрудники/ }));
  const option = document.querySelector<HTMLElement>(`[data-employee-id="${employeeId}"]`);
  if (!option) throw new Error(`Employee option ${employeeId} was not rendered`);
  await user.click(option);
}


describe("EmuShiftReportsScreen", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-07-29T12:00:00+05:00"));
    const storage = new Map<string, string>();
    Object.defineProperty(window, "localStorage", { configurable: true, value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    } });
    mocks.create.mockReset().mockResolvedValue({ id: "report-1" });
    mocks.getList.mockReset().mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 100, pageCount: 1 });
    mocks.getDetail.mockReset();
    mocks.getFavoriteEmployees.mockReset().mockResolvedValue([]);
    mocks.addFavoriteEmployee.mockReset().mockResolvedValue({ id: "favorite-created", employeeId: "employee-2", fullName: "", personnelNo: "", position: "", department: "", status: "active", isActive: true, createdAt: "2026-07-29T00:00:00Z" });
    mocks.removeFavoriteEmployee.mockReset().mockResolvedValue({});
    mocks.setEmployeeCategory.mockReset();
    mocks.saveDraft.mockReset().mockImplementation((payload) => Promise.resolve({ ...payload, id: 'draft-1', editorUserId: 'user-1', editorName: 'Admin', version: (payload.expectedVersion ?? 0) + 1, updatedAt: '2026-07-29T07:00:00Z', leaseExpiresAt: '2026-07-29T07:02:00Z' }));
    mocks.releaseDraft.mockReset().mockResolvedValue(undefined);
    mocks.getOptions.mockReset().mockResolvedValue({
      employees: [
        { id: "employee-1", fullName: "Иванов Иван", personnelNo: "1", position: "Слесарь", department: "ЭМУ", workerCategory: "mechanic" },
        { id: "employee-2", fullName: "Петров Пётр", personnelNo: "2", position: "Электромонтёр", department: "ЭМУ", workerCategory: "electrician" },
        { id: "employee-3", fullName: "Сидоров Семён", personnelNo: "0003", position: "Оператор-технолог", department: "Цех обжига", workerCategory: null },
        { id: "employee-4", fullName: "Фёдоров Алексей", personnelNo: "0042", position: "Мастер смены", department: "ЭМУ", workerCategory: null },
      ],
      sections: [{ id: "section-1", name: "Печной участок", code: "kiln", isActive: true, sortOrder: 1 }],
      shifts: [{ shiftType: "night", name: "Ночная", startTime: "20:00", endTime: "08:00", crossesMidnight: true }],
    });
  });

  it('filters the employee picker by the active report category', async () => {
    const user = userEvent.setup();
    render(<EmuShiftReportsScreen currentUser={currentUser} onNotify={vi.fn()} screen='emu-shift-report-entry' />);
    await screen.findByRole('heading', { name: 'Сменный отчёт' });

    await user.click(screen.getByRole('tab', { name: 'Электрики' }));
    await user.click(screen.getByRole('combobox', { name: /Сотрудник/ }));

    expect(screen.queryByRole('option', { name: /Иванов Иван/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Петров Пётр/ })).toBeInTheDocument();
  });
  it('deletes empty base rows immediately and confirms deletion of filled rows', async () => {
    const user = userEvent.setup();
    render(<EmuShiftReportsScreen currentUser={currentUser} onNotify={vi.fn()} screen='emu-shift-report-entry' />);
    await screen.findByRole('heading', { name: 'Сменный отчёт' });

    await waitFor(() => expect(screen.getAllByPlaceholderText('Что выполнено')).toHaveLength(5));
    await user.click(screen.getByRole('button', { name: 'Удалить строку 1' }));
    expect(screen.getAllByPlaceholderText('Что выполнено')).toHaveLength(4);

    await user.type(screen.getAllByPlaceholderText('Что выполнено')[0], 'Осмотр насоса');
    await user.click(screen.getByRole('button', { name: 'Удалить строку 1' }));
    expect(screen.getByRole('dialog', { name: 'Удалить строку?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Да' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Нет' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Нет' }));
    expect(screen.getAllByPlaceholderText('Что выполнено')).toHaveLength(4);

    await user.click(screen.getByRole('button', { name: 'Удалить строку 1' }));
    await user.click(screen.getByRole('button', { name: 'Да' }));
    expect(screen.getAllByPlaceholderText('Что выполнено')).toHaveLength(3);
  });
  it("keeps five base rows, validates partial rows, updates KPIs and sends minute durations", async () => {
    const user = userEvent.setup();
    let uuidSeed = 0;
    vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => { bytes.fill(++uuidSeed); return bytes; } });
    render(<EmuShiftReportsScreen currentUser={currentUser} onNotify={vi.fn()} screen="emu-shift-report-entry" />);
    await screen.findByRole("heading", { name: "Сменный отчёт" });
    await waitFor(() => expect(screen.getAllByPlaceholderText("Что выполнено")).toHaveLength(5));
    await user.click(screen.getByRole("button", { name: /Добавить строку/ }));
    expect(screen.getAllByPlaceholderText("Что выполнено")).toHaveLength(6);

    await chooseEmployee(user, "employee-1");
    const descriptions = screen.getAllByPlaceholderText("Что выполнено");
    await user.type(descriptions[0], "Осмотр насоса");
    await user.type(descriptions[1], "Регулировка оборудования");
    const hours = screen.getAllByLabelText("Часы");
    await user.type(hours[0], "1");

    const kpis = within(screen.getByLabelText("Сводка отчёта"));
    expect(kpis.getByText("2")).toBeInTheDocument();
    expect(kpis.getByText("1 ч")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Отправить отчёт" }));
    expect(mocks.create).not.toHaveBeenCalled();
    expect(screen.getByText("Укажите корректное время до 24 часов.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByLabelText("Часы")[1]).toHaveFocus());

    await user.type(screen.getAllByLabelText("Минуты")[1], "30");
    await user.click(screen.getByRole("button", { name: "Отправить отчёт" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create.mock.calls[0][0].lines).toEqual([
      expect.objectContaining({ workDescription: "Осмотр насоса", durationMinutes: 60 }),
      expect.objectContaining({ workDescription: "Регулировка оборудования", durationMinutes: 30 }),
    ]);
    expect(await screen.findByText("Сменный отчёт отправлен и добавлен в историю.")).toBeInTheDocument();
  });

  it("keeps mechanic and electrician drafts separate while switching tabs", async () => {
    const user = userEvent.setup();
    render(<EmuShiftReportsScreen currentUser={currentUser} onNotify={vi.fn()} screen="emu-shift-report-entry" />);
    await screen.findByRole("heading", { name: "Сменный отчёт" });
    await chooseEmployee(user, "employee-1");
    await user.type(screen.getAllByPlaceholderText("Что выполнено")[0], "Работа слесаря");
    await user.click(screen.getByRole("tab", { name: "Электрики" }));
    expect(localStorage.getItem("patrol360.emu.shift-report.draft.v1.user.user-1.last.mechanic")).not.toBeNull();
    await waitFor(() => expect(screen.getByLabelText(/Сотрудник/)).toHaveValue(""));
    await chooseEmployee(user, "employee-2");
    await user.type(screen.getAllByPlaceholderText("Что выполнено")[0], "Работа электрика");
    await user.click(screen.getByRole("tab", { name: "Слесари" }));
    expect(localStorage.getItem("patrol360.emu.shift-report.draft.v1.user.user-1.last.electrician")).not.toBeNull();
    await waitFor(() => expect(document.querySelector("[data-selected-employee-id='employee-1']")).toBeInTheDocument());
    expect(screen.getAllByPlaceholderText("Что выполнено")[0]).toHaveValue("Работа слесаря");
  });

  it("shows all employees and combines category, department and normalized local search", async () => {
    const user = userEvent.setup();
    render(<EmuShiftReportsScreen currentUser={currentUser} onNotify={vi.fn()} screen="emu-shift-report-entry" />);
    await screen.findByRole("heading", { name: "Сменный отчёт" });

    await user.click(screen.getByRole("button", { name: "Справочник сотрудников" }));
    const dialog = screen.getByRole("dialog", { name: "Справочник сотрудников ЭМУ" });
    expect(within(dialog).getByText("Иванов Иван")).toBeInTheDocument();
    expect(within(dialog).getByText("Петров Пётр")).toBeInTheDocument();
    expect(within(dialog).getByText("Сидоров Семён")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("tab", { name: /Электрики/ }));
    expect(within(dialog).getByText("Петров Пётр")).toBeInTheDocument();
    expect(within(dialog).queryByText("Иванов Иван")).not.toBeInTheDocument();

    const categoryTabs = within(dialog).getByRole("tablist", { name: "Категория сотрудников" });
    await user.click(within(categoryTabs).getByRole("tab", { name: /^Все/ }));
    const search = within(dialog).getByRole("combobox", { name: "Поиск сотрудника" });
    await user.type(search, "петров электромонтер");
    expect(within(dialog).getByText("Петров Пётр")).toBeInTheDocument();
    expect(within(dialog).getByText(/1 из 4 сотрудников/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Очистить поиск" }));
    await user.selectOptions(within(dialog).getByLabelText("Подразделение"), "Цех обжига");
    expect(within(dialog).getByText("Сидоров Семён")).toBeInTheDocument();
    expect(within(dialog).queryByText("Петров Пётр")).not.toBeInTheDocument();
  });
  it("assigns an employee to a report group and updates directory filters locally", async () => {
    const user = userEvent.setup();
    mocks.setEmployeeCategory.mockResolvedValueOnce({
      id: "employee-3",
      fullName: "Сидоров Семён",
      personnelNo: "0003",
      position: "Оператор-технолог",
      department: "Цех обжига",
      workerCategory: "mechanic",
      assignedWorkerCategory: "mechanic",
    });

    render(<EmuShiftReportsScreen currentUser={currentUser} onNotify={vi.fn()} screen="emu-shift-report-entry" />);
    await screen.findByRole("heading", { name: "Сменный отчёт" });
    await user.click(screen.getByRole("button", { name: "Справочник сотрудников" }));
    const dialog = screen.getByRole("dialog", { name: "Справочник сотрудников ЭМУ" });

    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: "Группа сотрудника Сидоров Семён" }),
      "mechanic",
    );

    await waitFor(() => expect(mocks.setEmployeeCategory).toHaveBeenCalledWith(
      "employee-3",
      { workerCategory: "mechanic" },
    ));
    await user.click(within(dialog).getByRole("tab", { name: /Слесари/ }));
    expect(within(dialog).getByText("Сидоров Семён")).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: "Группа сотрудника Сидоров Семён" })).toHaveValue("mechanic");
  });
  it("searches the favorite directory mode and toggles favorites without confirmation", async () => {
    const user = userEvent.setup();
    mocks.addFavoriteEmployee.mockResolvedValueOnce({
      id: "favorite-restored",
      employeeId: "employee-1",
      fullName: "Иванов Иван",
      personnelNo: "1",
      position: "Слесарь",
      department: "ЭМУ",
      status: "active",
      isActive: true,
      createdAt: "2026-07-29T00:00:00Z",
    });    mocks.getFavoriteEmployees.mockResolvedValue([{
      id: "favorite-1",
      employeeId: "employee-1",
      fullName: "Иванов Иван",
      personnelNo: "1",
      position: "Слесарь",
      department: "ЭМУ",
      status: "active",
      isActive: true,
      createdAt: "2026-07-29T00:00:00Z",
    }]);
    render(<EmuShiftReportsScreen currentUser={currentUser} onNotify={vi.fn()} screen="emu-shift-report-entry" />);
    await screen.findByRole("heading", { name: "Сменный отчёт" });

    await user.click(screen.getByRole("button", { name: "Справочник сотрудников" }));
    const dialog = screen.getByRole("dialog", { name: "Справочник сотрудников ЭМУ" });
    await user.click(within(dialog).getByRole("tab", { name: /Избранные/ }));
    expect(within(dialog).getByText("Иванов Иван")).toBeInTheDocument();
    expect(within(dialog).queryByText("Петров Пётр")).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("tab", { name: /Слесари/ }));
    await user.click(within(dialog).getByRole("button", { name: "Убрать Иванов Иван из избранных" }));
    await waitFor(() => expect(mocks.removeFavoriteEmployee).toHaveBeenCalledWith("employee-1"));
    await user.click(within(dialog).getByRole("tab", { name: /Все сотрудники/ }));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Добавить Иванов Иван в избранные" })).toBeInTheDocument());

    await user.click(within(dialog).getByRole("button", { name: "Добавить Иванов Иван в избранные" }));
    await waitFor(() => expect(mocks.addFavoriteEmployee).toHaveBeenCalledWith({ employeeId: "employee-1" }));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Убрать Иванов Иван из избранных" })).toBeInTheDocument());
  });

  it("keeps the previous favorite state and shows a retryable error when a star update fails", async () => {
    const user = userEvent.setup();
    mocks.addFavoriteEmployee.mockRejectedValueOnce(new Error("Не удалось сохранить избранного"));
    render(<EmuShiftReportsScreen currentUser={currentUser} onNotify={vi.fn()} screen="emu-shift-report-entry" />);
    await screen.findByRole("heading", { name: "Сменный отчёт" });

    await user.click(screen.getByRole("button", { name: "Справочник сотрудников" }));
    const dialog = screen.getByRole("dialog", { name: "Справочник сотрудников ЭМУ" });
    await user.click(within(dialog).getByRole("button", { name: "Добавить Иванов Иван в избранные" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Не удалось сохранить избранного");
    expect(within(dialog).getByRole("button", { name: "Добавить Иванов Иван в избранные" })).toBeInTheDocument();
  });

  it("prevents selecting an employee from another report category", async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    render(<EmuShiftReportsScreen currentUser={currentUser} onNotify={onNotify} screen="emu-shift-report-entry" />);
    await screen.findByRole("heading", { name: "Сменный отчёт" });

    await chooseEmployee(user, "employee-1");
    await user.type(screen.getAllByPlaceholderText("Что выполнено")[0], "Работа слесаря");
    await user.click(screen.getByRole("button", { name: "Справочник сотрудников" }));
    const dialog = screen.getByRole("dialog", { name: "Справочник сотрудников ЭМУ" });
    await user.click(within(dialog).getByRole("tab", { name: /Электрики/ }));
    await user.click(within(dialog).getByRole("option", { name: /Петров Пётр/ }));

    expect(document.querySelector("[data-selected-employee-id='employee-1']")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Слесари" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByPlaceholderText("Что выполнено")[0]).toHaveValue("Работа слесаря");
    expect(onNotify).toHaveBeenCalledWith(expect.stringContaining("Электрики"));
  });
  it("finds an unclassified employee by personnel number and selects with the keyboard", async () => {
    const user = userEvent.setup();
    render(<EmuShiftReportsScreen currentUser={currentUser} onNotify={vi.fn()} screen="emu-shift-report-entry" />);
    await screen.findByRole("heading", { name: "Сменный отчёт" });

    await user.click(screen.getByRole("button", { name: "Справочник сотрудников" }));
    const dialog = screen.getByRole("dialog", { name: "Справочник сотрудников ЭМУ" });
    const search = within(dialog).getByRole("combobox", { name: "Поиск сотрудника" });
    await user.type(search, "0003");
    expect(within(dialog).getByText("Сидоров Семён")).toBeInTheDocument();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(document.querySelector("[data-selected-employee-id='employee-3']")).toBeInTheDocument());
    expect(screen.getByRole("tab", { name: "Слесари" })).toHaveAttribute("aria-selected", "true");
  });
  it("keeps the history layout stable during the initial load and removes the eyebrow", async () => {
    let resolveList: ((value: { rows: []; total: number; page: number; pageSize: number; pageCount: number }) => void) | undefined;
    mocks.getList.mockImplementation(() => new Promise((resolve) => { resolveList = resolve; }));

    render(<EmuShiftReportsScreen currentUser={currentUser} onNotify={vi.fn()} screen="emu-shift-report-history" />);
    await waitFor(() => expect(mocks.getList).toHaveBeenCalledTimes(1), { timeout: 1200 });
    expect(mocks.getList.mock.calls[0][0]).toEqual(expect.objectContaining({ pageSize: 24 }));
    expect(document.querySelector('.emu-shift-header > div > span')).not.toBeInTheDocument();
    expect(document.querySelectorAll('.emu-history-loading')).toHaveLength(4);
    expect(document.querySelectorAll('.emu-history-empty')).toHaveLength(0);

    resolveList?.({ rows: [], total: 0, page: 1, pageSize: 100, pageCount: 1 });
    await waitFor(() => expect(document.querySelectorAll('.emu-history-empty')).toHaveLength(4));
  });

  it("selects one date range from a single calendar and navigates to past months", async () => {
    const user = userEvent.setup();
    render(<EmuShiftReportsScreen currentUser={currentUser} onNotify={vi.fn()} screen="emu-shift-report-history" />);
    await waitFor(() => expect(mocks.getList).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: /Период/ }));
    const calendar = screen.getByRole("dialog", { name: "Выбор периода отчётов" });
    await user.click(within(calendar).getByRole("button", { name: "Предыдущий месяц" }));
    expect(within(calendar).getByText("Июнь")).toBeInTheDocument();
    await user.click(within(calendar).getByRole("button", { name: "Следующий месяц" }));

    await user.click(within(calendar).getByRole("gridcell", { name: "20.07.2026" }));
    expect(within(calendar).getByText("Выберите окончание периода")).toBeInTheDocument();
    await user.click(within(calendar).getByRole("gridcell", { name: "25.07.2026" }));

    await waitFor(() => expect(mocks.getList).toHaveBeenLastCalledWith(expect.objectContaining({
      dateFrom: "2026-07-20",
      dateTo: "2026-07-25",
      page: 1,
    }), expect.anything()), { timeout: 1400 });

    await user.click(screen.getByRole("button", { name: "7 дней" }));
    await waitFor(() => expect(mocks.getList).toHaveBeenLastCalledWith(expect.objectContaining({
      dateFrom: "2026-07-23",
      dateTo: "2026-07-29",
    }), expect.anything()), { timeout: 1400 });
  });
  it("debounces search, skips one-character filters and aborts the stale request", async () => {
    const signals: AbortSignal[] = [];
    mocks.getList.mockImplementation((_params: unknown, options?: { signal?: AbortSignal }) => {
      if (options?.signal) signals.push(options.signal);
      return new Promise(() => undefined);
    });

    render(<EmuShiftReportsScreen currentUser={currentUser} onNotify={vi.fn()} screen="emu-shift-report-history" />);
    await waitFor(() => expect(mocks.getList).toHaveBeenCalledTimes(1), { timeout: 1200 });
    const search = document.querySelector<HTMLInputElement>('.emu-history-filters input[placeholder="Сотрудник, работа, участок"]');
    if (!search) throw new Error("History search input was not rendered");

    fireEvent.change(search, { target: { value: "а" } });
    expect(mocks.getList).toHaveBeenCalledTimes(1);
    expect(signals[0]?.aborted).toBe(true);

    fireEvent.change(search, { target: { value: "аб" } });
    await waitFor(() => expect(mocks.getList).toHaveBeenCalledTimes(2), { timeout: 1200 });
    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(true);
  });
  it("shows four history groups and keeps several reports expanded", async () => {
    const user = userEvent.setup();
    const summaries = [
      { id: "report-1", reportDate: "2026-07-29", shiftType: "day", workerCategory: "mechanic", employeeId: "employee-1", employeeName: "Иванов Иван", personnelNo: "1", position: "Слесарь", department: "ЭМУ", status: "submitted", workCount: 1, totalDurationMinutes: 60, createdByUserId: "user-1", createdByName: "Admin", submittedAt: "2026-07-29T08:00:00Z" },
      { id: "report-2", reportDate: "2026-07-29", shiftType: "night", workerCategory: "electrician", employeeId: "employee-2", employeeName: "Петров Пётр", personnelNo: "2", position: "Электромонтёр", department: "ЭМУ", status: "submitted", workCount: 1, totalDurationMinutes: 30, createdByUserId: "user-1", createdByName: "Admin", submittedAt: "2026-07-29T20:00:00Z" },
    ] as const;
    mocks.getList.mockResolvedValue({ rows: summaries, total: 2, page: 1, pageSize: 100, pageCount: 1 });
    mocks.getDetail.mockImplementation(async (id: string) => ({
      ...summaries.find((item) => item.id === id),
      lines: [{ id: `line-${id}`, sequenceNo: 1, workDescription: id === "report-1" ? "Осмотр насоса" : "Проверка щита", durationMinutes: id === "report-1" ? 60 : 30, sectionId: null, sectionName: "Печной участок", note: null }],
    }));

    render(<EmuShiftReportsScreen currentUser={currentUser} onNotify={vi.fn()} screen="emu-shift-report-history" />);
    await waitFor(() => expect(mocks.getList).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("checkbox", { name: "Только избранные" }));
    await waitFor(() => expect(mocks.getList).toHaveBeenCalledTimes(2));
    expect(mocks.getList.mock.calls[1][0]).toEqual(expect.objectContaining({
      dateFrom: "2026-07-29",
      dateTo: "2026-07-29",
      shiftType: "",
      workerCategory: "",
      search: "",
      favoriteOnly: true,
    }));    expect(await screen.findByRole("heading", { name: "История сменных отчётов" })).toBeInTheDocument();
    await screen.findByText("Иванов Иван");
    expect(document.querySelectorAll('.emu-history-row-list')).toHaveLength(2);
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(4);

    const mechanic = screen.getByRole("button", { name: /Иванов Иван/ });
    const electrician = screen.getByRole("button", { name: /Петров Пётр/ });
    await user.click(mechanic);
    await user.click(electrician);
    expect(mechanic).toHaveAttribute("aria-expanded", "true");
    expect(electrician).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("Осмотр насоса")).toBeInTheDocument();
    expect(await screen.findByText("Проверка щита")).toBeInTheDocument();
    const mechanicPanel = document.getElementById(mechanic.getAttribute("aria-controls") ?? "");
    expect(mechanicPanel).toHaveClass("is-open");
    await user.click(mechanic);
    expect(mechanicPanel).not.toHaveClass("is-open");
    expect(mechanicPanel).toBeInTheDocument();
    expect(screen.queryByText("Осмотр насоса")).not.toBeInTheDocument();
    expect(mocks.getDetail).toHaveBeenCalledTimes(2);
  });

  it('does not submit twice while the first request is pending', async () => {
    const user = userEvent.setup();
    let resolveCreate: ((value: { id: string }) => void) | undefined;
    mocks.create.mockImplementation(() => new Promise((resolve) => { resolveCreate = resolve; }));
    render(<EmuShiftReportsScreen currentUser={currentUser} onNotify={vi.fn()} screen='emu-shift-report-entry' />);
    await screen.findByRole('heading', { name: 'Сменный отчёт' });
    await chooseEmployee(user, 'employee-1');
    await user.type(screen.getAllByPlaceholderText('Что выполнено')[0], 'Осмотр насоса');
    await user.type(screen.getAllByLabelText('Часы')[0], '1');
    const submit = screen.getByRole('button', { name: 'Отправить отчёт' });
    await user.click(submit);
    await user.click(submit);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    resolveCreate?.({ id: 'report-1' });
    expect(await screen.findByText('Сменный отчёт отправлен и добавлен в историю.')).toBeInTheDocument();
  });

  it('localizes render failures and can reopen the feature', async () => {
    const brokenOptions = {
      get employees() { throw new Error('render failure'); },
      sections: [],
      shifts: [],
    };
    mocks.getOptions.mockResolvedValueOnce(brokenOptions);
    render(<EmuShiftReportsScreen currentUser={currentUser} onNotify={vi.fn()} screen='emu-shift-report-entry' />);
    expect(await screen.findByRole('heading', { name: 'Не удалось открыть сменные отчёты' })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Открыть повторно' }));
    expect(await screen.findByRole('heading', { name: 'Сменный отчёт' })).toBeInTheDocument();
  });

  it('retries options without reloading the page', async () => {
    mocks.getOptions.mockRejectedValueOnce(new Error('options unavailable'));
    render(<EmuShiftReportsScreen currentUser={currentUser} onNotify={vi.fn()} screen='emu-shift-report-entry' />);
    expect(await screen.findByText('options unavailable')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Повторить загрузку' }));
    expect(await screen.findByRole('heading', { name: 'Сменный отчёт' })).toBeInTheDocument();
    expect(mocks.getOptions).toHaveBeenCalledTimes(2);
  });

  it('retries a failed detail request and keeps the successful detail cached', async () => {
    const summary = { id: 'report-retry', reportDate: '2026-07-29', shiftType: 'day', workerCategory: 'mechanic', employeeId: 'employee-1', employeeName: 'Иванов Иван', personnelNo: '1', position: 'Слесарь', department: 'ЭМУ', status: 'submitted', workCount: 1, totalDurationMinutes: 45, createdByUserId: 'user-1', createdByName: 'Admin', submittedAt: '2026-07-29T08:00:00Z' } as const;
    mocks.getList.mockResolvedValue({ rows: [summary], total: 1, page: 1, pageSize: 100, pageCount: 1 });
    mocks.getDetail.mockRejectedValueOnce(new Error('detail unavailable')).mockResolvedValue({ ...summary, lines: [{ id: 'line-retry', sequenceNo: 1, workDescription: 'Проверка щита', durationMinutes: 45, sectionId: null, sectionName: 'Печной участок', note: null }] });
    const user = userEvent.setup();
    render(<EmuShiftReportsScreen currentUser={currentUser} onNotify={vi.fn()} screen='emu-shift-report-history' />);
    const report = await screen.findByRole('button', { name: /Иванов Иван/ });
    await user.click(report);
    expect(await screen.findByText('detail unavailable')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByText('Проверка щита')).toBeInTheDocument();
    await user.click(report);
    await user.click(report);
    expect(mocks.getDetail).toHaveBeenCalledTimes(2);
  });

  it('flushes the latest draft when the form unmounts before debounce', async () => {
    const user = userEvent.setup();
    const view = render(<EmuShiftReportsScreen currentUser={currentUser} onNotify={vi.fn()} screen='emu-shift-report-entry' />);
    await screen.findByRole('heading', { name: /.+/ });
    await chooseEmployee(user, 'employee-1');
    await user.type(screen.getAllByRole('textbox')[0], 'draft-before-unmount');

    view.unmount();

    const pointer = localStorage.getItem('patrol360.emu.shift-report.draft.v1.user.user-1.last.mechanic');
    expect(pointer).not.toBeNull();
    const saved = JSON.parse(localStorage.getItem(pointer as string) ?? 'null') as { version?: number; rows?: Array<{ description?: string }> };
    expect(saved.version).toBe(1);
    expect(saved.rows?.some((row) => row.description === 'draft-before-unmount')).toBe(true);
  });
  it('restores the entered draft after a page remount', async () => {
    const user = userEvent.setup();
    const first = render(<EmuShiftReportsScreen currentUser={currentUser} onNotify={vi.fn()} screen='emu-shift-report-entry' />);
    await screen.findByRole('heading', { name: 'Сменный отчёт' });
    await chooseEmployee(user, 'employee-1');
    await user.type(screen.getAllByPlaceholderText('Что выполнено')[0], 'Проверка редуктора');
    window.dispatchEvent(new Event('pagehide'));
    expect(localStorage.getItem('patrol360.emu.shift-report.draft.v1.user.user-1.last.mechanic')).not.toBeNull();
    first.unmount();

    render(<EmuShiftReportsScreen currentUser={currentUser} onNotify={vi.fn()} screen='emu-shift-report-entry' />);
    expect(await screen.findByRole('heading', { name: 'Сменный отчёт' })).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector("[data-selected-employee-id='employee-1']")).toBeInTheDocument());
    expect(screen.getAllByPlaceholderText('Что выполнено')[0]).toHaveValue('Проверка редуктора');
    expect(screen.getByRole('status')).toHaveTextContent(/Сохраняем|Черновик/);
  });
  it('restores a draft from the recovery copy when the pointer target is missing', async () => {
    const user = userEvent.setup();
    const first = render(<EmuShiftReportsScreen currentUser={currentUser} onNotify={vi.fn()} screen='emu-shift-report-entry' />);
    await screen.findByRole('heading', { name: 'Сменный отчёт' });
    await chooseEmployee(user, 'employee-1');
    await user.type(screen.getAllByPlaceholderText('Что выполнено')[0], 'Резервный черновик');
    window.dispatchEvent(new Event('pagehide'));

    const pointer = localStorage.getItem('patrol360.emu.shift-report.draft.v1.user.user-1.last.mechanic');
    expect(pointer).not.toBeNull();
    expect(localStorage.getItem('patrol360.emu.shift-report.draft.v1.user.user-1.recovery.mechanic')).not.toBeNull();
    localStorage.removeItem(pointer as string);
    first.unmount();

    render(<EmuShiftReportsScreen currentUser={currentUser} onNotify={vi.fn()} screen='emu-shift-report-entry' />);
    expect(await screen.findByRole('heading', { name: 'Сменный отчёт' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByPlaceholderText('Что выполнено')[0]).toHaveValue('Резервный черновик'));
  });

  it('grows report textareas as multiline content is entered', async () => {
    vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLTextAreaElement) {
      return this.value.includes('\n') ? 118 : 42;
    });
    render(<EmuShiftReportsScreen currentUser={currentUser} onNotify={vi.fn()} screen='emu-shift-report-entry' />);
    await screen.findByRole('heading', { name: 'Сменный отчёт' });

    const description = screen.getAllByPlaceholderText('Что выполнено')[0];
    const note = screen.getAllByPlaceholderText('Необязательно')[0];
    expect(description).toHaveClass('emu-autosize-textarea');
    expect(note).toHaveClass('emu-autosize-textarea');
    expect(description).toHaveStyle({ height: '42px' });

    fireEvent.change(description, { target: { value: 'Первая строка\nВторая строка' } });
    expect(description).toHaveStyle({ height: '118px' });
  });

  it('opens notification settings from the page header instead of rendering them in the form', async () => {
    const user = userEvent.setup();
    render(<EmuShiftReportsScreen currentUser={currentUser} onNotify={vi.fn()} screen='emu-shift-report-entry' />);
    await screen.findByRole('heading', { name: 'Сменный отчёт' });

    expect(screen.queryByText('Напоминание об отчёте')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Уведомления' }));
    const dialog = await screen.findByRole('dialog', { name: 'Настройки уведомлений' });
    expect(within(dialog).getByText('Включить напоминание')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Готово' }));
    expect(screen.queryByRole('dialog', { name: 'Настройки уведомлений' })).not.toBeInTheDocument();
  });
  it('shows a configured in-app reminder and lets the user dismiss it', async () => {
    localStorage.setItem('patrol360.emu.shift-report.reminder.v1', JSON.stringify({ enabled: true, time: '00:00', inApp: true, desktop: false }));
    const user = userEvent.setup();
    render(<EmuShiftReportsScreen currentUser={currentUser} onNotify={vi.fn()} screen='emu-shift-report-entry' />);

    const reminder = await screen.findByRole('alert');
    expect(reminder).toHaveTextContent('Пора отправить сменный отчёт');
    await user.click(within(reminder).getByRole('button', { name: 'Закрыть напоминание' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(localStorage.getItem('patrol360.emu.shift-report.reminder.dismissed.v1')).toBe('2026-07-29');
  });
  it('blocks submission when another computer owns the same report draft', async () => {
    const user = userEvent.setup();
    mocks.saveDraft.mockRejectedValue(new ApiError('Черновик уже редактируется', 409, { problem: { status: 409, title: 'Черновик уже редактируется', detail: 'Черновик уже редактирует Другой пользователь.' } }));
    render(<EmuShiftReportsScreen currentUser={currentUser} onNotify={vi.fn()} screen='emu-shift-report-entry' />);
    await screen.findByRole('heading', { name: 'Сменный отчёт' });
    await chooseEmployee(user, 'employee-1');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Другой пользователь'));
    expect(screen.getByRole('button', { name: 'Отправить отчёт' })).toBeDisabled();
    expect(localStorage.getItem('patrol360.emu.shift-report.draft.v1.user.user-1.last.mechanic')).not.toBeNull();
  });

});