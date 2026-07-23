import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { PpeButton, PpeModalShell } from "../features/inventory/ppe/PpeUi";

function ModalHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PpeButton onClick={() => setOpen(true)} variant="primary">Открыть каталог</PpeButton>
      {open ? (
        <PpeModalShell
          ariaLabel="Каталог СИЗ"
          footer={<PpeButton onClick={() => setOpen(false)}>Готово</PpeButton>}
          initialFocusSelector="[data-autofocus]"
          onClose={() => setOpen(false)}
          title="Выбор номенклатуры"
        >
          <label>
            Поиск
            <input data-autofocus />
          </label>
        </PpeModalShell>
      ) : null}
    </>
  );
}

describe("PPE UI primitives", () => {
  it("locks scrolling, focuses the modal, closes on Escape and restores focus", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);
    const opener = screen.getByRole("button", { name: "Открыть каталог" });

    await user.click(opener);
    expect(await screen.findByRole("dialog", { name: "Каталог СИЗ" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Поиск" })).toHaveFocus());
    expect(document.body.style.overflow).toBe("hidden");

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
    expect(document.body.style.overflow).toBe("");
  });

  it("disables a loading action and exposes busy state", () => {
    render(<PpeButton loading variant="primary">Сохранить</PpeButton>);
    const button = screen.getByRole("button", { name: "Сохранить" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });
});
