import { cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleScreen, selectScheduleResultHistory } from "../features/patrol/ScheduleScreen";
import { ScheduleEditPanel } from "../features/patrol/components/schedule/ScheduleEditPanel";
import { scheduleDays, scheduleState, shiftSchedulePeriod } from "../features/patrol/components/schedule/schedulePresentation";
import { useSchedulePlanning } from "../hooks/useSchedulePlanning";
import type { ActivePatrol, EmployeeDirectoryItem, PatrolResult, RouteDirectoryItem, ScheduleCell, ScheduleMode, ServiceRequest } from "../types";

const employees = [
  { id: "e1", fullName: "Иванов Иван Иванович", department: "Печной участок", position: "Обходчик", shift: "День", status: "Активен" },
  { id: "e2", fullName: "Петров Петр Петрович", department: "Помол", position: "Обходчик", shift: "Ночь", status: "Офлайн" },
] as EmployeeDirectoryItem[];
const routes = [{ id: "r1", name: "Обход печей", territory: "Печной участок", status: "Активен", points: [] },
  { id: "r2", name: "Помол", territory: "Участок помола", status: "Активен", points: [] }] as unknown as RouteDirectoryItem[];
const request = (id: string, overrides: Partial<ServiceRequest> = {}) => ({ id, employeeId: "e1", employee: employees[0].fullName, routeId: "r1", route: routes[0].name,
  scheduledDate: "2026-10-08", scheduledTime: "08:00", status: "Назначена", ...overrides }) as ServiceRequest;
const baseCell = { id: "draft", employeeId: "e1", employee: employees[0].fullName, shift: "Дневная", date: "2026-10-08", day: "Чт 08.10", route: "", zone: "", state: "empty" } satisfies ScheduleCell;

