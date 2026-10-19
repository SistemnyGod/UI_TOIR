import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompleteAssignmentModal } from "../features/patrol/assignments/CompleteAssignmentModal";
import { AssignmentCancellationDialog } from "../features/patrol/assignments/AssignmentCancellationDialog";
import { AssignmentEmployeePickerModal } from "../features/patrol/assignments/AssignmentEmployeePickerModal";
import { ShiftSettingsModal } from "../features/patrol/assignments/ShiftSettingsModal";
import type { ActivePatrol, Employee, RouteDirectoryItem } from "../types";

const assignment = { id: "a1", employee: "Иванов Иван", route: "Контрольный маршрут", status: "В пути", progress: 10 } as ActivePatrol;
const route = { id: "r1", name: "Контрольный маршрут", points: [{ id: "p1", name: "Первая точка", status: "Активна" }] } as RouteDirectoryItem;
function deferred<T = void>() { let resolve!: (value: T) => void, reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("assignment command editors", () => {
  it("protects completion input, prevents duplicate submissions and retains a failed result", async () => {
    const pending = deferred(), submit = vi.fn(() => pending.promise), close = vi.fn();
    render(<CompleteAssignmentModal assignment={assignment} route={route} errors={{}} onClose={close} onSubmit={submit} />);
    fireEvent.change(screen.getByPlaceholderText("Что проверили, что обнаружили, итог обхода"), { target: { value: "Проверены ограждения" } });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Несохранённые изменения" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Продолжить редактирование" }));
    const button = screen.getByRole("button", { name: "Завершить обход" });
    const form = document.getElementById(button.getAttribute("form")!)!;
    act(() => { fireEvent.submit(form); fireEvent.submit(form); });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Закрыть" })).toBeDisabled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
    await act(async () => pending.reject(new Error("Сервер недоступен")));
    expect(screen.getByRole("alert")).toHaveTextContent("Сервер недоступен");
    expect(screen.getByPlaceholderText("Что проверили, что обнаружили, итог обхода")).toHaveValue("Проверены ограждения");
  });

  it("finishes with the selected photo bytes and keeps the existing files after a read failure", async () => {
    const submit = vi.fn();
    render(<CompleteAssignmentModal assignment={assignment} route={route} errors={{}} onClose={vi.fn()} onSubmit={submit} />);
    const input = screen.getByLabelText("Файлы фото");
    fireEvent.change(input, { target: { files: [new File([new Uint8Array([1, 2, 3])], "inspection.png", { type: "image/png" })] } });
    await screen.findByText("inspection.png");
    fireEvent.change(input, { target: { files: [new File(["bad"], "notes.txt", { type: "text/plain" })] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Предыдущие вложения сохранены");
    fireEvent.click(screen.getByRole("button", { name: "Завершить обход" }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ pointResults: [expect.objectContaining({ photoAttachments: [expect.objectContaining({ fileName: "inspection.png", dataBase64: "AQID" })] })] })));
    await waitFor(() => expect(screen.getByRole("button", { name: "Завершить обход" })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Убрать фото inspection.png" }));
    fireEvent.click(screen.getByRole("button", { name: "Завершить обход" }));
    await waitFor(() => expect(submit).toHaveBeenLastCalledWith(expect.objectContaining({ pointResults: [expect.objectContaining({ photoAttachments: [], photos: 0 })] })));
  });

  it("ignores an older photo read and aborts the current read on unmount", async () => {
    const readers: any[] = [];
    vi.stubGlobal("FileReader", class {
      result: string | null = null; onload?: () => void; onerror?: () => void; onabort?: () => void;
      readAsDataURL = vi.fn(); abort = vi.fn(() => this.onabort?.());
      constructor() { readers.push(this); }
    });
    const submit = vi.fn();
    const view = render(<CompleteAssignmentModal assignment={assignment} route={route} errors={{}} onClose={vi.fn()} onSubmit={submit} />);
    const input = screen.getByLabelText("Файлы фото");
    fireEvent.change(input, { target: { files: [new File(["a"], "old.png", { type: "image/png" })] } });
    fireEvent.change(input, { target: { files: [new File(["b"], "new.png", { type: "image/png" })] } });
    expect(readers[0].abort).toHaveBeenCalledOnce();
    await act(async () => { readers[1].result = "data:image/png;base64,Yg=="; readers[1].onload(); });
    await act(async () => { readers[0].result = "data:image/png;base64,YQ=="; readers[0].onload(); });
    expect(screen.getByText("new.png")).toBeInTheDocument();
    expect(screen.queryByText("old.png")).not.toBeInTheDocument();
    fireEvent.change(input, { target: { files: [new File(["c"], "pending.png", { type: "image/png" })] } });
    expect(screen.getByRole("button", { name: "Подготовка фото…" })).toBeDisabled();
    view.unmount();
    expect(readers[2].abort).toHaveBeenCalledOnce();
    await act(async () => { readers[2].result = "data:image/png;base64,Yw=="; readers[2].onload(); });
    expect(submit).not.toHaveBeenCalled();
  });

  it("preserves cancellation reason on error and protects it on all dismissal paths", async () => {
    const pending = deferred(), close = vi.fn(), submit = vi.fn(() => pending.promise);
    render(<AssignmentCancellationDialog summary={{ employee: "Иванов", route: "Маршрут", plannedAt: "12:00", status: "Ожидает" }} errors={{}} onClose={close} onSubmit={submit} />);
    fireEvent.change(screen.getByLabelText("Причина отмены"), { target: { value: "other" } });
    fireEvent.change(screen.getByPlaceholderText("При необходимости добавьте пояснение"), { target: { value: "Причина отмены" } });
    fireEvent.click(screen.getByRole("button", { name: "Не отменять" }));
    fireEvent.click(screen.getByRole("button", { name: "Продолжить редактирование" }));
    fireEvent.click(screen.getByRole("button", { name: "Отменить заявку" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
    await act(async () => pending.reject(new Error("Нет связи")));
    expect(screen.getByRole("alert")).toHaveTextContent("Нет связи");
    expect(screen.getByPlaceholderText("При необходимости добавьте пояснение")).toHaveValue("Причина отмены");
    expect(submit).toHaveBeenCalledWith({ reasonCode: "other", reasonText: "Причина отмены" });
  });

  it("reaches employees after the former 80-row limit and saves the full multi-page selection once", async () => {
    const employees = Array.from({ length: 120 }, (_, index) => ({ id: `e${index}`, name: `Сотрудник ${index}`, role: "Обходчик", zone: "Участок" } as Employee));
    const change = vi.fn().mockRejectedValueOnce(new Error("Список не сохранён")).mockResolvedValue(undefined);
    const close = vi.fn();
    render(<AssignmentEmployeePickerModal employees={employees} favoriteEmployeeIds={["e1"]} onChange={change} onClose={close} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Поиск сотрудников в избранном" }), { target: { value: "Сотрудник 110" } });
    fireEvent.click(screen.getByRole("button", { name: /Сотрудник 110\./ }));
    expect(change).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: "Поиск сотрудников в избранном" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить список" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Список не сохранён");
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить список" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(change).toHaveBeenLastCalledWith(["e1", "e110"]);
  });

  it("restores shift defaults in the draft and keeps the edited form when saving fails", async () => {
    const save = vi.fn().mockRejectedValue(new Error("Недостаточно прав")), close = vi.fn();
    render(<ShiftSettingsModal value={{ dayStart: "07:00", dayEnd: "15:00", nightStart: "23:00", nightEnd: "07:00" }} onSave={save} onClose={close} />);
    fireEvent.click(screen.getByRole("button", { name: "По умолчанию" }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Начало дневной смены")).toHaveValue("06:00");
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Продолжить редактирование" }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Недостаточно прав");
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Начало дневной смены")).toHaveValue("06:00");
  });
});
