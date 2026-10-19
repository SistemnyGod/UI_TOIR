import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SiteUserFormPanel } from "../features/users/components/SiteUserFormPanel";

afterEach(cleanup);
const existing = { id: "user-1", fullName: "Иванов Иван", login: "ivanov", role: "Оператор", status: "Активен", requirePasswordChange: false };

it("keeps the typed profile when an access catalog arrives late", () => {
  const onNotify = vi.fn();
  const { rerender } = render(<SiteUserFormPanel onNotify={onNotify} catalog={null} />);
  fireEvent.change(screen.getByLabelText("Логин *"), { target: { value: "new-login" } });
  fireEvent.change(screen.getByLabelText("ФИО *"), { target: { value: "Введённое имя" } });
  rerender(<SiteUserFormPanel onNotify={onNotify} catalog={{ modules: [{ key: "patrol", name: "Обходы", description: "Доступ к обходам", permissions: [] }] } as never} />);
  expect(screen.getByLabelText("Логин *")).toHaveValue("new-login");
  expect(screen.getByLabelText("ФИО *")).toHaveValue("Введённое имя");
  expect(screen.getByRole("checkbox", { name: /Обходы/ })).toBeChecked();
});

it("protects a changed profile from Escape and explicit cancel", () => {
  const close = vi.fn();
  render(<SiteUserFormPanel initialUser={existing as never} onNotify={vi.fn()} onClose={close} />);
  fireEvent.change(screen.getByLabelText("ФИО *"), { target: { value: "Изменённое имя" } });
  fireEvent.keyDown(window, { key: "Escape" });
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Продолжить редактирование" }));
  expect(screen.getByLabelText("ФИО *")).toHaveValue("Изменённое имя");
  fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
  fireEvent.click(screen.getByRole("button", { name: "Закрыть без сохранения" }));
  expect(close).toHaveBeenCalledOnce();
});

it("blocks duplicate submissions and retains the input after an API failure", async () => {
  let reject!: (error: Error) => void;
  const save = vi.fn(() => new Promise<void>((_, no) => { reject = no; }));
  const close = vi.fn();
  render(<SiteUserFormPanel initialUser={existing as never} onNotify={vi.fn()} onClose={close} onUpdateUser={save} />);
  const dialog = screen.getByRole("dialog", { name: "Редактирование пользователя" });
  fireEvent.change(screen.getByLabelText("ФИО *"), { target: { value: "Несохранённый профиль" } });
  fireEvent.submit(dialog.querySelector("form")!); fireEvent.submit(dialog.querySelector("form")!);
  expect(save).toHaveBeenCalledOnce();
  expect(within(dialog).getByRole("button", { name: "Закрыть" })).toBeDisabled();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(close).not.toHaveBeenCalled();
  await act(async () => reject(new Error("Сервер недоступен")));
  expect(screen.getByRole("alert")).toHaveTextContent("Сервер недоступен");
  expect(screen.getByLabelText("ФИО *")).toHaveValue("Несохранённый профиль");
});
