import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmuDecisionDto, EmuEmployeeShiftSummaryDto } from "../api/contracts";
import type { EmuWorkspace } from "../hooks/useEmuWorkspace";
import type { EmuEmployeeOption } from "../features/emu/work-accounting/types";
import { CreateWorkModal, EditWorkModal } from "../features/emu/work-accounting/modals/CreateEditWorkModals";
import { PauseWorkModal, ResumeWorkModal, CompleteWorkModal, CarryOverWorkModal, DeleteWorkModal } from "../features/emu/work-accounting/modals/WorkLifecycleModals";
import { AddEmployeeToWorkModal, FinishEmployeeParticipationModal, MarkMistakenEmployeeModal } from "../features/emu/work-accounting/modals/EmployeeParticipationModals";
import { ShiftAdjustModal } from "../features/emu/work-accounting/side/ShiftPanels";
import { ResolveDecisionModal } from "../features/emu/work-accounting/side/DecisionPanels";
import { workAccountingNow, workAccountingSessions, workAccountingSettings } from "../../e2e/fixtures/workAccounting";
const work = workAccountingSessions[0];
const employeeOptions = workAccountingSettings.favoriteEmployees.map(employee => ({ ...employee, id: employee.employeeId })) as EmuEmployeeOption[];
const workspace = { settings: workAccountingSettings, workSessions: { rows: workAccountingSessions }, actions: {} } as unknown as EmuWorkspace;
const shift = { id: "shift-1", employeeId: "employee-1", shiftDate: "2026-10-13", shiftType: "day", actualStartAt: "2026-10-13T08:00:00+05:00", actualEndAt: "2026-10-13T17:00:00+05:00", plannedStartAt: "2026-10-13T08:00:00+05:00", plannedEndAt: "2026-10-13T17:00:00+05:00", lunchStartAt: "2026-10-13T12:00:00+05:00", lunchEndAt: "2026-10-13T13:00:00+05:00", lunchTaken: true, comment: "", templateId: null, rowVersion: 7 };
const shiftSummary = { shift } as EmuEmployeeShiftSummaryDto;
const decision = { id: "decision-1", decisionType: "employee_conflict", employeeName: "Иванов Андрей Сергеевич", workNumber: work.workNumber, sectionName: work.sectionName, rowVersion: 7 } as EmuDecisionDto;
const props = (onClose: () => void) => ({ onClose, onNotify: vi.fn(), work, workspace, employeeOptions });
const cases: Array<[string, (close: () => void) => ReactNode]> = [
  ["Создать работу", close => <CreateWorkModal {...props(close)} draftStorageKey="emu-dialog-test" />],
  ["Изменить карточку работы", close => <EditWorkModal {...props(close)} />],
  ["Поставить на паузу", close => <PauseWorkModal {...props(close)} />],
  ["Продолжить работу", close => <ResumeWorkModal {...props(close)} work={workAccountingSessions[1]} />],
  ["Завершить работу", close => <CompleteWorkModal {...props(close)} />],
  ["Перенести работу", close => <CarryOverWorkModal {...props(close)} />],
  ["Удалить работу", close => <DeleteWorkModal {...props(close)} />],
  ["Добавить сотрудника в работу", close => <AddEmployeeToWorkModal {...props(close)} />],
  ["Завершить участие сотрудника", close => <FinishEmployeeParticipationModal {...props(close)} employee={work.employees[0]} />],
  ["Ошибочно добавленный сотрудник", close => <MarkMistakenEmployeeModal {...props(close)} employee={work.employees[0]} />],
  ["Скорректировать смену", close => <ShiftAdjustModal {...props(close)} shiftSummary={shiftSummary} onSaved={vi.fn()} />],
  ["Закрыть спорную ситуацию", close => <ResolveDecisionModal {...props(close)} decision={decision} />],
];
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(workAccountingNow)); const values = new Map(); Object.defineProperty(window, "localStorage", { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } }); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
describe("EMU modal continuity", () => {
  it.each(["shift", "decision"])("keeps the opened version and pending state for %s", async kind => {
    let reject!: (error: Error) => void; const gate = new Promise<never>((_, no) => { reject = no; }), save = vi.fn().mockReturnValueOnce(gate).mockResolvedValue(shift), close = vi.fn(), saved = vi.fn();
    const store = { ...workspace, actions: { ...workspace.actions, updateEmployeeShift: save, resolveDecision: save } };
    const editor = (version: number) => kind === "shift" ? <ShiftAdjustModal {...props(close)} workspace={store} onSaved={saved} shiftSummary={{ ...shiftSummary, shift: { ...shiftSummary.shift, rowVersion: version } }} /> : <ResolveDecisionModal {...props(close)} workspace={store} decision={{ ...decision, rowVersion: version }} />;
    const view = render(editor(7)), dialog = screen.getByRole("dialog"), field = dialog.querySelector("textarea")!; fireEvent.change(field, { target: { value: "Основание и комментарий оператора" } }); const button = within(dialog).getByRole("button", { name: kind === "shift" ? "Сохранить смену" : "Закрыть решение" }); fireEvent.click(button); fireEvent.click(button);
    expect(save).toHaveBeenCalledOnce(); expect(dialog).toHaveAttribute("aria-busy", "true"); view.rerender(editor(19)); await act(async () => reject(new Error("Версия изменилась"))); expect(field).toHaveValue("Основание и комментарий оператора"); expect(saved).not.toHaveBeenCalled(); fireEvent.click(button); await waitFor(() => expect(close).toHaveBeenCalledOnce()); expect(save.mock.calls[1][1].rowVersion).toBe(7);
  });
  it("rejects a common completion before any selected employee has arrived", () => {
    const changed = { ...work, employees: [work.employees[0], { ...work.employees[0], employeeId: "late", arrivedAt: "2026-10-13T13:00:00+05:00" }] };
    render(<CompleteWorkModal {...props(vi.fn())} work={changed} />); fireEvent.change(screen.getByRole("textbox"), { target: { value: "Выполнено" } }); fireEvent.change(screen.getByLabelText("Время окончания", { selector: 'input[type="time"]' }), { target: { value: "12:00" } }); expect(screen.getByRole("button", { name: "Завершить работу" })).toBeDisabled();
  });
  it.each(cases)("protects changed input in %s and discards only after an explicit decision", async (title, build) => {
    const close = vi.fn(); render(build(close)); const editor = screen.getByRole("dialog", { name: title });
    const field = editor.querySelectorAll("textarea").item(editor.querySelectorAll("textarea").length - 1);
    fireEvent.change(field, { target: { value: "Комментарий, который нельзя потерять" } }); field.focus(); fireEvent.keyDown(window, { key: "Escape" });
    const guard = await screen.findByRole("dialog", { name: "Несохранённые изменения" }); expect(close).not.toHaveBeenCalled();
    fireEvent.click(within(guard).getByRole("button", { name: "Продолжить редактирование" })); expect(field).toHaveValue("Комментарий, который нельзя потерять"); expect(field).toHaveFocus();
    const unload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true);
    fireEvent.click(within(editor).getByRole("button", { name: "Отмена" })); fireEvent.click(screen.getByRole("button", { name: /^(Закрыть без сохранения|Закрыть форму)$/ })); await waitFor(() => expect(close).toHaveBeenCalledOnce());
  });
  it("does not consider a restored value or a board refresh an unsaved change", () => {
    const close = vi.fn(); const view = render(<PauseWorkModal {...props(close)} />); const field = screen.getByRole("textbox", { name: /Комментарий/ });
    fireEvent.change(field, { target: { value: "Исправление" } }); fireEvent.change(field, { target: { value: "" } });
    view.rerender(<PauseWorkModal {...props(close)} work={{ ...work, rowVersion: work.rowVersion + 1 }} />); fireEvent.keyDown(window, { key: "Escape" }); expect(close).toHaveBeenCalledOnce(); expect(screen.queryByRole("dialog", { name: "Несохранённые изменения" })).not.toBeInTheDocument();
  });
  it("blocks duplicate saves and all dismissal paths while pending, retaining input after failure", async () => {
    let reject!: (error: Error) => void; const gate = new Promise<never>((_, no) => { reject = no; }); const save = vi.fn().mockReturnValueOnce(gate).mockResolvedValue(work), close = vi.fn();
    render(<CompleteWorkModal {...props(close)} workspace={{ ...workspace, actions: { ...workspace.actions, completeWorkSession: save } }} />);
    const editor = screen.getByRole("dialog", { name: "Завершить работу" }); const field = within(editor).getByRole("textbox"); fireEvent.change(field, { target: { value: "Работа проверена и завершена" } });
    const button = within(editor).getByRole("button", { name: "Завершить работу" }); fireEvent.click(button); fireEvent.click(button); expect(save).toHaveBeenCalledOnce();
    expect(editor).toHaveAttribute("aria-busy", "true"); expect(within(editor).getByRole("button", { name: "Закрыть" })).toBeDisabled(); expect(field).toBeDisabled(); fireEvent.keyDown(window, { key: "Escape" }); fireEvent.mouseDown(editor.parentElement!); expect(close).not.toHaveBeenCalled();
    await act(async () => reject(new Error("Версия работы изменилась"))); expect(within(editor).getByRole("alert")).toHaveTextContent("Версия работы изменилась"); expect(field).toHaveValue("Работа проверена и завершена"); fireEvent.click(button); await waitFor(() => expect(close).toHaveBeenCalledOnce()); expect(save).toHaveBeenCalledTimes(2);
  });
  it("does not close or notify a new editor after the old one unmounts", async () => {
    let resolve!: (value: typeof work) => void; const gate = new Promise<typeof work>(done => { resolve = done; }), close = vi.fn(), notify = vi.fn();
    const view = render(<CompleteWorkModal {...props(close)} onNotify={notify} workspace={{ ...workspace, actions: { ...workspace.actions, completeWorkSession: vi.fn().mockReturnValue(gate) } }} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Результат старой формы" } }); fireEvent.click(screen.getByRole("button", { name: "Завершить работу" })); view.unmount(); render(<CompleteWorkModal {...props(close)} work={workAccountingSessions[2]} />);
    await act(async () => resolve(work)); expect(close).not.toHaveBeenCalled(); expect(notify).not.toHaveBeenCalled(); expect(screen.getByRole("textbox")).toHaveValue("");
  });
});
