import { LockKeyhole, MoreHorizontal, Pencil, RotateCcw, Search, Smartphone, Trash2, UserRoundPlus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AccountMode, DataSourceStatus, MobileAccount, MobileAccountSecurityEvent, MobileAccountSession } from "../../../types";
import { EmptyState, SectionTabs } from "../../../shared/ui";
import { accountBindingLabel, accountInitials } from "../accountPresentation";
import { AccountActivityNotice, AccountConnection, AccountRefresh, MobileAccountEvents, MobileAccountSessions } from "./MobileAccountActivity";

type MaybePromise<T> = T | Promise<T>;
export type MobileAccountWorkspacePanel = "create" | "link" | "edit" | "password" | "view" | "delete";
type Props = {
  activePanel: MobileAccountWorkspacePanel | null;
  accounts: MobileAccount[]; canManage?: boolean; errorMessage?: string; isBusy?: boolean;
  mode: AccountMode; selectedAccountId: string; status?: DataSourceStatus;
  sessions?: MobileAccountSession[]; events?: MobileAccountSecurityEvent[];
  securityStatus?: DataSourceStatus; securityErrorMessage?: string;
  onRefreshSecurity?: () => MaybePromise<void>;
  onDeleteAccount: () => MaybePromise<void>;
  onDetachEmployee: (employeeId?: string, accountId?: string) => MaybePromise<void>;
  onModeChange: (mode: AccountMode) => void; onNotify: (message: string) => void;
  onOpenPanel: (panel: MobileAccountWorkspacePanel, accountId?: string) => void;
  onRetry?: () => MaybePromise<void>; onSelectAccount: (id: string) => void;
  onToggleBlockAccount: (accountId?: string) => MaybePromise<void>;
};