function Harness({ canManage = true, requests = [], favorites = ["e1", "e2"] }: { canManage?: boolean; requests?: ServiceRequest[]; favorites?: string[] }) {
  const [mode, setMode] = useState<ScheduleMode>("week");
  const [selectedCellId, setSelectedCellId] = useState("");
  return <ScheduleScreen activePatrols={[]} canManage={canManage} dataSourceMode="mock" employeeDirectory={employees} favoriteEmployeeIds={favorites}
    mode={mode} onModeChange={setMode} onNotify={vi.fn()} onCreateScheduledRequest={vi.fn()} onOpenRequestById={vi.fn()} onRunAssignmentCommand={vi.fn()}
    requests={requests} routeDirectory={routes} selectedCellId={selectedCellId} onSelectCell={setSelectedCellId} />;
}

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-08T10:00:00")); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("patrol schedule workspace", () => {
  it("opens an editable create form directly and supports view-only navigation", async () => {
    const { unmount } = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Создать обход" }));
    expect(await screen.findByRole("dialog", { name: "Создание планового обхода" })).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByLabelText("Сотрудник")).toHaveValue("e1");
    unmount();
    render(<Harness canManage={false} />);
    expect(screen.getByRole("button", { name: "Создать обход" })).toBeDisabled();
    expect(screen.getByLabelText("Дата расписания")).toBeEnabled();
    expect(screen.getByLabelText("Смена")).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Следующий период" }));
    expect(screen.getByLabelText("Дата расписания")).toHaveValue("2026-10-15");
  });

  it("renders and opens both requests for one employee on the same day", async () => {
    render(<Harness requests={[request("one"), request("two", { routeId: "r2", route: "Помол", scheduledTime: "11:00" })]} />);
    expect(screen.getByRole("button", { name: /Обход печей, Иванов.*08:00/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Помол, Иванов.*11:00/ }));
    const dialog = await screen.findByRole("dialog", { name: "Плановый обход" });
    expect(within(dialog).getByText("Помол")).toBeInTheDocument();
    expect(within(dialog).getByText("08.10.2026, 11:00")).toBeInTheDocument();
    expect(within(dialog).queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Создать повторный обход" }));
    expect(within(dialog).getByLabelText("Маршрут")).toHaveValue("r2");
    expect(within(dialog).getByLabelText("Время начала")).toHaveValue("11:00");
  });

  it("shows true completed/cancelled statuses and real exceptions", async () => {
    render(<Harness requests={[request("done", { status: "Закрыта" }), request("cancel", { status: "Отменена", employeeId: "e2", employee: employees[1].fullName })]} />);
    expect(screen.getByRole("button", { name: /Иванов.*Выполнен/ })).toBeInTheDocument();
    expect(screen.queryByText("Резерв")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Показать исключения" }));
    expect(await screen.findByText("Исключения за период")).toBeInTheDocument();
    expect(screen.getByText("Отменён", { selector: ".plan-status" })).toBeInTheDocument();
    expect(screen.queryByText("Исключений за период нет")).not.toBeInTheDocument();
  });

  it("supports search, filter reset and expanding favorites to all employees", async () => {
    render(<Harness favorites={["e1"]} />);
    expect(await screen.findByText(employees[0].fullName)).toBeInTheDocument();
    expect(screen.queryByText(employees[1].fullName)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Сотрудники"), { target: { value: "all" } });
    expect(screen.getByText(employees[1].fullName)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Поиск в расписании" }), { target: { value: "нет совпадений" } });
    expect(screen.getByText("Ничего не найдено")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Сбросить фильтры" }));
    expect(screen.getByRole("searchbox", { name: "Поиск в расписании" })).toHaveValue("");
    expect(screen.getByText(employees[1].fullName)).toBeInTheDocument();
  });

  it("aligns a month to weekdays and opens the selected date instead of the first event", async () => {
    const { container } = render(<Harness requests={[request("one"), request("two", { routeId: "r2", route: "Помол", scheduledTime: "11:00" })]} />);
    fireEvent.click(screen.getByRole("button", { name: "Месяц" }));
    expect(container.querySelectorAll(".plan-month-padding")).toHaveLength(3);
    expect(container.querySelectorAll(".plan-month-day")).toHaveLength(31);
    fireEvent.click(screen.getByRole("button", { name: "Создать обход 15.10 Чт" }));
    const dialog = await screen.findByRole("dialog", { name: "Создание планового обхода" });
    expect(within(dialog).getByLabelText("Дата")).toHaveValue("2026-10-15");
  });

  it("shows all employees when favorites are empty and creates within the shift filter", async () => {
    render(<Harness favorites={[]} />);
    expect(await screen.findByText(employees[1].fullName)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Смена"), { target: { value: "night" } });
    fireEvent.click(screen.getByRole("button", { name: "Создать обход" }));
    const dialog = await screen.findByRole("dialog", { name: "Создание планового обхода" });
    expect(within(dialog).getByLabelText("Сотрудник")).toHaveValue("e2");
    expect(within(dialog).getByLabelText("Смена")).toHaveValue("Ночная");
  });

  it("preserves unsaved input on refreshed dictionaries and keeps errors in the form", async () => {
    const save = vi.fn().mockRejectedValue(new Error("Сервер временно недоступен"));
    const props = { employees, routes, selected: baseCell, onClose: vi.fn(), onCreateScheduledRequest: save, onNotify: vi.fn(), onOpenRequestById: vi.fn(), onRunAssignmentCommand: vi.fn() };
    const { rerender } = render(<ScheduleEditPanel {...props} />);
    const comment = screen.getByRole("textbox", { name: "Комментарий к обходу" });
    fireEvent.change(comment, { target: { value: "Сохранить мой ввод" } });
    rerender(<ScheduleEditPanel {...props} employees={[...employees]} routes={[...routes]} selected={{ ...baseCell }} />);
    expect(screen.getByRole("textbox", { name: "Комментарий к обходу" })).toHaveValue("Сохранить мой ввод");
    fireEvent.click(screen.getByRole("button", { name: "Сохранить заявку" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Сервер временно недоступен");
    expect(screen.getByRole("textbox", { name: "Комментарий к обходу" })).toHaveValue("Сохранить мой ввод");
    expect(save).toHaveBeenCalledOnce();
  });

  it("does not insert current active patrols into future weeks or duplicate their linked requests", async () => {
    const patrol = { id: "a1", employeeId: "e1", employee: employees[0].fullName, route: routes[0].name, shift: "День", startedAt: "08:00" } as ActivePatrol;
    const options = { activePatrols: [patrol], anchorDate: "2026-11-02", dataSourceMode: "mock" as const, employeeDirectory: employees, mode: "week" as const,
      requests: [] as ServiceRequest[], routeDirectory: routes, selectedCellId: "", shiftFilter: "all" as const };
    const { result, rerender } = renderHook((props) => useSchedulePlanning(props), { initialProps: options });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.scheduleCells.every(cell => cell.state === "empty")).toBe(true);
    rerender({ ...options, anchorDate: "2026-10-08", requests: [request("linked", { assignmentId: "a1", status: "В работе", shift: "Ночная" })] });
    const planned = result.current.scheduleCells.filter(cell => cell.state !== "empty");
    expect(planned).toHaveLength(1);
    expect(planned[0]).toMatchObject({ requestId: "linked", assignmentId: "a1", shift: "Ночная" });
  });
});

describe("period navigation", () => {
  it("handles month ends, year boundaries and leap February", () => {
    expect(shiftSchedulePeriod("2026-01-31", "month", 1)).toBe("2026-02-01");
    expect(shiftSchedulePeriod("2026-12-31", "month", 1)).toBe("2027-01-01");
    expect(scheduleDays("2024-02-10", "month")).toHaveLength(29);
    expect(scheduleDays("2026-10-11", "week")[0].key).toBe("2026-10-05");
  });
});

const existingCell = { ...baseCell, id: "existing", state: "planned", routeId: "r1", route: routes[0].name, requestId: "request1", scheduledTime: "08:30", description: "Проверить насос" } satisfies ScheduleCell;
const editProps = { employees, routes, selected: baseCell, onClose: vi.fn(), onCreateScheduledRequest: vi.fn(), onNotify: vi.fn(), onOpenRequestById: vi.fn(), onRunAssignmentCommand: vi.fn() };

describe("schedule management dialog", () => {
  it("keeps viewing separate from repeat creation and retains the original record", async () => {
    const save = vi.fn().mockResolvedValue(request("new"));
    const open = vi.fn();
    render(<ScheduleEditPanel {...editProps} selected={existingCell} onCreateScheduledRequest={save} onOpenRequestById={open} onClose={vi.fn()} />);
    expect(screen.queryByLabelText("Время начала")).not.toBeInTheDocument();
    expect(screen.getByText("Проверить насос")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Создать повторный обход" }));
    expect(screen.getByRole("dialog", { name: "Повторный плановый обход" })).toBeInTheDocument();
    expect(screen.getByLabelText("Маршрут")).toHaveValue("r1");
    expect(screen.getByLabelText("Время начала")).toHaveValue("08:30");
    fireEvent.change(screen.getByLabelText("Дата", { exact: true }), { target: { value: "2026-10-09" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить заявку" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ scheduledDate: "2026-10-09", description: "Проверить насос" }));
    expect(existingCell.date).toBe("2026-10-08");
    expect(open).not.toHaveBeenCalled();
  });

  it("protects edits on close, Escape and backdrop, and allows explicit discard", () => {
    const close = vi.fn();
    render(<ScheduleEditPanel {...editProps} onClose={close} />);
    fireEvent.change(screen.getByLabelText("Комментарий к обходу"), { target: { value: "Мой комментарий" } });
    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Несохранённые изменения" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Продолжить редактирование" }));
    expect(screen.getByLabelText("Комментарий к обходу")).toHaveValue("Мой комментарий");
    screen.getByLabelText("Комментарий к обходу").focus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Закрыть без сохранения" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Продолжить редактирование" }));
    fireEvent.mouseDown(screen.getByRole("presentation"));
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Закрыть без сохранения" }));
    expect(close).toHaveBeenCalledOnce();
  });

  it("closes an untouched form directly and lets a viewer open the original request", () => {
    const close = vi.fn();
    const open = vi.fn();
    const { unmount } = render(<ScheduleEditPanel {...editProps} onClose={close} />);
    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(close).toHaveBeenCalledOnce();
    unmount();
    render(<ScheduleEditPanel {...editProps} selected={existingCell} canManage={false} onClose={close} onOpenRequestById={open} />);
    expect(screen.queryByRole("button", { name: "Создать повторный обход" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Открыть заявку" }));
    expect(open).toHaveBeenCalledWith("request1");
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("adjusts shift start until the time is edited manually", () => {
    render(<ScheduleEditPanel {...editProps} />);
    expect(screen.getByLabelText("Время начала")).toHaveValue("06:00");
    fireEvent.change(screen.getByLabelText("Смена"), { target: { value: "Ночная" } });
    expect(screen.getByLabelText("Время начала")).toHaveValue("22:00");
    fireEvent.change(screen.getByLabelText("Время начала"), { target: { value: "23:15" } });
    fireEvent.change(screen.getByLabelText("Смена"), { target: { value: "Дневная" } });
    expect(screen.getByLabelText("Время начала")).toHaveValue("23:15");
  });

  it.each(["vacation", "archive"])("rejects an unavailable reference refreshed while the form is open: %s", async kind => {
    const save = vi.fn();
    const props = { ...editProps, selected: { ...baseCell, routeId: "r1" }, onCreateScheduledRequest: save };
    const { rerender } = render(<ScheduleEditPanel {...props} />);
    fireEvent.change(screen.getByLabelText("Комментарий к обходу"), { target: { value: "Сохранённый ввод" } });
    rerender(<ScheduleEditPanel {...props}
      employees={kind === "vacation" ? [{ ...employees[0], status: "Отпуск" }, employees[1]] : employees}
      routes={kind === "archive" ? [{ ...routes[0], status: "Архив" }, routes[1]] : routes} />);
    fireEvent.click(screen.getByRole("button", { name: "Сохранить заявку" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(kind === "vacation" ? "находится в отпуске" : "находится в архиве");
    expect(screen.getByLabelText("Комментарий к обходу")).toHaveValue("Сохранённый ввод");
    expect(save).not.toHaveBeenCalled();
  });

  it("blocks duplicate saves and closing while a request is pending, and ignores a late response after unmount", async () => {
    let resolve!: (value: ServiceRequest) => void;
    const save = vi.fn().mockImplementation(() => new Promise<ServiceRequest>(done => { resolve = done; }));
    const close = vi.fn();
    const notify = vi.fn();
    const { unmount } = render(<ScheduleEditPanel {...editProps} onCreateScheduledRequest={save} onClose={close} onNotify={notify} />);
    fireEvent.click(screen.getByRole("button", { name: "Сохранить заявку" }));
    expect(screen.getByRole("button", { name: "Сохранение…" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(close).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledOnce();
    unmount();
    resolve(request("late"));
    await waitFor(() => expect(notify).not.toHaveBeenCalled());
    expect(close).not.toHaveBeenCalled();
  });
  it("reuses the creation ID after a lost response and changes it when the draft changes", async () => {
    const save = vi.fn().mockRejectedValue(new Error("Потерян ответ сервера"));
    render(<ScheduleEditPanel {...editProps} onCreateScheduledRequest={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Сохранить заявку" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Сохранить заявку" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[0][0].clientRequestId).toBeTruthy();
    expect(save.mock.calls[1][0].clientRequestId).toBe(save.mock.calls[0][0].clientRequestId);
    await waitFor(() => expect(screen.getByRole("button", { name: "Сохранить заявку" })).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText("Комментарий к обходу"), { target: { value: "Другой план" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить заявку" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(3));
    expect(save.mock.calls[2][0].clientRequestId).not.toBe(save.mock.calls[0][0].clientRequestId);
  });

  it("requires the original route checklist and never exposes a restart command for a running patrol", () => {
    const checklistRoutes = [{ ...routes[0], points: [{ id: "p1", status: "Активна" }] }, routes[1]] as RouteDirectoryItem[];
    render(<ScheduleEditPanel {...editProps} selected={{ ...existingCell, assignmentId: "a1", assignmentStatus: "В пути" }} routes={checklistRoutes} />);
    expect(screen.getByRole("button", { name: "Быстро завершить" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Начать обход" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Создать повторный обход" }));
    fireEvent.change(screen.getByLabelText("Маршрут"), { target: { value: "r2" } });
    expect(screen.queryByRole("button", { name: "Быстро завершить" })).not.toBeInTheDocument();
  });

  it("keeps a failed cancellation and its reason visible, then closes after a successful command", async () => {
    const command = vi.fn().mockRejectedValueOnce(new Error("Нет соединения с сервером")).mockResolvedValueOnce(undefined);
    const close = vi.fn();
    render(<ScheduleEditPanel {...editProps} selected={{ ...existingCell, assignmentId: "a1", assignmentStatus: "В пути" }} onRunAssignmentCommand={command} onClose={close} />);
    fireEvent.click(screen.getByRole("button", { name: "Отменить" }));
    const cancellation = screen.getByRole("dialog", { name: "Отмена заявки на обход" });
    fireEvent.change(within(cancellation).getByLabelText("Причина отмены"), { target: { value: "route_unavailable" } });
    fireEvent.click(within(cancellation).getByRole("button", { name: "Отменить заявку" }));
    expect(await within(cancellation).findByText("Нет соединения с сервером")).toBeInTheDocument();
    expect(within(cancellation).getByLabelText("Причина отмены")).toHaveValue("route_unavailable");
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(within(cancellation).getByRole("button", { name: "Отменить заявку" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(command).toHaveBeenLastCalledWith("a1", "cancel", { reasonCode: "route_unavailable", reasonText: undefined });
  });

  it("does not list unrelated day results and distinguishes planned assignments from active ones", () => {
    const results = [{ id: "other", employeeId: "other", employee: "Другой сотрудник", routeId: "other", route: "Другой маршрут", actualAt: "08.10.2026, 09:00" },
      { id: "relevant", employeeId: "e1", employee: employees[0].fullName, routeId: "r1", route: routes[0].name, actualAt: "08.10.2026, 08:00" }] as PatrolResult[];
    expect(selectScheduleResultHistory(results, existingCell, { matchSelectedOnly: true }).results.map(result => result.id)).toEqual(["relevant"]);
    expect(scheduleState({ ...existingCell, assignmentId: "a1", assignmentStatus: "Запланирован" })).toMatchObject({ label: "Назначен", tone: "planned" });
    expect(scheduleState({ ...existingCell, assignmentId: "a1", assignmentStatus: "Завершено" })).toMatchObject({ label: "Выполнен", tone: "completed" });
  });
});
