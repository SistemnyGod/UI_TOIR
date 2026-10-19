import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmuWorkspace } from "../hooks/useEmuWorkspace";
import type { EmuEmployeeOption } from "../features/emu/work-accounting/types";
import { EmuWorkAccountingScreen } from "../features/emu/EmuWorkAccountingScreen";
import { CreateWorkModal, EditWorkModal } from "../features/emu/work-accounting/modals/CreateEditWorkModals";
import { CompleteWorkModal, PauseWorkModal } from "../features/emu/work-accounting/modals/WorkLifecycleModals";
import { WorkDetailsModal } from "../features/emu/work-accounting/modals/WorkDetailsModal";
import { AddEmployeeToWorkModal, FinishEmployeeParticipationModal } from "../features/emu/work-accounting/modals/EmployeeParticipationModals";
import { WorkEmployeeActions } from "../features/emu/work-accounting/components/WorkEmployeeActions";
import { WorkHistoryPanel } from "../features/emu/work-accounting/components/WorkHistoryPanel";
import { EmployeePicker } from "../features/emu/work-accounting/components/EmployeePicker";
import { WorkCard } from "../features/emu/work-accounting/board/WorkCard";
import { useWorkMutation } from "../features/emu/work-accounting/useWorkMutation";
import { pageEmuWorkAudit } from "../domain/emuWorkAudit";
import { workAccountingNow, workAccountingSessions, workAccountingSettings } from "../../e2e/fixtures/workAccounting";

