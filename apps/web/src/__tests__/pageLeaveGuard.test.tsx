import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePageLeaveGuard } from "../shared/navigation/usePageLeaveGuard";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function Editor({ dirty = true, pending = false, onLeave }: { dirty?: boolean; pending?: boolean; onLeave: () => void }) {
  const guard = usePageLeaveGuard({ dirty, pending });
  return <><input aria-label="Введённый комментарий" defaultValue="Сохранить этот ввод" /><button onClick={() => guard.requestLeave(onLeave)}>Перейти</button>{guard.leaveDialog}</>;
}
describe("page leave guard", () => {
  it("cancels with Escape without touching the form and approves an explicit retry", async () => {
    const leave = vi.fn(); render(<Editor onLeave={leave} />); fireEvent.click(screen.getByRole("button", { name: "Перейти" })); await screen.findByRole("dialog", { name: "Несохранённые изменения" }); fireEvent.keyDown(document, { key: "Escape" }); expect(screen.getByRole("textbox")).toHaveValue("Сохранить этот ввод"); expect(leave).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "Перейти" })); fireEvent.click(screen.getByRole("button", { name: "Закрыть без сохранения" })); await waitFor(() => expect(leave).toHaveBeenCalledOnce());
  });
  it("blocks discard while saving and uses the latest state for native unloading", async () => {
    const leave = vi.fn(), view = render(<Editor onLeave={leave} />); fireEvent.click(screen.getByRole("button", { name: "Перейти" })); view.rerender(<Editor pending onLeave={leave} />); expect(screen.getByRole("button", { name: "Закрыть без сохранения" })).toBeDisabled();
    const blocked = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(blocked); expect(blocked.defaultPrevented).toBe(true); fireEvent.click(screen.getByRole("button", { name: "Продолжить редактирование" })); fireEvent.click(screen.getByRole("button", { name: "Перейти" })); expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(leave).not.toHaveBeenCalled();
    view.rerender(<Editor dirty={false} onLeave={leave} />); const allowed = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(allowed); expect(allowed.defaultPrevented).toBe(false); fireEvent.click(screen.getByRole("button", { name: "Перейти" })); expect(leave).toHaveBeenCalledOnce();
  });
  it("cannot execute an approved callback after its owner has unmounted", async () => {
    const leave = vi.fn(), view = render(<Editor onLeave={leave} />); fireEvent.click(screen.getByRole("button", { name: "Перейти" })); fireEvent.click(screen.getByRole("button", { name: "Закрыть без сохранения" })); view.unmount(); await act(async () => {}); expect(leave).not.toHaveBeenCalled();
  });
});
