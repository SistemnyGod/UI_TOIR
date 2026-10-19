import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModalShell } from "../shared/ui/ModalShell";
import { ReferenceModal } from "../features/inventory/settings/SettingsModals";
import { InventoryRepositoryProvider } from "../repositories/inventoryRepositoryContext";
import { RouteCreateModal } from "../features/patrol/components/routes/RouteCreateModal";
import { emptyRouteDraft } from "../features/patrol/components/routes/RouteEditorForm";
import { RoutePointDrawer } from "../features/patrol/components/routes/RoutePointDrawer";
import { emptyPointDraft } from "../features/patrol/components/routes/PointEditorForm";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("modal ownership", () => {
  it("recovers focus when a pending action disables the focused submit button", async () => {
    const request = deferred<void>();
    function Harness() { const [pending, setPending] = useState(false); return <ModalShell title="Операция" pending={pending} onClose={vi.fn()} actions={<button disabled={pending} onClick={() => { setPending(true); void request.promise.finally(() => setPending(false)); }}>Сохранить</button>}>Содержимое</ModalShell>; }
    render(<Harness />); const button = screen.getByRole("button", { name: "Сохранить" }); button.focus(); fireEvent.click(button);
    // jsdom does not emulate Chromium's automatic blur on disabled controls.
    button.blur();
    await waitFor(() => expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true));
    await act(async () => request.resolve());
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    expect(screen.getByRole("button", { name: "Закрыть" })).toHaveFocus();
  });
  it("restores the opener when a field uses React autoFocus before modal effects run", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return <><button onClick={() => setOpen(true)}>Открыть редактор</button>{open ? <ModalShell title="Редактор с автофокусом" onClose={() => setOpen(false)}><input autoFocus aria-label="Имя" /></ModalShell> : null}</>;
    }
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Открыть редактор" });
    trigger.focus(); fireEvent.click(trigger);
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    const restore = vi.spyOn(trigger, "focus");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(trigger).toHaveFocus();
    expect(restore).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("only the top dialog handles Escape and restores focus through the stack", () => {
    function Harness() {
      const [parent, setParent] = useState(false);
      const [child, setChild] = useState(false);
      return <><button onClick={() => setParent(true)}>Открыть</button>{parent ? <ModalShell title="Родитель" onClose={() => setParent(false)}><button onClick={() => setChild(true)}>Вложенное окно</button></ModalShell> : null}{child ? <ModalShell title="Ребёнок" onClose={() => setChild(false)}>Содержимое</ModalShell> : null}</>;
    }
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Открыть" });
    trigger.focus(); fireEvent.click(trigger);
    const childTrigger = screen.getByRole("button", { name: "Вложенное окно" });
    childTrigger.focus(); fireEvent.click(childTrigger);
    expect(within(screen.getByRole("dialog", { name: "Ребёнок" })).getByRole("button", { name: "Закрыть" })).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Ребёнок" })).not.toBeInTheDocument();
    expect(childTrigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("keeps the background inert if a parent unmounts before its child", () => {
    const { rerender, container } = render(<><ModalShell title="Родитель" onClose={vi.fn()}>A</ModalShell><ModalShell title="Ребёнок" onClose={vi.fn()}>B</ModalShell></>);
    rerender(<ModalShell title="Ребёнок" onClose={vi.fn()}>B</ModalShell>);
    expect(container.inert).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    expect(screen.getByRole("dialog", { name: "Ребёнок" }).contains(document.activeElement)).toBe(true);
  });
  it("returns focus to the parent when applying a child hides its opener", () => {
    function Harness() {
      const [child, setChild] = useState(false), [applied, setApplied] = useState(false);
      return <><ModalShell title="Подбор" onClose={vi.fn()}><div style={{ display: applied ? "none" : "block" }}><button onClick={() => setChild(true)}>Шаблоны</button></div><button>Выбранные позиции</button></ModalShell>{child ? <ModalShell title="Шаблоны" onClose={() => setChild(false)}><button onClick={() => { setApplied(true); setChild(false); }}>Применить</button></ModalShell> : null}</>;
    }
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Шаблоны" }); trigger.focus(); fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Применить" }));
    const parent = screen.getByRole("dialog", { name: "Подбор" });
    expect(parent.contains(document.activeElement)).toBe(true);
    expect(trigger).not.toHaveFocus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(screen.getByRole("button", { name: "Выбранные позиции" })).toHaveFocus();
  });
});

