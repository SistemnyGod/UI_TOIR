import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileAccountsScreen } from "../features/mobileAccounts/MobileAccountsScreen";
import { MobileAccountListPanel } from "../features/mobileAccounts/components/MobileAccountListPanel";
import { MobileAccountActivity } from "../features/mobileAccounts/components/MobileAccountActivity";
import { MobileAccountDetail } from "../features/mobileAccounts/components/MobileAccountDetail";
import { MobileAccountCreateDrawer } from "../features/mobileAccounts/components/MobileAccountCreateDrawer";
import { MobileAccountDeletePanel } from "../features/mobileAccounts/components/MobileAccountActionPanels";
import { MobileAccountEditPanel } from "../features/mobileAccounts/components/MobileAccountEditPanel";
import { MobileAccountPasswordPanel } from "../features/mobileAccounts/components/MobileAccountActionPanels";
import { accountDevices } from "../features/mobileAccounts/accountPresentation";
import type { MobileAccount, MobileAccountSession, MobileAccountSecurityEvent } from "../types";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const account: MobileAccount = { id: "a-1", login: "mobile.one", passwordState: "Установлен", employee: "", employeeScope: "selected", boundEmployeeIds: ["e-1"], boundEmployees: ["Иванов Иван Иванович"], role: "Маршрутный обходчик", status: "Активен", session: "Офлайн", device: "Samsung", version: "0.1.48", lastSeen: "30.09.2026, 16:51" };
function session(id: string, patch: Partial<MobileAccountSession> = {}): MobileAccountSession { return { id, accountId: account.id, status: "offline", deviceId: id, device: "Samsung", platform: "Android", appVersion: "0.1.48", ipAddress: "", startedAt: "2026-09-30T11:00:00Z", lastSeenAt: "2026-09-30T11:51:00Z", ...patch }; }
function event(id: string, patch: Partial<MobileAccountSecurityEvent> = {}): MobileAccountSecurityEvent { return { id, accountId: account.id, eventType: "mobile_account.login", message: "Вход на Samsung", actor: "mobile.one", createdAt: "2026-09-30T11:42:00Z", ...patch }; }
function listProps() { return { activePanel: null, accounts: [account], mode: "accounts" as const, selectedAccountId: account.id, status: "ready" as const, onDeleteAccount: vi.fn(), onDetachEmployee: vi.fn(), onModeChange: vi.fn(), onNotify: vi.fn(), onOpenPanel: vi.fn(), onSelectAccount: vi.fn(), onToggleBlockAccount: vi.fn() }; }
function detailProps() { return { selected: account, sessions: [], events: [], status: "ready" as const, onRefresh: vi.fn(), employeeDirectory: [], canManage: true, onClose: vi.fn(), onOpenEdit: vi.fn(), onOpenLink: vi.fn(), onOpenPassword: vi.fn() }; }
function workspaceProps() { return { ...listProps(), accountCreateIntent: 0, accountListStatus: "ready" as const, dataSourceMode: "mock" as const, employeeDirectory: [], mobileAccountSecurityEvents: [], mobileAccountSecurityStatus: "ready" as const, mobileAccountSessions: [], onAttachEmployee: vi.fn(), onBindEmployees: vi.fn(), onCreateAccount: vi.fn(), onRefreshAccountSecurity: vi.fn(), onResetPassword: vi.fn(), onRetryAccounts: vi.fn(), onUpdateAccount: vi.fn() }; }

