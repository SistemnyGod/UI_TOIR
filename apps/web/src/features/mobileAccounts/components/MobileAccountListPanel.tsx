import { useMemo, useState } from "react";
import { getMobileAccountAccessLabel, getMobileAccountBindingCount } from "../../../domain/mobileAccounts";
import type { AccountMode, DataSourceStatus, MobileAccount } from "../../../types";
import { Chip, EmptyState, SectionTabs } from "../../../shared/ui";

type MaybePromise<T> = T | Promise<T>;
export type MobileAccountWorkspacePanel = "create" | "link" | "edit" | "password" | "view" | "delete";

export function MobileAccountListPanel({
  activePanel,
  accounts,
  canManage = true,
  errorMessage,
  isBusy = false,
  mode,
  selectedAccountId,
  status = "idle",
  onModeChange,
  onDetachEmployee,
  onNotify,
  onOpenPanel,
  onRetry,
  onSelectAccount,
  onToggleBlockAccount,
}: {
  activePanel: MobileAccountWorkspacePanel | null;
  accounts: MobileAccount[];
  canManage?: boolean;
  errorMessage?: string;
  isBusy?: boolean;
  mode: AccountMode;
  selectedAccountId: string;
  status?: DataSourceStatus;
  onDeleteAccount: () => MaybePromise<void>;
  onDetachEmployee: (employeeId?: string, accountId?: string) => MaybePromise<void>;
  onModeChange: (mode: AccountMode) => void;
  onNotify: (message: string) => void;
  onOpenPanel: (panel: MobileAccountWorkspacePanel) => void;
  onRetry?: () => MaybePromise<void>;
  onSelectAccount: (id: string) => void;
  onToggleBlockAccount: (accountId?: string) => MaybePromise<void>;
}) {
  const selected = accounts.find((account) => account.id === selectedAccountId);
  const isLoading = status === "loading";
  const isError = status === "error";
  const hasCachedAccounts = accounts.length > 0;
  const onlineSessions = accounts.filter((account) => isOnline(account.session)).length;
  const boundAccounts = accounts.filter((account) => account.boundEmployees.length > 0 || account.employeeScope === "all").length;
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [accountStatusFilter, setAccountStatusFilter] = useState("all");
  const [sessionStatusFilter, setSessionStatusFilter] = useState("all");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const roles = useMemo(() => uniqueSorted(accounts.map((account) => account.role)), [accounts]);
  const accountStatuses = useMemo(() => uniqueSorted(accounts.map((account) => account.status)), [accounts]);
  const sessionStatuses = useMemo(() => uniqueSorted(accounts.map((account) => account.session)), [accounts]);
  const filteredAccounts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return accounts.filter((account) => {
      const employeeText = [account.employee, ...(account.boundEmployees ?? [])].join(" ").toLowerCase();
      const matchesSearch =
        query.length === 0 ||
        account.login.toLowerCase().includes(query) ||
        displayKnownValue(account.role).toLowerCase().includes(query) ||
        employeeText.includes(query);
      const matchesRole = roleFilter === "all" || account.role === roleFilter;
      const matchesAccountStatus = accountStatusFilter === "all" || account.status === accountStatusFilter;
      const matchesSessionStatus = sessionStatusFilter === "all" || account.session === sessionStatusFilter;

      return matchesSearch && matchesRole && matchesAccountStatus && matchesSessionStatus;
    });
  }, [accountStatusFilter, accounts, roleFilter, searchQuery, sessionStatusFilter]);

  function resetFilters() {
    setSearchQuery("");
    setRoleFilter("all");
    setAccountStatusFilter("all");
    setSessionStatusFilter("all");
  }

  function openPanelForAccount(panel: MobileAccountWorkspacePanel, account?: MobileAccount) {
    if (account) onSelectAccount(account.id);
    if (!canManage && panel !== "view") {
      onNotify("Недостаточно прав для управления мобильными аккаунтами.");
      setOpenMenuId(null);
      return;
    }

    onOpenPanel(panel);
    setOpenMenuId(null);
  }

  async function detachFirstEmployee(account?: MobileAccount) {
    if (!canManage) {
      onNotify("Недостаточно прав для управления мобильными аккаунтами.");
      setOpenMenuId(null);
      return;
    }

    if (account) onSelectAccount(account.id);
    setOpenMenuId(null);
    const employeeId = account?.boundEmployeeIds?.[0];
    if (!employeeId && !account?.boundEmployees?.length) {
      onNotify("У аккаунта нет привязанных сотрудников.");
      return;
    }

    await onDetachEmployee(employeeId, account?.id);
  }

  async function toggleBlock(account?: MobileAccount) {
    if (!canManage) {
      onNotify("Недостаточно прав для управления мобильными аккаунтами.");
      setOpenMenuId(null);
      return;
    }

    if (account) onSelectAccount(account.id);
    setOpenMenuId(null);
    await onToggleBlockAccount(account?.id);
  }

  return (
    <section className="mobile-am-panel mobile-am-accounts-panel">
      <div className="mobile-am-panel-head">
        <div>
          <h2>Аккаунты телефона</h2>
          <p>Создание, управление и привязка сотрудников к мобильным аккаунтам</p>
        </div>
        <div className="mobile-am-actions">
          <button className={activePanel === "create" ? "primary" : ""} disabled={!canManage || isBusy} onClick={() => onOpenPanel("create")} type="button">
            <span aria-hidden="true">+</span> Создать аккаунт
          </button>
          <button disabled={!canManage || isBusy || !selected} onClick={() => onOpenPanel("link")} type="button">
            <span aria-hidden="true">↔</span> Привязать сотрудника
          </button>
          <button disabled={!canManage || isBusy || !selected} onClick={() => onOpenPanel("password")} type="button">
            <span aria-hidden="true">⌘</span> Изменить пароль
          </button>
          <button disabled={!canManage || isBusy || !selected} onClick={() => onOpenPanel("edit")} type="button">
            <span aria-hidden="true">✎</span> Редактировать
          </button>
          <button disabled={isBusy || !selected} onClick={() => onOpenPanel("view")} type="button">
            <span aria-hidden="true">◎</span> Просмотр
          </button>
          <button className="danger" disabled={!canManage || isBusy || !selected} onClick={() => onOpenPanel("delete")} type="button">
            <span aria-hidden="true">×</span> Удалить
          </button>
        </div>
      </div>

      <div className="mobile-am-filters">
        <label className="mobile-am-search">
          <span>Поиск</span>
          <input
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Поиск по логину или сотруднику..."
            value={searchQuery}
          />
        </label>
        <FilterSelect label="Роль" onChange={setRoleFilter} value={roleFilter} values={roles} />
        <FilterSelect label="Статус аккаунта" onChange={setAccountStatusFilter} value={accountStatusFilter} values={accountStatuses} />
        <FilterSelect label="Статус сессии" onChange={setSessionStatusFilter} value={sessionStatusFilter} values={sessionStatuses} />
        <button className="mobile-am-reset" disabled={isBusy} onClick={resetFilters} type="button">
          Сбросить фильтры
        </button>
      </div>

      <div className="mobile-am-tabs-row">
        <SectionTabs
          value={mode}
          onChange={(nextMode) => { if (!isBusy) onModeChange(nextMode); }}
          tabs={[
            { id: "accounts", label: "Аккаунты", count: filteredAccounts.length },
            { id: "sessions", label: "Сессии", count: onlineSessions },
            { id: "bindings", label: "Привязки", count: boundAccounts },
          ]}
        />
        <span>{filteredAccounts.length} из {accounts.length}</span>
      </div>

      {isLoading && !hasCachedAccounts ? (
        <EmptyState
          title="Мобильные аккаунты загружаются"
          description="Получаем список из backend API. Локальные записи в API mode не подмешиваются."
        />
      ) : null}

      {isError && !hasCachedAccounts ? (
        <EmptyState
          title="Мобильные аккаунты API не загружены"
          description={errorMessage ?? "Проверьте доступность backend API и повторите загрузку."}
          action={
            onRetry ? (
              <button className="button ghost" disabled={isBusy} onClick={() => void onRetry()} type="button">
                Повторить загрузку
              </button>
            ) : undefined
          }
        />
      ) : null}

      {isError && hasCachedAccounts ? (
        <div aria-live="polite" className="mobile-am-inline-error" role="status">
          <span>Не удалось обновить список. Показаны последние загруженные данные.</span>
          {onRetry ? (
            <button disabled={isBusy} onClick={() => void onRetry()} type="button">Повторить</button>
          ) : null}
        </div>
      ) : null}
      {(!isLoading || hasCachedAccounts) && mode === "accounts" ? (
        filteredAccounts.length > 0 ? (
          <MobileAccountsTable
            accounts={filteredAccounts}
            canManage={canManage}
            isBusy={isBusy}
            openMenuId={openMenuId}
            selectedAccountId={selected?.id ?? ""}
            setOpenMenuId={setOpenMenuId}
            onDetachEmployee={detachFirstEmployee}
            onOpenPanel={openPanelForAccount}
            onSelectAccount={onSelectAccount}
            onToggleBlockAccount={toggleBlock}
          />
        ) : (
          <EmptyState
            title={accounts.length > 0 ? "Аккаунты не найдены" : "Мобильных аккаунтов нет"}
            description={accounts.length > 0 ? "Сбросьте фильтры или измените поисковый запрос." : "Создайте первый аккаунт или подключите список из backend API."}
            action={
              <button
                className="button ghost"
                disabled={accounts.length === 0 && !canManage}
                onClick={accounts.length > 0 ? resetFilters : () => onOpenPanel("create")}
                type="button"
              >
                {accounts.length > 0 ? "Сбросить фильтры" : "Создать аккаунт"}
              </button>
            }
          />
        )
      ) : null}

      {(!isLoading || hasCachedAccounts) && mode === "sessions" ? (
        filteredAccounts.length > 0 ? (
          <div className="mobile-am-card-grid">
            {filteredAccounts.map((account) => (
              <button
                className={`mobile-am-card ${selected?.id === account.id ? "active" : ""}`}
                key={account.id}
                disabled={isBusy}
                onClick={() => onSelectAccount(account.id)}
                type="button"
              >
                <strong>{account.login}</strong>
                <span>{isOnline(account.session) ? "Активная сессия" : "Сессия не активна"}</span>
                <em>{formatDevice(account)}</em>
                <Chip>{displaySession(account.session)}</Chip>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState title="Активных сессий нет" description="Сессии появятся после первого входа из мобильного приложения." />
        )
      ) : null}

      {(!isLoading || hasCachedAccounts) && mode === "bindings" ? (
        filteredAccounts.length > 0 ? (
          <div className="mobile-am-card-grid">
            {filteredAccounts.map((account) => (
              <button
                className={`mobile-am-card ${selected?.id === account.id ? "active" : ""}`}
                key={account.id}
                disabled={isBusy}
                onClick={() => onSelectAccount(account.id)}
                type="button"
              >
                <strong>{getMobileAccountAccessLabel(account)}</strong>
                <span>{account.login}</span>
                <em>{getMobileAccountBindingCount(account)}</em>
                <Chip>{displayStatus(account.status)}</Chip>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState title="Привязок нет" description="Привязка появится после создания аккаунта и выбора сотрудника." />
        )
      ) : null}
    </section>
  );
}

function FilterSelect({
  label,
  onChange,
  value,
  values,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
  values: string[];
}) {
  return (
    <label>
      <span>{label}</span>
      <select onChange={(event) => onChange(event.target.value)} value={value}>
        <option value="all">Все</option>
        {values.map((item) => (
          <option key={item} value={item}>
            {displayKnownValue(item)}
          </option>
        ))}
      </select>
    </label>
  );
}

function MobileAccountsTable({
  accounts,
  canManage,
  isBusy,
  openMenuId,
  selectedAccountId,
  setOpenMenuId,
  onDetachEmployee,
  onOpenPanel,
  onSelectAccount,
  onToggleBlockAccount,
}: {
  accounts: MobileAccount[];
  canManage: boolean;
  isBusy: boolean;
  openMenuId: string | null;
  selectedAccountId: string;
  setOpenMenuId: (id: string | null) => void;
  onDetachEmployee: (account?: MobileAccount) => MaybePromise<void>;
  onOpenPanel: (panel: MobileAccountWorkspacePanel, account?: MobileAccount) => void;
  onSelectAccount: (id: string) => void;
  onToggleBlockAccount: (account?: MobileAccount) => MaybePromise<void>;
}) {
  return (
    <div className="mobile-am-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Логин</th>
            <th>Привязанные сотрудники</th>
            <th>Роль</th>
            <th>Статус аккаунта</th>
            <th>Статус сессии</th>
            <th>Последняя активность</th>
            <th>Устройство</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((account) => (
            <tr
              className={selectedAccountId === account.id ? "selected" : ""}
              key={account.id}
              onClick={() => { if (!isBusy) onSelectAccount(account.id); }}
            >
              <td data-label="Логин">
                <strong className="mobile-am-login">{account.login}</strong>
              </td>
              <td data-label="Сотрудники">
                <EmployeeChipList account={account} />
              </td>
              <td data-label="Роль">{displayKnownValue(account.role)}</td>
              <td data-label="Статус аккаунта">
                <StatusBadge value={account.status} />
              </td>
              <td data-label="Статус сессии">
                <SessionBadge value={account.session} />
              </td>
              <td data-label="Последняя активность">{account.lastSeen || "-"}</td>
              <td data-label="Устройство">
                <span className="mobile-am-device">{account.device || "-"}</span>
                <span className="muted-line">{account.version || ""}</span>
              </td>
              <td className="mobile-am-actions-cell" data-label="Действия">
                <button
                  aria-label={`Просмотр ${account.login}`}
                  disabled={isBusy}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenPanel("view", account);
                  }}
                  type="button"
                >
                  ◎
                </button>
                <button
                  aria-label={`Редактировать ${account.login}`}
                  disabled={!canManage || isBusy}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenPanel("edit", account);
                  }}
                  type="button"
                >
                  ✎
                </button>
                <button
                  aria-label={`Действия ${account.login}`}
                  disabled={!canManage || isBusy}
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpenMenuId(openMenuId === account.id ? null : account.id);
                  }}
                  type="button"
                >
                  ⋯
                </button>
                {openMenuId === account.id ? (
                  <AccountActionMenu
                    account={account}
                    isBusy={isBusy}
                    onDetachEmployee={onDetachEmployee}
                    onOpenPanel={onOpenPanel}
                    onToggleBlockAccount={onToggleBlockAccount}
                  />
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mobile-am-list-footer">Показано аккаунтов: {accounts.length}</div>
    </div>
  );
}

function EmployeeChipList({ account }: { account: MobileAccount }) {
  const employees = account.employeeScope === "all" ? ["Все сотрудники"] : account.boundEmployees ?? [];

  if (employees.length === 0) {
    return (
      <span className="mobile-am-empty-binding">
        -
        <small>Нет привязанных сотрудников</small>
      </span>
    );
  }

  return (
    <div className="mobile-am-employee-list">
      {employees.slice(0, 4).map((employee) => (
        <span className="mobile-am-avatar" key={employee} title={employee}>
          {getInitials(employee)}
        </span>
      ))}
      {employees.length > 4 ? <span className="mobile-am-more">+{employees.length - 4}</span> : null}
      <span className="mobile-am-binding-count">{getMobileAccountBindingCount(account)}</span>
    </div>
  );
}

function StatusBadge({ value }: { value: MobileAccount["status"] }) {
  return <span className={`mobile-am-badge ${statusTone(value)}`}>{displayStatus(value)}</span>;
}

function SessionBadge({ value }: { value: MobileAccount["session"] }) {
  if (displaySession(value) === "-") return <span className="mobile-am-session-empty">-</span>;

  return (
    <span className={`mobile-am-session ${isOnline(value) ? "online" : "offline"}`}>
      <span />
      {displaySession(value)}
    </span>
  );
}

function AccountActionMenu({
  account,
  isBusy,
  onDetachEmployee,
  onOpenPanel,
  onToggleBlockAccount,
}: {
  account: MobileAccount;
  isBusy: boolean;
  onDetachEmployee: (account?: MobileAccount) => MaybePromise<void>;
  onOpenPanel: (panel: MobileAccountWorkspacePanel, account?: MobileAccount) => void;
  onToggleBlockAccount: (account?: MobileAccount) => MaybePromise<void>;
}) {
  const isBlocked = isAccountStatus(account.status, "blocked");

  return (
    <div className="mobile-am-menu" onClick={(event) => event.stopPropagation()}>
      <button disabled={isBusy} onClick={() => onOpenPanel("view", account)} type="button">◎ Просмотр</button>
      <button disabled={isBusy} onClick={() => onOpenPanel("edit", account)} type="button">✎ Редактировать</button>
      <button disabled={isBusy} onClick={() => onOpenPanel("password", account)} type="button">⌘ Изменить пароль</button>
      <button disabled={isBusy} onClick={() => onOpenPanel("link", account)} type="button">+ Привязать сотрудника</button>
      <button disabled={isBusy} onClick={() => onDetachEmployee(account)} type="button">- Отвязать сотрудника</button>
      <hr />
      <button className="danger-text" disabled={isBusy} onClick={() => onToggleBlockAccount(account)} type="button">
        ! {isBlocked ? "Разблокировать" : "Заблокировать"}
      </button>
      <button className="danger-text" disabled={isBusy} onClick={() => onOpenPanel("delete", account)} type="button">
        × Удалить
      </button>
    </div>
  );
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => displayKnownValue(left).localeCompare(displayKnownValue(right), "ru"));
}

function getInitials(value: string) {
  const words = value
    .replace(/[+0-9]/g, "")
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return "АК";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}

function isOnline(value: string) {
  return normalizeValue(value).includes("онлайн");
}

function isAccountStatus(value: string, status: "active" | "blocked" | "unbound") {
  const normalized = normalizeValue(value);
  if (status === "active") return normalized.includes("актив");
  if (status === "blocked") return normalized.includes("заблок");
  return normalized.includes("не привязан");
}

function statusTone(value: string) {
  if (isAccountStatus(value, "active")) return "green";
  if (isAccountStatus(value, "blocked")) return "red";
  if (isAccountStatus(value, "unbound")) return "orange";
  return "slate";
}

function displayStatus(value: string) {
  if (isAccountStatus(value, "active")) return "Активен";
  if (isAccountStatus(value, "blocked")) return "Заблокирован";
  if (isAccountStatus(value, "unbound")) return "Не привязан";
  return displayKnownValue(value);
}

function displaySession(value: string) {
  const normalized = normalizeValue(value);
  if (normalized.includes("онлайн")) return "Онлайн";
  if (normalized.includes("офлайн")) return "Оффлайн";
  return "-";
}

function displayKnownValue(value: string) {
  return decodeMojibake(value);
}

function formatDevice(account: MobileAccount) {
  return [account.device, account.version].filter(Boolean).join(" / ") || "-";
}

function normalizeValue(value: string) {
  return decodeMojibake(value).toLowerCase();
}

function decodeMojibake(value: string) {
  const map: Record<string, string> = {
    "Активен": "Активен",
    "Не привязан": "Не привязан",
    "Заблокирован": "Заблокирован",
    "Онлайн": "Онлайн",
    "Офлайн": "Оффлайн",
    "Маршрутный обходчик": "Маршрутный обходчик",
    "Оператор": "Оператор",
    "Администратор мобильного доступа": "Администратор мобильного доступа",
  };

  return map[value] ?? value;
}
