import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AssignmentRequestModal, type AssignmentRequestModalProps } from "../features/patrol/assignments/AssignmentRequestModal";
import { AssignmentSelectionBar } from "../features/patrol/assignments/AssignmentSelectionBar";
import { defaultAssignmentShiftSettings } from "../features/patrol/assignments/assignmentStorage";
import type { Employee, RouteOption } from "../types";

const employee: Employee = { id: "employee-1", name: "Иванов Иван", role: "Слесарь", zone: "Цех", shift: "Ночь", status: "Свободен", activity: "" };
const route: RouteOption = { id: "route-1", name: "Обход печей", zone: "Цех", duration: "30 мин", distance: "1 км", points: 2, controlPoints: 2, priority: "Обычный", requiredEmployees: 1, loadedEmployees: 0 };
function makeProps(overrides: Partial<AssignmentRequestModalProps> = {}): AssignmentRequestModalProps {
  return { employee, route, routes: [route], routeDirectory: [], favoriteEmployees: [employee], selectedRouteId: route.id,
    canManage: true, comment: "", fieldErrors: {}, hasConflict: false, isCreating: false, notificationText: "Обход печей в 22:00",
    onAssign: vi.fn(), onClose: vi.fn(), onCommentChange: vi.fn(), onPlannedDateChange: vi.fn(), onPlannedStartChange: vi.fn(), onPriorityChange: vi.fn(),
    onSaveDraft: vi.fn(), onSelectEmployee: vi.fn(), onSelectRequest: vi.fn(), onSelectRoute: vi.fn(), plannedDate: "2026-10-01", plannedStart: "22:00",
    priority: "high", requestListStatus: "ready", requests: [], selectedRequestId: "", shiftSettings: defaultAssignmentShiftSettings, ...overrides };
}

describe("assignment creation redesigned modal", () => {
  it("passes edited fields, draft and send actions to the existing workflow", async () => {
    const props = makeProps(); const user = userEvent.setup(); render(<AssignmentRequestModal {...props} />);
    fireEvent.change(screen.getByLabelText("Дата начала"), { target: { value: "2026-10-02" } });
    fireEvent.change(screen.getByLabelText("Время", { exact: true }), { target: { value: "10:30" } });
    await user.selectOptions(screen.getByLabelText("Приоритет"), "low");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Проверить вентиль" } });
    expect(props.onPlannedDateChange).toHaveBeenCalledWith("2026-10-02");
    expect(props.onPlannedStartChange).toHaveBeenCalledWith("10:30");
    expect(props.onPriorityChange).toHaveBeenCalledWith("low");
    expect(props.onCommentChange).toHaveBeenCalledWith("Проверить вентиль");
    await user.click(screen.getByRole("button", { name: "Сохранить как черновик" }));
    expect(props.onSaveDraft).toHaveBeenCalledOnce(); expect(props.onAssign).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Отправить заявку" }));
    expect(props.onAssign).toHaveBeenCalledOnce();
  });
  it("prevents editing, duplicate submission and closing while sending", async () => {
    const props = makeProps({ isCreating: true }); const user = userEvent.setup(); render(<AssignmentRequestModal {...props} />);
    expect(screen.getByRole("button", { name: "Отправка…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Сохранить как черновик" })).toBeDisabled();
    expect(screen.getByLabelText("Дата начала")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Закрыть" }));
    await user.keyboard("{Escape}"); expect(props.onClose).not.toHaveBeenCalled();
  });
  it("keeps the selected employee when removed from favorites and shows server errors", () => {
    render(<AssignmentRequestModal {...makeProps({ favoriteEmployees: [], fieldErrors: { plannedAt: ["Укажите дату"] } })} />);
    expect(screen.getByLabelText("Сотрудник из избранного списка для обходов")).toHaveValue(employee.id);
    expect(screen.getByRole("alert")).toHaveTextContent("Укажите дату");
  });
  it("does not submit without access or when requests failed to load", () => {
    const props = makeProps({ canManage: false }); const { rerender } = render(<AssignmentRequestModal {...props} />);
    expect(screen.getByRole("button", { name: "Отправить заявку" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Сохранить как черновик" })).toBeDisabled();
    rerender(<AssignmentRequestModal {...makeProps({ requestListStatus: "error" })} />);
    expect(screen.getByRole("button", { name: "Отправить заявку" })).toBeDisabled();
  });
  it("shows ordered route points without changing the selected route", async () => {
    const props = makeProps({ routeDirectory: [{ id: route.id, name: route.name, territory: "Цех", status: "Активен", description: "", duration: "30 мин", distance: "", periodicity: "", points: [
      { id: "p2", order: 2, name: "Вторая точка", zone: "Цех", type: "NFC", tag: "", description: "", instruction: "Проверить температуру", interval: "", expectedTime: "", status: "Активна", requiresPhoto: false },
      { id: "p1", order: 1, name: "Первая точка", zone: "Цех", type: "NFC", tag: "", description: "", instruction: "", interval: "", expectedTime: "", status: "Активна", requiresPhoto: false },
    ] }] }); render(<AssignmentRequestModal {...props} />);
    await userEvent.click(screen.getByText("Посмотреть точки"));
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Первая точка"); expect(items[1]).toHaveTextContent("Вторая точка");
    expect(props.onSelectRoute).not.toHaveBeenCalled();
  });
  it("allows opening a conflicting selection to correct the date", async () => {
    const onCreate = vi.fn(); render(<AssignmentSelectionBar canCreate employeeName={employee.name} routeName={route.name} hasConflict isCreating={false} onCreate={onCreate} plannedDate="2026-10-01" plannedStart="22:00" />);
    await userEvent.click(screen.getByRole("button", { name: "Создать заявку" })); expect(onCreate).toHaveBeenCalledOnce();
  });
});