describe("mobile account list and activity", () => {
  it("targets the clicked account in commands even when another account is selected", () => {
    const other = { ...account, id: "a-2", login: "mobile.two" };
    const props = { ...listProps(), accounts: [account, other] };
    render(<MobileAccountListPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Действия mobile.two" }));
    fireEvent.click(screen.getByRole("button", { name: "Заблокировать" }));
    expect(props.onToggleBlockAccount).toHaveBeenCalledWith(other.id);
    expect(props.onToggleBlockAccount).not.toHaveBeenCalledWith(account.id);
    fireEvent.click(screen.getByRole("button", { name: "Действия mobile.two" }));
    fireEvent.click(screen.getByRole("button", { name: "Редактировать" }));
    expect(props.onSelectAccount).toHaveBeenCalledWith(other.id);
    expect(props.onOpenPanel).toHaveBeenCalledWith("edit", other.id);
  });
  it("filters by employee and device, resets filters, and clamps a page when records disappear", () => {
    const accounts = Array.from({ length: 26 }, (_, i) => ({ ...account, id: `a-${i}`, login: `user.${i}`, device: i === 25 ? "Armor" : "Samsung" }));
    const props = { ...listProps(), accounts };
    const view = render(<MobileAccountListPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    expect(screen.getByRole("button", { name: "Открыть аккаунт user.25" })).toBeInTheDocument();
    view.rerender(<MobileAccountListPanel {...props} accounts={accounts.slice(0, 1)} />);
    expect(screen.getByRole("button", { name: "Открыть аккаунт user.0" })).toBeInTheDocument();
    view.rerender(<MobileAccountListPanel {...props} />);
    expect(screen.getByRole("button", { name: "Открыть аккаунт user.0" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Поиск аккаунта"), { target: { value: "Иванов" } });
    fireEvent.change(screen.getByLabelText("Устройство"), { target: { value: "Armor" } });
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Сбросить" }));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(26);
  });
  it("keeps cached rows and the search while loading, and hides management commands for read-only users", () => {
    const props = { ...listProps(), canManage: false };
    const view = render(<MobileAccountListPanel {...props} />);
    fireEvent.change(screen.getByLabelText("Поиск аккаунта"), { target: { value: "mobile.one" } });
    view.rerender(<MobileAccountListPanel {...props} status="loading" />);
    expect(screen.getByLabelText("Поиск аккаунта")).toHaveValue("mobile.one");
    expect(screen.getByRole("button", { name: "Открыть аккаунт mobile.one" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Действия mobile.one" })).not.toBeInTheDocument();
  });
  it("does not show records of the previously selected account or equate unfinished sessions with online", () => {
    render(<MobileAccountActivity {...detailProps()} sessions={[session("offline"), session("ended", { endedAt: "2026-09-30T12:00:00Z" }), session("expired", { status: "expired" }), session("alien", { accountId: "old-account", device: "Old device" })]} events={[event("alien", { accountId: "old-account", actor: "Previous user" })]} onShowSecurity={vi.fn()} onShowSessions={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Незавершённые сессии 1" })).toBeInTheDocument();
    expect(screen.queryByText("Old device")).not.toBeInTheDocument();
    expect(screen.queryByText(/Previous user/)).not.toBeInTheDocument();
    expect(screen.queryByText("Онлайн")).not.toBeInTheDocument();
  });
  it("uses the latest session per device without merging different devices of the same model", () => {
    const old = session("old", { deviceId: "same", lastSeenAt: "2026-09-28T11:00:00Z" });
    const latest = session("latest", { deviceId: "same" });
    const separate = session("separate", { deviceId: "another", device: latest.device });
    const records = [old, latest, separate];
    expect(accountDevices(records).map((item) => item.id)).toEqual(["latest", "separate"]);
    expect(records[0]).toBe(old);
    expect(accountDevices([session("unknown-1", { deviceId: "", device: "" }), session("unknown-2", { deviceId: "", device: "" })])).toHaveLength(2);
  });
});

describe("account dialogs", () => {
  it("opens actual sessions and security tabs with keyboard navigation and hides write actions for readers", () => {
    render(<MobileAccountDetail {...detailProps()} canManage={false} sessions={[session("own"), session("old", { accountId: "other", device: "Old device" })]} events={[event("own-event")]} />);
    expect(screen.queryByRole("button", { name: "Редактировать" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Изменить пароль" })).not.toBeInTheDocument();
    const overview = screen.getByRole("tab", { name: "Обзор" });
    fireEvent.keyDown(overview, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Сотрудники 1" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(screen.getByText("Не завершена")).toBeInTheDocument();
    expect(screen.queryByText("Old device")).not.toBeInTheDocument();
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(screen.getByText("Вход на Samsung")).toBeInTheDocument();
  });
  it("retains the creation draft on server rejection and retries the correct password flow", async () => {
    const onCreateAccount = vi.fn().mockRejectedValueOnce(new Error("Логин занят")).mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<MobileAccountCreateDrawer onCreateAccount={onCreateAccount} onClose={onClose} onNotify={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Введите логин (например, ivan.petrov)"), { target: { value: "mobile.new" } });
    fireEvent.click(screen.getByRole("button", { name: "Создать аккаунт" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Логин занят");
    expect(screen.getByPlaceholderText("Введите логин (например, ivan.petrov)")).toHaveValue("mobile.new");
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Создать аккаунт" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onCreateAccount).toHaveBeenLastCalledWith(expect.objectContaining({ login: "mobile.new", temporaryPassword: true, password: undefined }));
  });
  it("validates custom passwords and sends additional settings without losing defaults", async () => {
    const onCreateAccount = vi.fn();
    render(<MobileAccountCreateDrawer onCreateAccount={onCreateAccount} onNotify={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Введите логин (например, ivan.petrov)"), { target: { value: "custom.login" } });
    fireEvent.click(screen.getByRole("radio", { name: "Задать вручную" }));
    fireEvent.change(screen.getByPlaceholderText("Введите пароль"), { target: { value: "Test-only-123" } });
    fireEvent.change(screen.getByPlaceholderText("Повторите пароль"), { target: { value: "different" } });
    fireEvent.click(screen.getByRole("button", { name: "Создать аккаунт" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Пароли должны совпадать");
    expect(onCreateAccount).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText("Повторите пароль"), { target: { value: "Test-only-123" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Требовать смену пароля при первом входе" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Язык интерфейса" }), { target: { value: "en" } });
    fireEvent.click(screen.getByRole("button", { name: "Создать аккаунт" }));
    await waitFor(() => expect(onCreateAccount).toHaveBeenCalledTimes(1));
    expect(onCreateAccount).toHaveBeenCalledWith(expect.objectContaining({ password: "Test-only-123", confirmPassword: "Test-only-123", temporaryPassword: false, language: "en", requirePasswordChange: true, employeeScope: "selected", bindEmployee: false }));
  });
  it.each(["password", "delete"] as const)("keeps the %s dialog open and displays server failures", async (operation) => {
    const onClose = vi.fn(), fail = vi.fn().mockRejectedValue(new Error("Сервер недоступен"));
    render(operation === "password" ? <MobileAccountPasswordPanel selected={account} onClose={onClose} onNotify={vi.fn()} onResetPassword={fail} /> : <MobileAccountDeletePanel selected={account} onClose={onClose} onDeleteAccount={fail} />);
    fireEvent.click(screen.getByRole("button", { name: operation === "password" ? "Сбросить пароль" : "Удалить" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Сервер недоступен");
    expect(onClose).not.toHaveBeenCalled();
  });
  it("retains edits and presents a generic server failure after confirmation", async () => {
    const onClose = vi.fn(), onUpdateAccount = vi.fn().mockRejectedValue(new Error("Доступ запрещён"));
    render(<MobileAccountEditPanel selected={account} onClose={onClose} onNotify={vi.fn()} onUpdateAccount={onUpdateAccount} />);
    fireEvent.change(screen.getByRole("textbox", { name: /Логин/ }), { target: { value: "edited.login" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить изменения" }));
    fireEvent.click(screen.getByRole("button", { name: "Да, сохранить" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Доступ запрещён");
    expect(screen.getByRole("textbox", { name: /Логин/ })).toHaveValue("edited.login");
    expect(onClose).not.toHaveBeenCalled();
  });
  it("does not replace an editing draft when the same account refreshes in the background", () => {
    const props = { selected: account, onClose: vi.fn(), onNotify: vi.fn(), onUpdateAccount: vi.fn() };
    const view = render(<MobileAccountEditPanel {...props} />);
    fireEvent.change(screen.getByRole("textbox", { name: /Логин/ }), { target: { value: "my.draft" } });
    view.rerender(<MobileAccountEditPanel {...props} selected={{ ...account, login: "server.changed", lastSeen: "01.10.2026, 09:00" }} />);
    expect(screen.getByRole("textbox", { name: /Логин/ })).toHaveValue("my.draft");
  });
  it("traps focus, skips collapsed fields, and restores the opener on Escape", () => {
    render(<MobileAccountsScreen {...workspaceProps()} />);
    const opener = screen.getByRole("button", { name: "Создать аккаунт" }); opener.focus(); fireEvent.click(opener);
    const dialog = screen.getByRole("dialog");
    const submit = within(dialog).getByRole("button", { name: "Создать аккаунт" });
    submit.focus(); fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Закрыть окно" }));
    const cancel = within(dialog).getByRole("button", { name: "Отмена" });
    cancel.focus(); fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement?.tagName).toBe("SUMMARY");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(opener);
  });
  it("blocks dismissing or editing the creation form while a request is pending", async () => {
    let resolve!: () => void;
    const onCreateAccount = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    render(<MobileAccountsScreen {...workspaceProps()} onCreateAccount={onCreateAccount} />);
    fireEvent.click(screen.getByRole("button", { name: "Создать аккаунт" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Логин" }), { target: { value: "mobile.pending" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Создать аккаунт" }));
    expect(screen.getByRole("textbox", { name: "Логин" })).toBeDisabled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onCreateAccount).toHaveBeenCalledTimes(1);
    await act(async () => resolve());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
  it("protects a creation draft through Cancel, Escape, and discard", () => {
    render(<MobileAccountsScreen {...workspaceProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "Создать аккаунт" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Логин" }), { target: { value: "keep.my.draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(screen.getByRole("dialog", { name: "Несохранённые изменения" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Продолжить редактирование" }));
    expect(screen.getByRole("textbox", { name: "Логин" })).toHaveValue("keep.my.draft");
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Закрыть без сохранения" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Создать аккаунт" }));
    expect(screen.getByRole("textbox", { name: "Логин" })).toHaveValue("");
  });
  it("edits the clicked account and keeps its target and draft across selection and background refresh", async () => {
    const other = { ...account, id: "a-2", login: "mobile.two" };
    const props = { ...workspaceProps(), accounts: [account, other], onUpdateAccount: vi.fn() };
    const view = render(<MobileAccountsScreen {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Действия mobile.two" }));
    fireEvent.click(screen.getByRole("button", { name: "Редактировать" }));
    expect(screen.getByRole("textbox", { name: /Логин/ })).toHaveValue("mobile.two");
    fireEvent.change(screen.getByRole("textbox", { name: /Логин/ }), { target: { value: "my.edited.login" } });
    view.rerender(<MobileAccountsScreen {...props} accounts={[account, { ...other, login: "remote.edit" }]} />);
    expect(screen.getByRole("textbox", { name: /Логин/ })).toHaveValue("my.edited.login");
    fireEvent.click(screen.getByRole("button", { name: "Сохранить изменения" }));
    fireEvent.click(screen.getByRole("button", { name: "Да, сохранить" }));
    await waitFor(() => expect(props.onUpdateAccount).toHaveBeenCalledWith(expect.objectContaining({ login: "my.edited.login" }), other.id));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
  it("protects changed bindings but does not mistake search text for a binding change", () => {
    render(<MobileAccountsScreen {...workspaceProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "Действия mobile.one" }));
    fireEvent.click(screen.getByRole("button", { name: "Управлять привязками" }));
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Действия mobile.one" }));
    fireEvent.click(screen.getByRole("button", { name: "Управлять привязками" }));
    fireEvent.click(screen.getByRole("button", { name: "Убрать Иванов Иван Иванович" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Несохранённые изменения" })).toBeInTheDocument();
  });
  it("ignores a late creation response after the editor has unmounted", async () => {
    let resolve!: () => void;
    const onCreateAccount = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    const onClose = vi.fn();
    const view = render(<MobileAccountCreateDrawer onCreateAccount={onCreateAccount} onClose={onClose} onNotify={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Логин" }), { target: { value: "pending.login" } });
    const form = screen.getByRole("button", { name: "Создать аккаунт" }).getAttribute("form")!;
    act(() => { fireEvent.submit(document.getElementById(form)!); fireEvent.submit(document.getElementById(form)!); });
    expect(onCreateAccount).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async () => resolve());
    expect(onClose).not.toHaveBeenCalled();
  });
});
