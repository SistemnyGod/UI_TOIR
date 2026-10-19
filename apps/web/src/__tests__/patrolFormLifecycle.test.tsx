import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmployeeFormModal } from "../features/patrol/components/employees/EmployeeFormModal";
import { RequestCreateModal } from "../features/patrol/components/requests/RequestCreateModal";
import type { EmployeeDirectoryItem, RouteDirectoryItem } from "../types";

const employee = { id: "e1", fullName: "Иванов Иван Иванович", personnelNo: "001", status: "Активен" } as EmployeeDirectoryItem;
const route = { id: "r1", name: "Маршрут", points: [] } as unknown as RouteDirectoryItem;
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
afterEach(cleanup);

describe("patrol editor lifecycle", () => {
  it("keeps an employee draft on dismiss and blocks all close paths during a save", async () => {
    const pending = deferred(), close = vi.fn(), save = vi.fn(() => pending.promise);
    render(<EmployeeFormModal mode="edit" employee={employee} onClose={close} onSubmit={save} />);
    fireEvent.change(screen.getByLabelText("ФИО"), { target: { value: "Изменённое имя" } });
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(screen.getByRole("dialog", { name: "Несохранённые изменения" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Продолжить редактирование" }));
    const form = screen.getByRole("button", { name: "Сохранить" }).getAttribute("form")!;
    act(() => { fireEvent.submit(document.getElementById(form)!); fireEvent.submit(document.getElementById(form)!); });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Закрыть" })).toBeDisabled();
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => pending.reject(new Error("Нет соединения")));
    expect(screen.getByRole("alert")).toHaveTextContent("Нет соединения");
    expect(screen.getByLabelText("ФИО")).toHaveValue("Изменённое имя");
  });
  it("does not dismiss another editor after an old employee save completes", async () => {
    const pending = deferred(), close = vi.fn();
    const view = render(<EmployeeFormModal mode="edit" employee={employee} onClose={close} onSubmit={() => pending.promise} />);
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    view.unmount();
    await act(async () => pending.resolve());
    expect(close).not.toHaveBeenCalled();
  });
  it("keeps the selected request employee and route explicit when a refreshed directory removes them", async () => {
    const props = { employeeOptions: [employee], routeOptions: [route], onClose: vi.fn(), onDirtyChange: vi.fn(), onSubmitCreate: vi.fn() };
    const view = render(<RequestCreateModal {...props} />);
    fireEvent.change(screen.getByLabelText("Комментарий к заявке"), { target: { value: "Проверить ограждение" } });
    view.rerender(<RequestCreateModal {...props} employeeOptions={[{ ...employee, id: "e2" }]} routeOptions={[{ ...route, id: "r2" }]} />);
    expect(screen.getByLabelText("Сотрудник")).toHaveValue("e1");
    expect(screen.getByLabelText("Маршрут обхода")).toHaveValue("r1");
    const form = screen.getByRole("button", { name: "Создать заявку" }).getAttribute("form")!;
    fireEvent.submit(document.getElementById(form)!);
    expect(await screen.findByRole("alert")).toHaveTextContent("недоступен");
    expect(props.onSubmitCreate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    fireEvent.click(screen.getByRole("button", { name: "Продолжить редактирование" }));
    expect(screen.getByLabelText("Комментарий к заявке")).toHaveValue("Проверить ограждение");
  });
  it("initializes late reference data without mistaking it for user input", async () => {
    const close = vi.fn();
    const props = { onClose: close, onDirtyChange: vi.fn(), onSubmitCreate: vi.fn() };
    const view = render(<RequestCreateModal {...props} employeeOptions={[]} routeOptions={[]} />);
    view.rerender(<RequestCreateModal {...props} employeeOptions={[employee]} routeOptions={[route]} />);
    await waitFor(() => expect(screen.getByLabelText("Сотрудник")).toHaveValue("e1"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(close).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "Несохранённые изменения" })).not.toBeInTheDocument();
  });
});
