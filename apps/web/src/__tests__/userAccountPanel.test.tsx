import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { UserAccountPanel } from "../app/shell/UserAccountPanel";
import type { SessionUserDto } from "../api/contracts";

const user: SessionUserDto = { id: "user-1", login: "operator", displayName: "Оператор панели", roles: ["operator"], permissions: [] };
afterEach(cleanup);
function openPassword(save = vi.fn().mockResolvedValue(true)) {
  const logout = vi.fn();
  const view = render(<UserAccountPanel key="session-1" user={user} mockMode={false} onLogout={logout} onChangePassword={save} />);
  fireEvent.click(screen.getByRole("button", { name: "Профиль пользователя" }));
  fireEvent.click(screen.getByRole("button", { name: "Изменить пароль" }));
  return { ...view, save, logout, dialog: screen.getByRole("dialog", { name: "Изменение пароля" }) };
}
it("shows only available profile actions and labels the demo state", () => {
  render(<UserAccountPanel user={user} mockMode onLogout={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Профиль пользователя" }));
  expect(screen.getByText("Демонстрационный режим · тестовые данные")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Изменить пароль" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Управление пользователями" })).not.toBeInTheDocument();
});
it("validates password confirmation without sending an invalid request", () => {
  const { save, dialog } = openPassword();
  fireEvent.change(screen.getByLabelText("Текущий пароль"), { target: { value: "current-test" } });
  fireEvent.change(screen.getByLabelText("Новый пароль"), { target: { value: "new-test-password" } });
  fireEvent.change(screen.getByLabelText("Подтверждение нового пароля"), { target: { value: "different-test-password" } });
  fireEvent.submit(dialog.querySelector("form")!);
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("подтверждение — совпадать");
});
it("blocks duplicate requests and closing until the existing password endpoint responds", async () => {
  let resolve!: (value: boolean) => void;
  const save = vi.fn(() => new Promise<boolean>(yes => { resolve = yes; }));
  const { dialog } = openPassword(save);
  for (const [label, value] of [["Текущий пароль", "current-test"], ["Новый пароль", "new-test-password"], ["Подтверждение нового пароля", "new-test-password"]]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.submit(dialog.querySelector("form")!); fireEvent.submit(dialog.querySelector("form")!);
  fireEvent.keyDown(window, { key: "Escape" });
  expect(save).toHaveBeenCalledOnce();
  expect(within(dialog).getByRole("button", { name: "Закрыть" })).toBeDisabled();
  await act(async () => resolve(true));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("clears the previous session's editor and ignores its delayed response", async () => {
  let resolve!: (value: boolean) => void;
  const save = vi.fn(() => new Promise<boolean>(yes => { resolve = yes; }));
  const { dialog, rerender } = openPassword(save);
  for (const [label, value] of [["Текущий пароль", "current-test"], ["Новый пароль", "new-test-password"], ["Подтверждение нового пароля", "new-test-password"]]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.submit(dialog.querySelector("form")!);
  rerender(<UserAccountPanel key="session-2" user={{ ...user, id: "user-2" }} mockMode={false} onLogout={vi.fn()} onChangePassword={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Профиль пользователя" }));
  await act(async () => resolve(true));
  expect(screen.getByRole("dialog", { name: "Профиль пользователя" })).toBeInTheDocument();
  expect(screen.queryByDisplayValue("current-test")).not.toBeInTheDocument();
});
