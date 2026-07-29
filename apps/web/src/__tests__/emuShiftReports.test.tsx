import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmuShiftReportsScreen } from "../features/emu/shift-reports/EmuShiftReportsScreen";

const mocks = vi.hoisted(() => ({ create: vi.fn(), getList: vi.fn(), getDetail: vi.fn(), getOptions: vi.fn() }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
vi.mock("../repositories/emuShiftReportsRepository", () => ({ createEmuShiftReportsRepository: () => mocks }));

const currentUser = { id: "user-1", displayName: "Admin", login: "admin", roles: ["admin"], permissions: [] };

describe("EmuShiftReportsScreen", () => {
  beforeEach(() => {
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
    mocks.getOptions.mockReset().mockResolvedValue({
      employees: [
        { id: "employee-1", fullName: "Иванов Иван", personnelNo: "1", position: "Слесарь", department: "ЭМУ", workerCategory: "mechanic" },
        { id: "employee-2", fullName: "Петров Пётр", personnelNo: "2", position: "Электромонтёр", department: "ЭМУ", workerCategory: "electrician" },
      ],
      sections: [{ id: "section-1", name: "Печной участок", code: "kiln", isActive: true, sortOrder: 1 }],
      shifts: [{ shiftType: "night", name: "Ночная", startTime: "20:00", endTime: "08:00", crossesMidnight: true }],
    });
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

    await user.selectOptions(screen.getByLabelText(/Сотрудник/), "employee-1");
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
    await user.selectOptions(screen.getByLabelText(/Сотрудник/), "employee-1");
    await user.type(screen.getAllByPlaceholderText("Что выполнено")[0], "Работа слесаря");
    await user.click(screen.getByRole("tab", { name: "Электрики" }));
    expect(localStorage.getItem("patrol360.emu.shift-report.draft.v1.last.mechanic")).not.toBeNull();
    await waitFor(() => expect(screen.getByLabelText(/Сотрудник/)).toHaveValue(""));
    await user.selectOptions(screen.getByLabelText(/Сотрудник/), "employee-2");
    await user.type(screen.getAllByPlaceholderText("Что выполнено")[0], "Работа электрика");
    await user.click(screen.getByRole("tab", { name: "Слесари" }));
    expect(localStorage.getItem("patrol360.emu.shift-report.draft.v1.last.electrician")).not.toBeNull();
    await waitFor(() => expect(screen.getByLabelText(/Сотрудник/)).toHaveValue("employee-1"));
    expect(screen.getAllByPlaceholderText("Что выполнено")[0]).toHaveValue("Работа слесаря");
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
    expect(await screen.findByRole("heading", { name: "История сменных отчётов" })).toBeInTheDocument();
    await screen.findByText("Иванов Иван");
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(4);

    const mechanic = screen.getByRole("button", { name: /Иванов Иван/ });
    const electrician = screen.getByRole("button", { name: /Петров Пётр/ });
    await user.click(mechanic);
    await user.click(electrician);
    expect(mechanic).toHaveAttribute("aria-expanded", "true");
    expect(electrician).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("Осмотр насоса")).toBeInTheDocument();
    expect(await screen.findByText("Проверка щита")).toBeInTheDocument();
    expect(mocks.getDetail).toHaveBeenCalledTimes(2);
  });

  it('does not submit twice while the first request is pending', async () => {
    const user = userEvent.setup();
    let resolveCreate: ((value: { id: string }) => void) | undefined;
    mocks.create.mockImplementation(() => new Promise((resolve) => { resolveCreate = resolve; }));
    render(<EmuShiftReportsScreen currentUser={currentUser} onNotify={vi.fn()} screen='emu-shift-report-entry' />);
    await screen.findByRole('heading', { name: 'Сменный отчёт' });
    await user.selectOptions(screen.getByLabelText(/Сотрудник/), 'employee-1');
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

  it('restores the entered draft after a page remount', async () => {
    const user = userEvent.setup();
    const first = render(<EmuShiftReportsScreen currentUser={currentUser} onNotify={vi.fn()} screen='emu-shift-report-entry' />);
    await screen.findByRole('heading', { name: 'Сменный отчёт' });
    await user.selectOptions(screen.getByLabelText(/Сотрудник/), 'employee-1');
    await user.type(screen.getAllByPlaceholderText('Что выполнено')[0], 'Проверка редуктора');
    window.dispatchEvent(new Event('pagehide'));
    expect(localStorage.getItem('patrol360.emu.shift-report.draft.v1.last.mechanic')).not.toBeNull();
    first.unmount();

    render(<EmuShiftReportsScreen currentUser={currentUser} onNotify={vi.fn()} screen='emu-shift-report-entry' />);
    expect(await screen.findByRole('heading', { name: 'Сменный отчёт' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/Сотрудник/)).toHaveValue('employee-1'));
    expect(screen.getAllByPlaceholderText('Что выполнено')[0]).toHaveValue('Проверка редуктора');
    expect(screen.getByRole('status')).toHaveTextContent(/Сохраняем|Черновик/);
  });
});
import { afterEach } from 'vitest';