describe("route draft dismissal", () => {
  it("does not mistake the initial point loaded on opening for unsaved user input", () => {
    const close = vi.fn();
    const route = { id: "route-1", name: "Маршрут", points: [] } as never;
    const props = { route, editorMode: "create" as const, onCancel: close, onChange: vi.fn(), onCreate: vi.fn(), onSubmit: vi.fn() };
    const { rerender } = render(<RoutePointDrawer {...props} isOpen={false} draft={emptyPointDraft} />);
    rerender(<RoutePointDrawer {...props} isOpen draft={{ ...emptyPointDraft, name: "Загруженная точка" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(close).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog", { name: "Несохранённые изменения" })).not.toBeInTheDocument();
    rerender(<RoutePointDrawer {...props} isOpen draft={{ ...emptyPointDraft, name: "Изменённая точка" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(screen.getByRole("dialog", { name: "Несохранённые изменения" })).toBeInTheDocument();
    expect(close).toHaveBeenCalledOnce();
  });
  function Harness() {
    const [open, setOpen] = useState(true);
    const [draft, setDraft] = useState(emptyRouteDraft);
    return <><button onClick={() => setOpen(true)}>Открыть снова</button><RouteCreateModal draft={draft} isOpen={open} onChange={setDraft} onCancel={() => setOpen(false)} onSubmit={vi.fn()} /></>;
  }
  it("preserves added points when dismissal is cancelled, and discards only after an explicit choice", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Название точки"), { target: { value: "Точка аудита" } });
    fireEvent.click(screen.getByRole("button", { name: "Добавить точку" }));
    fireEvent.keyDown(window, { key: "Escape" });
    const confirm = screen.getByRole("dialog", { name: "Несохранённые изменения" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Продолжить редактирование" }));
    expect(screen.getByRole("button", { name: /Точка аудита/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    fireEvent.click(screen.getByRole("button", { name: "Закрыть без сохранения" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Открыть снова" }));
    expect(screen.getByText("Точек пока нет")).toBeInTheDocument();
  });
  it("protects a point that has been typed but not yet added", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Название точки"), { target: { value: "Не добавлена" } });
    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(screen.getByRole("dialog", { name: "Несохранённые изменения" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByLabelText("Название точки")).toHaveValue("Не добавлена");
  });
});

describe("reference editor", () => {
  function open(createCategory = vi.fn().mockResolvedValue({ id: "created" }), reload = vi.fn().mockResolvedValue(undefined)) {
    const close = vi.fn(); const notify = vi.fn();
    const repository = { createCategory };
    render(<InventoryRepositoryProvider value={repository as never}><ReferenceModal categories={[]} modal={{ kind: "category" }} onClose={close} onNotify={notify} onReload={reload} /></InventoryRepositoryProvider>);
    return { close, notify, createCategory, reload, dialog: screen.getByRole("dialog", { name: "Новая запись справочника" }) };
  }
  it("places focus in the dialog and closes an unchanged form with Escape", () => {
    const { close, dialog } = open();
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(close).toHaveBeenCalledOnce();
  });
  it("blocks every close path and duplicate submits while the request is pending", async () => {
    const request = deferred<unknown>();
    const { createCategory, close, dialog } = open(vi.fn(() => request.promise));
    fireEvent.change(within(dialog).getByLabelText("Название"), { target: { value: "Новая группа" } });
    const form = dialog.querySelector("form")!;
    fireEvent.submit(form); fireEvent.submit(form);
    expect(createCategory).toHaveBeenCalledOnce();
    expect(within(dialog).getByRole("button", { name: "Закрыть" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Отмена" })).toBeDisabled();
    fireEvent.mouseDown(dialog.parentElement!); fireEvent.keyDown(window, { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
    await act(async () => request.resolve({ id: "created" }));
    expect(close).toHaveBeenCalledOnce();
  });
  it("retains input and permits a deliberate retry after a save error", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("Соединение прервано")).mockResolvedValue({ id: "created" });
    const { dialog, close } = open(save);
    fireEvent.change(within(dialog).getByLabelText("Название"), { target: { value: "Введённые данные" } });
    fireEvent.submit(dialog.querySelector("form")!);
    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent("Соединение прервано");
    expect(within(dialog).getByLabelText("Название")).toHaveValue("Введённые данные");
    expect(close).not.toHaveBeenCalled();
    fireEvent.submit(dialog.querySelector("form")!);
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
  });
  it("does not report an already saved record as failed when refreshing the list fails", async () => {
    const { dialog, close, notify } = open(undefined, vi.fn().mockRejectedValue(new Error("refresh")));
    fireEvent.change(within(dialog).getByLabelText("Название"), { target: { value: "Записано" } });
    fireEvent.submit(dialog.querySelector("form")!);
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining("Данные сохранены")));
  });
});