const employees = workAccountingSettings.favoriteEmployees.map(employee => ({ ...employee, id: employee.employeeId })) as EmuEmployeeOption[];
const user = { id: "operator-one", login: "operator", displayName: "Оператор", roles: ["admin"], permissions: [] };
function workspace(overrides: Partial<EmuWorkspace> = {}) {
  return { sourceMode: "mock", loading: false, settings: workAccountingSettings, workSessions: { rows: workAccountingSessions, total: workAccountingSessions.length }, auditEvents: [], shiftRemarks: { rows: [], total: 0 }, decisions: [], planTasks: [], dashboard: { metrics: [], recentEvents: [] }, refreshWorkBoard: vi.fn().mockResolvedValue(undefined), refreshPlanBoard: vi.fn().mockResolvedValue(undefined), actions: { createWorkSession: vi.fn().mockResolvedValue(workAccountingSessions[0]), updateWorkSession: vi.fn().mockResolvedValue(workAccountingSessions[0]), pauseWorkSession: vi.fn().mockResolvedValue(workAccountingSessions[0]), completeWorkSession: vi.fn().mockResolvedValue(workAccountingSessions[0]) }, ...overrides } as unknown as EmuWorkspace;
}
function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => Array.from(values.keys())[index] ?? null,
    removeItem: key => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(workAccountingNow));
  Object.defineProperty(window, "localStorage", { configurable: true, value: memoryStorage() });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("Work accounting workspace", () => {
  it("allows selecting employees after row 36 and preserves selection through a search", () => {
    const all = Array.from({ length: 75 }, (_, index) => ({ ...employees[0], id: `long-${index}`, fullName: `Сотрудник ${index}`, personnelNo: `${index}` }));
    function Picker({ visible }: { visible: EmuEmployeeOption[] }) { const [ids, setIds] = useState<string[]>([]); return <EmployeePicker allEmployees={all} employees={visible} sessions={[]} currentWorkId="" selectedIds={ids} setSelectedIds={setIds} />; }
    const view = render(<Picker visible={all} />);
    fireEvent.click(screen.getByRole("button", { name: "Вперед" }));
    fireEvent.click(screen.getByRole("button", { name: "Вперед" }));
    fireEvent.click(screen.getByRole("button", { name: /^Сотрудник 50 / }));
    view.rerender(<Picker visible={[all[0]]} />);
    expect(document.querySelector('.emu-selected-strip [title="Сотрудник 50"]')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Снять выбор" })).toBeInTheDocument();
  });
  it("keeps an employee busy when the board is filtered to another section", () => {
    render(<EmuWorkAccountingScreen currentUser={user} employeeDirectory={[]} onNotify={vi.fn()} workspace={workspace()} />);
    fireEvent.change(screen.getByRole("combobox", { name: /Участок/ }), { target: { value: "section-energy" } });
    expect(screen.getByRole("button", { name: /Иванов Андрей Сергеевич.*Статус: В работе/ })).toBeInTheDocument();
    expect(document.querySelectorAll(".emu-work-card")).toHaveLength(2);
  });
  it("restores employee search and availability filters after closing the inspector", () => {
    render(<EmuWorkAccountingScreen currentUser={user} employeeDirectory={[]} onNotify={vi.fn()} workspace={workspace()} />);
    fireEvent.change(screen.getByLabelText("Поиск сотрудников"), { target: { value: "Иванов" } });
    fireEvent.change(screen.getByLabelText("Фильтр занятости"), { target: { value: "working" } });
    fireEvent.click(screen.getByRole("button", { name: /Иванов Андрей Сергеевич.*Статус: В работе/ }));
    expect(screen.queryByLabelText("Поиск сотрудников")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Сотрудники$/ }));
    expect(screen.getByLabelText("Поиск сотрудников")).toHaveValue("Иванов");
    expect(screen.getByLabelText("Фильтр занятости")).toHaveValue("working");
  });
  it("keeps authorized favorites available when the general directory lacks them", () => {
    const directory = [{ ...employees[0], id: "directory-only", fullName: "Сотрудник общего справочника", initials: "СО", employeeGroup: "", birthDate: "", zone: "", routesDone: 0, routesTotal: 0, mobileStatus: "Не привязан" as const, lastSeen: "", phone: "", hiredAt: "", brigade: "", shift: "День", leader: "", email: "" }];
    render(<EmuWorkAccountingScreen currentUser={user} employeeDirectory={directory} onNotify={vi.fn()} workspace={workspace()} />);
    fireEvent.click(screen.getByRole("button", { name: "Открыть карточку ЭМУ-2026-0001" }));
    fireEvent.click(screen.getByRole("button", { name: "Добавить сотрудника" }));
    expect(within(screen.getByRole("dialog", { name: "Добавить сотрудника в работу" })).getByRole("button", { name: /Морозов Сергей Петрович/ })).toBeInTheDocument();
  });
  it("returns to the same work when a participant action is cancelled", () => {
    render(<EmuWorkAccountingScreen currentUser={user} employeeDirectory={[]} onNotify={vi.fn()} workspace={workspace()} />);
    fireEvent.click(screen.getByRole("button", { name: "Открыть карточку ЭМУ-2026-0003" }));
    fireEvent.click(screen.getByRole("button", { name: "Пауза — Соколов Дмитрий Викторович" }));
    expect(screen.getByRole("dialog", { name: "Поставить на паузу" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(screen.getByRole("dialog", { name: "Карточка работы" })).toHaveAccessibleDescription("ЭМУ-2026-0003 · Ремонтный участок");
  });
  it("does not offer participant operations for finished or mistakenly added people", () => {
    const props = { permissions: { canPause: true, canComplete: true, canUpdate: true }, onAction: vi.fn() };
    const employee = workAccountingSessions[0].employees[0];
    const view = render(<WorkEmployeeActions {...props} employee={{ ...employee, finishedAt: workAccountingNow }} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    view.rerender(<WorkEmployeeActions {...props} employee={{ ...employee, participationStatus: "Добавлен ошибочно" }} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    view.rerender(<WorkEmployeeActions {...props} employee={employee} permissions={{ canPause: true, canComplete: false, canUpdate: false }} />);
    fireEvent.click(screen.getByRole("button", { name: "Пауза — Иванов Андрей Сергеевич" }));
    expect(props.onAction).toHaveBeenCalledWith("pause", "employee-1");
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
  it("hides mutation controls in a completed work even for an operator", () => {
    const controls = { canUpdate: true, canPause: true, canComplete: true, onEdit: vi.fn(), onComplete: vi.fn(), onAddEmployee: vi.fn(), onEmployeeAction: vi.fn() };
    render(<WorkDetailsModal controls={controls} canViewAudit now={new Date(workAccountingNow)} onClose={vi.fn()} workspace={workspace()} work={{ ...workAccountingSessions[0], completedAt: workAccountingNow, resultStatus: "Выполнено" }} />);
    expect(screen.queryByRole("button", { name: "Изменить" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Добавить сотрудника" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /Действия:/ })).not.toBeInTheDocument();
  });
  it("keeps the chosen addition visible after searching and submits that employee", async () => {
    const store = workspace();
    store.actions.addWorkSessionEmployee = vi.fn().mockResolvedValue(workAccountingSessions[0]);
    const close = vi.fn();
    render(<AddEmployeeToWorkModal employeeOptions={employees} onClose={close} onNotify={vi.fn()} workspace={store} work={workAccountingSessions[0]} />);
    fireEvent.click(screen.getByRole("button", { name: /Морозов Сергей Петрович/ }));
    fireEvent.change(screen.getByLabelText("Поиск сотрудника"), { target: { value: "Волков" } });
    expect(document.querySelector('.emu-selected-strip [title="Морозов Сергей Петрович"]')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Комментарий"), { target: { value: "Помощь при ремонте" } });
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(store.actions.addWorkSessionEmployee).toHaveBeenCalledWith("work-1", expect.objectContaining({ employeeId: "employee-7" }));
  });
  it("sets both the date and time to now when adding an employee", () => {
    render(<AddEmployeeToWorkModal employeeOptions={employees} onClose={vi.fn()} onNotify={vi.fn()} workspace={workspace()} work={workAccountingSessions[0]} />);
    fireEvent.change(screen.getByLabelText("Дата начала"), { target: { value: "2026-10-12" } });
    fireEvent.click(screen.getByRole("button", { name: "Сейчас" }));
    expect(screen.getByLabelText("Дата начала")).toHaveValue("2026-10-13");
  });
  it("sets both the date and time to now when finishing an employee", async () => {
    const store = workspace();
    store.actions.finishWorkSessionEmployee = vi.fn().mockResolvedValue(workAccountingSessions[0]);
    render(<FinishEmployeeParticipationModal employee={workAccountingSessions[0].employees[0]} onClose={vi.fn()} onNotify={vi.fn()} workspace={store} work={workAccountingSessions[0]} />);
    fireEvent.change(screen.getByLabelText("Дата"), { target: { value: "2026-10-12" } });
    fireEvent.click(screen.getByRole("button", { name: "Сейчас" }));
    expect(screen.getByLabelText("Дата")).toHaveValue("2026-10-13");
    fireEvent.change(screen.getByLabelText("Причина / комментарий"), { target: { value: "Работа завершена" } });
    fireEvent.click(screen.getByRole("button", { name: "Завершить участие" }));
    await waitFor(() => expect(store.actions.finishWorkSessionEmployee).toHaveBeenCalledWith("work-1", "employee-1", expect.objectContaining({ finishedAt: new Date(workAccountingNow).toISOString() })));
  });
  it("keeps create input and shows its API error in the dialog", async () => {
    const store = workspace();
    vi.mocked(store.actions.createWorkSession).mockRejectedValue(new Error("Нет соединения с сервером"));
    const close = vi.fn();
    render(<CreateWorkModal employeeOptions={employees} onClose={close} onNotify={vi.fn()} workspace={store} />);
    fireEvent.click(screen.getByRole("button", { name: /Морозов Сергей Петрович/ }));
    fireEvent.change(screen.getByLabelText("Задача / ожидаемый результат"), { target: { value: "Осмотреть привод" } });
    fireEvent.click(screen.getByRole("button", { name: "Создать работу" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Нет соединения с сервером");
    expect(screen.getByLabelText("Задача / ожидаемый результат")).toHaveValue("Осмотреть привод");
    expect(close).not.toHaveBeenCalled();
  });
  it("clears the saved draft immediately after successful creation, before unmount", async () => {
    const store = workspace();
    function Harness() { const [open, setOpen] = useState(true); return open ? <CreateWorkModal draftStorageKey="test-draft-owner" employeeOptions={employees} onClose={() => setOpen(false)} onNotify={vi.fn()} workspace={store} /> : <p>Закрыто</p>; }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Морозов Сергей Петрович/ }));
    fireEvent.change(screen.getByLabelText("Задача / ожидаемый результат"), { target: { value: "Осмотреть привод" } });
    expect(JSON.parse(window.localStorage.getItem("test-draft-owner")!).value.taskDescription).toBe("Осмотреть привод");
    fireEvent.click(screen.getByRole("button", { name: "Создать работу" }));
    await screen.findByText("Закрыто");
    expect(JSON.parse(window.localStorage.getItem("test-draft-owner")!).value).toMatchObject({ taskDescription: "", employeeIds: [] });
  });
  it("does not turn a browser storage failure into a failed server save", async () => {
    const store = workspace();
    const close = vi.fn();
    render(<CreateWorkModal employeeOptions={employees} onClose={close} onNotify={vi.fn()} workspace={store} />);
    fireEvent.click(screen.getByRole("button", { name: /Морозов Сергей Петрович/ }));
    fireEvent.change(screen.getByLabelText("Задача / ожидаемый результат"), { target: { value: "Осмотреть привод" } });
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => { throw new Error("Storage unavailable"); });
    fireEvent.click(screen.getByRole("button", { name: "Создать работу" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(store.actions.createWorkSession).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("restores only a draft belonging to the current owner", () => {
    const draft = { employeeIds: ["employee-7"], sectionId: "section-repair", taskDescription: "Черновик другого пользователя", time: "13:30", workDate: "2026-10-13" };
    window.localStorage.setItem("draft-owner-a", JSON.stringify({ version: 1, value: draft }));
    render(<CreateWorkModal draftStorageKey="draft-owner-b" employeeOptions={employees} onClose={vi.fn()} onNotify={vi.fn()} workspace={workspace()} />);
    expect(screen.getByLabelText("Задача / ожидаемый результат")).toHaveValue("");
    expect(screen.queryByText(draft.taskDescription)).not.toBeInTheDocument();
  });
  it("does not replace edit input or its version after a background update", async () => {
    const store = workspace();
    vi.mocked(store.actions.updateWorkSession).mockRejectedValue(new Error("Карточка изменена другим оператором"));
    const props = { employeeOptions: employees, onClose: vi.fn(), onNotify: vi.fn(), workspace: store, work: workAccountingSessions[0] };
    const view = render(<EditWorkModal {...props} />);
    fireEvent.change(screen.getByLabelText("Задача"), { target: { value: "Мой несохранённый текст" } });
    view.rerender(<EditWorkModal {...props} work={{ ...props.work, rowVersion: 2, taskDescription: "Чужое изменение" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Карточка изменена другим оператором");
    expect(store.actions.updateWorkSession).toHaveBeenCalledWith(props.work.id, expect.objectContaining({ taskDescription: "Мой несохранённый текст", rowVersion: 1 }));
    expect(screen.getByLabelText("Задача")).toHaveValue("Мой несохранённый текст");
    expect(props.onClose).not.toHaveBeenCalled();
  });
  it("blocks a repeated action and closing while a request is pending", async () => {
    let resolve!: () => void;
    const operation = vi.fn(() => new Promise<void>(done => { resolve = done; }));
    const close = vi.fn();
    const { result } = renderHook(() => useWorkMutation({ onClose: close, onNotify: vi.fn(), work: workAccountingSessions[0] }));
    let request!: Promise<void>;
    act(() => { request = result.current.run(operation, "Сохранено"); void result.current.run(operation, "Сохранено"); });
    expect(operation).toHaveBeenCalledOnce();
    act(() => result.current.close());
    expect(close).not.toHaveBeenCalled();
    await act(async () => { resolve(); await request; });
    expect(close).toHaveBeenCalledOnce();
  });
  it("does not notify or close another owner's form after unmount", async () => {
    let resolve!: () => void;
    const close = vi.fn(), notify = vi.fn();
    const view = renderHook(() => useWorkMutation({ onClose: close, onNotify: notify }));
    let request!: Promise<void>;
    act(() => { request = view.result.current.run(() => new Promise<void>(done => { resolve = done; }), "Сохранено"); });
    view.unmount();
    await act(async () => { resolve(); await request; });
    expect(close).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
  it("keeps pause errors inline and selects an active reason rather than a disabled first reason", async () => {
    const store = workspace({ settings: { ...workAccountingSettings, waitReasons: [{ ...workAccountingSettings.waitReasons[0], id: "disabled", isActive: false }, ...workAccountingSettings.waitReasons] } });
    vi.mocked(store.actions.pauseWorkSession).mockRejectedValue(new Error("Не удалось сохранить паузу"));
    render(<PauseWorkModal onClose={vi.fn()} onNotify={vi.fn()} workspace={store} work={workAccountingSessions[0]} />);
    fireEvent.click(screen.getByRole("button", { name: "Пауза" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось сохранить паузу");
    expect(store.actions.pauseWorkSession).toHaveBeenCalledWith("work-1", expect.objectContaining({ waitReasonId: "reason-material" }));
  });
  it("keeps completion visible when its date is cleared and prevents invalid submission", () => {
    const store = workspace();
    render(<CompleteWorkModal onClose={vi.fn()} onNotify={vi.fn()} workspace={store} work={workAccountingSessions[0]} />);
    fireEvent.change(screen.getByLabelText("Дата окончания"), { target: { value: "" } });
    expect(screen.getByRole("dialog", { name: "Завершить работу" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Завершить работу" })).toBeDisabled();
    expect(store.actions.completeWorkSession).not.toHaveBeenCalled();
  });
  it("supports keyboard commands and restores focus after Escape", () => {
    render(<WorkCard canComplete canDelete canPause canUpdate density="compact" now={new Date(workAccountingNow)} requiresDecision={false} work={workAccountingSessions[0]} onComplete={vi.fn()} onCarryOver={vi.fn()} onDelete={vi.fn()} onDetails={vi.fn()} onEdit={vi.fn()} onPause={vi.fn()} onResume={vi.fn()} onSelect={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "Команды" });
    fireEvent.click(trigger);
    const menu = screen.getByRole("menu", { name: "Команды работы" });
    expect(within(menu).getByRole("menuitem", { name: "Просмотр" })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "End" });
    expect(within(menu).getByRole("menuitem", { name: "Удалить" })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
  it("shows only viewing commands without mutation permissions", () => {
    const view = vi.fn();
    render(<WorkCard canComplete={false} canDelete={false} canPause={false} canUpdate={false} density="compact" now={new Date(workAccountingNow)} requiresDecision={false} work={workAccountingSessions[0]} onComplete={vi.fn()} onCarryOver={vi.fn()} onDelete={vi.fn()} onDetails={view} onEdit={vi.fn()} onPause={vi.fn()} onResume={vi.fn()} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Команды" }));
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
    fireEvent.click(screen.getByRole("menuitem", { name: "Просмотр" }));
    expect(view).toHaveBeenCalledOnce();
  });
  it("keeps history and attachments readable in the shared work dialog", () => {
    const store = workspace({ auditEvents: [{ id: "event-one", workSessionId: "work-1", planTaskId: null, eventType: "created", actor: "Оператор", createdAt: "2026-10-13T09:00:00+05:00", comment: "Проверить привод\nОсмотреть муфту", fromStatus: "", toStatus: "В работе" }] });
    const work = { ...workAccountingSessions[0], attachments: [{ fileId: "photo-one", fileName: "Привод печи.jpg", contentType: "image/jpeg", sizeBytes: 1024, uploadedAt: workAccountingNow, downloadUrl: "/api/v1/emu/attachments/photo-one" }] };
    render(<WorkDetailsModal canViewAudit now={new Date(workAccountingNow)} onClose={vi.fn()} workspace={store} work={work} />);
    fireEvent.click(screen.getByRole("tab", { name: /Вложения/ }));
    expect(screen.getByRole("link", { name: /Привод печи.jpg/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /История/ }));
    expect(screen.getByText("Создание карточки")).toBeInTheDocument();
    expect(screen.getByText(/Проверить привод/)).toHaveTextContent("Осмотреть муфту");
  });
  it("loads the selected work audit on demand and keeps its error retryable", async () => {
    const audit = vi.fn().mockRejectedValueOnce(new Error("Журнал недоступен")).mockResolvedValueOnce({ rows: [], total: 0 });
    const store = workspace({ sourceMode: "api" });
    store.actions.getWorkSessionAudit = audit;
    render(<WorkDetailsModal canViewAudit now={new Date(workAccountingNow)} onClose={vi.fn()} workspace={store} work={workAccountingSessions[0]} />);
    expect(audit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: "История" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Журнал недоступен");
    fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку" }));
    await screen.findByText("В журнале нет событий этой карточки.");
    expect(audit).toHaveBeenNthCalledWith(2, "work-1", { page: 1, pageSize: 50 });
  });
  it("ignores a previous work's delayed audit response", async () => {
    let resolve!: (value: unknown) => void;
    const oldEvent = { id: "old-event", workSessionId: "work-1", eventType: "created", createdAt: workAccountingNow, actor: "Старый оператор" };
    const audit = vi.fn().mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockResolvedValueOnce({ rows: [], total: 0 });
    const store = workspace({ sourceMode: "api" });
    store.actions.getWorkSessionAudit = audit;
    const view = render(<WorkHistoryPanel workId="work-1" workspace={store} />);
    view.rerender(<WorkHistoryPanel workId="work-2" workspace={store} />);
    await screen.findByText("В журнале нет событий этой карточки.");
    await act(async () => resolve({ rows: [oldEvent], total: 1 }));
    expect(screen.queryByText("Старый оператор")).not.toBeInTheDocument();
  });
  it("does not expose or load work history without the audit permission", () => {
    const store = workspace({ sourceMode: "api" });
    const audit = vi.fn();
    store.actions.getWorkSessionAudit = audit;
    render(<WorkDetailsModal canViewAudit={false} now={new Date(workAccountingNow)} onClose={vi.fn()} workspace={store} work={workAccountingSessions[0]} />);
    expect(screen.queryByRole("tab", { name: "История" })).not.toBeInTheDocument();
    expect(audit).not.toHaveBeenCalled();
  });
  it("pages the local audit for one work in the same descending order as the API", () => {
    const events = Array.from({ length: 55 }, (_, index) => ({ id: `event-${index}`, workSessionId: index < 53 ? "work-1" : "work-2", planTaskId: null, eventType: "created", actor: "Оператор", createdAt: new Date(Date.parse(workAccountingNow) + index * 60_000).toISOString(), comment: "", fromStatus: "", toStatus: "" }));
    const result = pageEmuWorkAudit(events, "work-1", { page: 2, pageSize: 50 });
    expect(result).toMatchObject({ total: 53, page: 2, pageSize: 50 });
    expect(result.rows.map(row => row.id)).toEqual(["event-2", "event-1", "event-0"]);
    expect(events[0].id).toBe("event-0");
  });
});