export function MobileAccountListPanel({ accounts, canManage = true, errorMessage, isBusy = false, mode, selectedAccountId, status = "idle", sessions = [], events = [], securityStatus = "idle", securityErrorMessage, onRefreshSecurity = () => undefined, onModeChange, onNotify, onOpenPanel, onRetry, onSelectAccount, onToggleBlockAccount }: Props) {
  const selected = accounts.find((account) => account.id === selectedAccountId);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [accountStatus, setAccountStatus] = useState("all");
  const [device, setDevice] = useState("all");
  const [connection, setConnection] = useState("all");
  const [page, setPage] = useState(1);
  const [menuAccountId, setMenuAccountId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const menuRootRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const ownSessions = sessions.filter((session) => session.accountId === selectedAccountId);
  const ownEvents = events.filter((event) => event.accountId === selectedAccountId);
  const filteredAccounts = useMemo(() => accounts.filter((account) => {
    const text = [account.login, account.role, account.employee, ...account.boundEmployees].join(" ").toLocaleLowerCase("ru-RU");
    return text.includes(query.trim().toLocaleLowerCase("ru-RU")) && (role === "all" || account.role === role) &&
      (accountStatus === "all" || account.status === accountStatus) && (device === "all" || account.device === device) &&
      (connection === "all" || account.session === connection);
  }), [accounts, query, role, accountStatus, device, connection]);
  const pageCount = Math.max(1, Math.ceil(filteredAccounts.length / 25));
  const currentPage = Math.min(page, pageCount);
  const shownAccounts = filteredAccounts.slice((currentPage - 1) * 25, currentPage * 25);

  useEffect(() => { setPage(1); setMenuAccountId(null); }, [query, role, accountStatus, device, connection, mode]);
  useEffect(() => { setPage((current) => Math.min(current, pageCount)); }, [pageCount]);
  useEffect(() => {
    if (!menuAccountId) return;
    function positionMenu() {
      const trigger = menuTriggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const height = menuRootRef.current?.offsetHeight || 228;
      setMenuPosition({
        left: Math.max(8, Math.min(rect.right - 240, window.innerWidth - 248)),
        top: Math.max(8, rect.bottom + height + 8 <= window.innerHeight ? rect.bottom + 6 : rect.top - height - 6),
      });
    }
    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    menuRootRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !menuRootRef.current?.contains(event.target) && !menuTriggerRef.current?.contains(event.target)) setMenuAccountId(null);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); setMenuAccountId(null); menuTriggerRef.current?.focus(); }
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeOnEscape); window.removeEventListener("resize", positionMenu); window.removeEventListener("scroll", positionMenu, true); };
  }, [menuAccountId]);

  function resetFilters() { setQuery(""); setRole("all"); setAccountStatus("all"); setDevice("all"); setConnection("all"); }
  function open(panel: MobileAccountWorkspacePanel, account: MobileAccount) {
    if (isBusy || (!canManage && panel !== "view")) return;
    onSelectAccount(account.id); onOpenPanel(panel, account.id); setMenuAccountId(null);
  }
  async function toggleBlock(account: MobileAccount) {
    setMenuAccountId(null);
    try { await onToggleBlockAccount(account.id); } catch (error) { onNotify(error instanceof Error ? error.message : "Не удалось изменить доступ аккаунта."); }
  }
  const failedWithoutData = status === "error" && accounts.length === 0;
  const initiallyLoading = status === "loading" && accounts.length === 0;
  return <div className="aui-list-workspace">
    <div className="aui-tabs"><SectionTabs value={mode} onChange={(next) => { if (!isBusy) onModeChange(next); }} tabs={[
      { id: "accounts", label: "Аккаунты", count: accounts.length },
      { id: "sessions", label: "Сессии", count: ownSessions.length },
      { id: "bindings", label: "Привязки", count: selected?.boundEmployees.length ?? 0 },
      { id: "security", label: "События безопасности" },
    ]} /></div>
    <section className="aui-list-panel">
      {mode === "accounts" || mode === "bindings" ? <>
        <div className="aui-filters">
          <label className="aui-search"><span className="aui-sr-only">Поиск аккаунта</span><Search aria-hidden="true" size={18} /><input onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Поиск по логину или сотруднику..." value={query} /></label>
          <AccountFilter label="Роль" allLabel="Все роли" value={role} onChange={setRole} values={accounts.map((account) => account.role)} />
          <AccountFilter label="Статус аккаунта" allLabel="Все статусы" value={accountStatus} onChange={setAccountStatus} values={accounts.map((account) => account.status)} />
          <AccountFilter label="Устройство" allLabel="Все устройства" value={device} onChange={setDevice} values={accounts.map((account) => account.device)} />
          <button className="aui-link aui-reset" onClick={resetFilters} type="button"><RotateCcw aria-hidden="true" size={18} />Сбросить</button>
        </div>
        <details className="aui-extra-filter"><summary>Фильтр по связи{connection !== "all" ? ` · ${connection}` : ""}</summary><AccountFilter label="Статус сессии" allLabel="Любое состояние связи" value={connection} onChange={setConnection} values={["Онлайн", "Офлайн", "-"]} /></details>
        {status === "loading" && accounts.length > 0 ? <div className="aui-source-notice" role="status">Обновляем список…</div> : null}
        {status === "error" && accounts.length > 0 ? <div className="aui-source-notice error" role="status"><span>Не удалось обновить список. Показаны последние загруженные данные.</span>{onRetry ? <button className="aui-link" onClick={() => void Promise.resolve().then(onRetry).catch(() => undefined)} type="button">Повторить</button> : null}</div> : null}
        {initiallyLoading ? <EmptyState title="Мобильные аккаунты загружаются" description="Получаем список аккаунтов с сервера." /> : failedWithoutData ? <EmptyState title="Не удалось загрузить мобильные аккаунты" description={errorMessage || "Не удалось получить список аккаунтов."} action={onRetry ? <button className="aui-button" onClick={() => void Promise.resolve().then(onRetry).catch(() => undefined)} type="button">Повторить загрузку</button> : undefined} /> : !filteredAccounts.length ? <EmptyState title={accounts.length ? "Аккаунты не найдены" : "Мобильных аккаунтов нет"} description={accounts.length ? "Измените запрос или сбросьте фильтры." : "Создайте аккаунт для входа в мобильное приложение."} action={accounts.length ? <button className="aui-button" onClick={resetFilters} type="button">Сбросить фильтры</button> : canManage ? <button className="aui-button" disabled={isBusy} onClick={() => onOpenPanel("create")} type="button">Создать аккаунт</button> : undefined} /> : <>
          <div className="aui-table-wrap"><table className="aui-account-table"><thead><tr><th>Логин</th><th>Сотрудники</th><th>Роль</th><th>Доступ</th><th>Устройство и связь</th><th>Последняя активность</th><th>Действия</th></tr></thead><tbody>
            {shownAccounts.map((account) => <tr className={selectedAccountId === account.id ? "selected" : ""} key={account.id} onClick={() => { if (!isBusy) onSelectAccount(account.id); }}>
              <td data-label="Логин"><button className="aui-login" disabled={isBusy} onClick={(event) => { event.stopPropagation(); open("view", account); }} type="button">{account.login}</button></td>
              <td data-label="Сотрудники">{mode === "bindings" ? <div className="aui-bound-names">{account.employeeScope === "all" ? "Все сотрудники" : account.boundEmployees.length ? account.boundEmployees.map((name) => <span key={name}>{name}</span>) : "Сотрудники не привязаны"}{canManage ? <button className="aui-link" disabled={isBusy} onClick={(event) => { event.stopPropagation(); open("link", account); }} type="button">Управлять привязками</button> : null}</div> : <div className="aui-employee-summary"><div className="aui-avatar-list">{account.boundEmployees.slice(0, 4).map((name) => <span className="aui-avatar" key={name} title={name}>{accountInitials(name)}</span>)}{account.boundEmployees.length > 4 ? <span className="aui-avatar">+{account.boundEmployees.length - 4}</span> : null}</div><span>{accountBindingLabel(account)}</span></div>}</td>
              <td data-label="Роль">{account.role}</td>
              <td data-label="Доступ"><AccountAccess value={account.status} /></td>
              <td data-label="Устройство и связь"><div className="aui-account-device"><Smartphone aria-hidden="true" size={23} /><div><strong>{account.device || "Устройство не определено"}</strong><span>Приложение {account.version || "—"}</span><AccountConnection value={account.session} /></div></div></td>
              <td data-label="Последняя активность"><time>{account.lastSeen || "—"}</time></td>
              <td className="aui-row-actions" data-label="Действия"><button aria-label={`Открыть аккаунт ${account.login}`} className="aui-button" disabled={isBusy} onClick={(event) => { event.stopPropagation(); open("view", account); }} type="button">Открыть</button>{canManage ? <button aria-label={`Действия ${account.login}`} aria-expanded={menuAccountId === account.id} className="aui-icon-button" disabled={isBusy} onClick={(event) => { event.stopPropagation(); menuTriggerRef.current = event.currentTarget; setMenuAccountId(menuAccountId === account.id ? null : account.id); }} type="button"><MoreHorizontal aria-hidden="true" size={20} /></button> : null}
                {menuAccountId === account.id && canManage ? createPortal(<div className="aui-action-menu aui-menu-portal" style={menuPosition} aria-label={`Команды аккаунта ${account.login}`} ref={menuRootRef} onClick={(event) => event.stopPropagation()}>
                  <button disabled={isBusy} onClick={() => open("edit", account)} type="button"><Pencil aria-hidden="true" size={17} />Редактировать</button>
                  <button disabled={isBusy} onClick={() => open("link", account)} type="button"><UserRoundPlus aria-hidden="true" size={17} />Управлять привязками</button>
                  <button disabled={isBusy} onClick={() => open("password", account)} type="button"><LockKeyhole aria-hidden="true" size={17} />Изменить пароль</button>
                  <button disabled={isBusy} onClick={() => void toggleBlock(account)} type="button"><LockKeyhole aria-hidden="true" size={17} />{account.status === "Заблокирован" ? "Разблокировать" : "Заблокировать"}</button>
                  <button className="danger" disabled={isBusy} onClick={() => open("delete", account)} type="button"><Trash2 aria-hidden="true" size={17} />Удалить аккаунт</button>
                </div>, document.body) : null}
              </td>
            </tr>)}
          </tbody></table></div>
          <footer className="aui-list-footer"><span>Показано аккаунтов: {shownAccounts.length} из {filteredAccounts.length}{filteredAccounts.length !== accounts.length ? ` · всего ${accounts.length}` : ""}</span>{pageCount > 1 ? <div className="aui-paging"><button className="aui-button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} type="button">Назад</button><span>{currentPage} / {pageCount}</span><button className="aui-button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)} type="button">Далее</button></div> : null}</footer>
        </>}
      </> : <>
        <header className="aui-activity-head"><div><h2>{mode === "sessions" ? "Сессии" : "События безопасности"}{selected ? ` · ${selected.login}` : ""}</h2><p>Данные выбранного аккаунта. Выберите другой во вкладке «Аккаунты».</p></div><AccountRefresh status={securityStatus} onRefresh={onRefreshSecurity} /></header>
        <AccountActivityNotice status={securityStatus} errorMessage={securityErrorMessage} onRefresh={onRefreshSecurity} />
        {!selected ? <div className="aui-empty"><strong>Выберите аккаунт</strong><span>Активность появится после выбора аккаунта из списка.</span></div> : mode === "sessions" ? <MobileAccountSessions sessions={ownSessions} /> : <MobileAccountEvents events={ownEvents} detailed />}
      </>}
    </section>
  </div>;
}

function AccountFilter({ label, allLabel, values, value, onChange }: { label: string; allLabel: string; values: string[]; value: string; onChange: (value: string) => void }) {
  const options = [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
  return <label className="aui-filter"><span className="aui-sr-only">{label}</span><select value={value} onChange={(event) => onChange(event.currentTarget.value)}><option value="all">{allLabel}</option>{options.map((option) => <option value={option} key={option}>{option === "-" ? "Нет данных" : option}</option>)}</select></label>;
}

export function AccountAccess({ value }: { value: MobileAccount["status"] }) {
  return <span className={`aui-access ${value === "Активен" ? "active" : value === "Заблокирован" ? "blocked" : "unbound"}`}><span aria-hidden="true" />{value}</span>;
}
