import { useMemo, useState } from "react";
import { getMobileAccountAccessLabel, getMobileAccountBindingCount } from "../../domain/mobileAccounts";
import type { AccountMode, DataSourceStatus, MobileAccount } from "../../types";
import { Chip, EmptyState, Panel, SectionTabs } from "../ui";

type MaybePromise<T> = T | Promise<T>;
export type MobileAccountWorkspacePanel = "create" | "link" | "edit" | "password" | "view" | "delete";

export function MobileAccountListPanel({
  activePanel,
  accounts,
  errorMessage,
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
  errorMessage?: string;
  mode: AccountMode;
  selectedAccountId: string;
  status?: DataSourceStatus;
  onDeleteAccount: () => MaybePromise<void>;
  onDetachEmployee: (employeeId?: string) => MaybePromise<void>;
  onModeChange: (mode: AccountMode) => void;
  onNotify: (message: string) => void;
  onOpenPanel: (panel: MobileAccountWorkspacePanel) => void;
  onRetry?: () => MaybePromise<void>;
  onSelectAccount: (id: string) => void;
  onToggleBlockAccount: () => MaybePromise<void>;
}) {
  const selected = accounts.find((account) => account.id === selectedAccountId);
  const isLoading = status === "loading";
  const isError = status === "error";
  const onlineSessions = accounts.filter((account) => account.session === "Онлайн").length;
  const boundAccounts = accounts.filter((account) => account.status !== "Не привязан").length;
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
        account.role.toLowerCase().includes(query) ||
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
    onOpenPanel(panel);
    setOpenMenuId(null);
  }

  async function detachFirstEmployee(account?: MobileAccount) {
    if (account) onSelectAccount(account.id);
    setOpenMenuId(null);
    const employeeId = account?.boundEmployeeIds?.[0];
    if (!employeeId && !account?.boundEmployees?.length) {
      onNotify("У аккаунта нет привязанных сотрудников");
      return;
    }

    await onDetachEmployee(employeeId);
  }

  async function toggleBlock(account?: MobileAccount) {
    if (account) onSelectAccount(account.id);
    setOpenMenuId(null);
    await onToggleBlockAccount();
  }

  return (
    <Panel
      className="accounts-panel"
      title="Аккаунты телефона"
      note="Создание, управление и привязка сотрудников к мобильным аккаунтам"
      actions={
        <>
          <button
            className={`button ${activePanel === "create" ? "primary" : "ghost"}`}
            onClick={() => onOpenPanel("create")}
            type="button"
          >
            Создать аккаунт
          </button>
          <button className={`button ${activePanel === "link" ? "primary" : "ghost"}`} onClick={() => onOpenPanel("link")} type="button">
            Привязать сотрудника
          </button>
          <button className={`button ${activePanel === "password" ? "primary" : "ghost"}`} onClick={() => onOpenPanel("password")} type="button">
            Изменить пароль
          </button>
          <button className={`button ${activePanel === "edit" ? "primary" : "ghost"}`} onClick={() => onOpenPanel("edit")} type="button">
            Редактировать
          </button>
          <button className={`button ${activePanel === "view" ? "primary" : "ghost"}`} onClick={() => onOpenPanel("view")} type="button">
            Просмотр
          </button>
          <button className={`button ghost danger-outline ${activePanel === "delete" ? "active-danger" : ""}`} onClick={() => onOpenPanel("delete")} type="button">
            Удалить
          </button>
        </>
      }
    >
      <div className="filters account-filters">
        <label className="wide-filter">
          Поиск
          <input
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Поиск по логину или сотруднику..."
            value={searchQuery}
          />
        </label>
        <label>
          Роль
          <select onChange={(event) => setRoleFilter(event.target.value)} value={roleFilter}>
            <option value="all">Все</option>
            {roles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>
        <label>
          Статус аккаунта
          <select onChange={(event) => setAccountStatusFilter(event.target.value)} value={accountStatusFilter}>
            <option value="all">Все</option>
            {accountStatuses.map((accountStatus) => (
              <option key={accountStatus} value={accountStatus}>
                {accountStatus}
              </option>
            ))}
          </select>
        </label>
        <label>
          Статус сессии
          <select onChange={(event) => setSessionStatusFilter(event.target.value)} value={sessionStatusFilter}>
            <option value="all">Все</option>
            {sessionStatuses.map((sessionStatus) => (
              <option key={sessionStatus} value={sessionStatus}>
                {sessionStatus}
              </option>
            ))}
          </select>
        </label>
        <button className="button ghost" onClick={resetFilters} type="button">
          Сбросить фильтры
        </button>
      </div>

      <div className="account-section-row">
        <SectionTabs
          value={mode}
          onChange={onModeChange}
          tabs={[
            { id: "accounts", label: "Аккаунты", count: filteredAccounts.length },
            { id: "sessions", label: "Сессии", count: onlineSessions },
            { id: "bindings", label: "Привязки", count: boundAccounts },
          ]}
        />
        <span>{filteredAccounts.length} из {accounts.length}</span>
      </div>

      {isLoading ? (
        <EmptyState
          title="Мобильные аккаунты загружаются"
          description="Получаем список мобильных аккаунтов из backend API. Локальный список в этом режиме не подмешивается."
        />
      ) : null}

      {isError ? (
        <EmptyState
          title="Мобильные аккаунты API не загружены"
          description={errorMessage ?? "Проверьте доступность backend API и повторите загрузку."}
          action={
            onRetry ? (
              <button className="button ghost" onClick={() => void onRetry()} type="button">
                Повторить загрузку
              </button>
            ) : undefined
          }
        />
      ) : null}

      {!isLoading && !isError && mode === "accounts" ? (
        filteredAccounts.length > 0 ? (
          <MobileAccountsTable
            accounts={filteredAccounts}
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
                onClick={accounts.length > 0 ? resetFilters : () => onOpenPanel("create")}
                type="button"
              >
                {accounts.length > 0 ? "Сбросить фильтры" : "Создать аккаунт"}
              </button>
            }
          />
        )
      ) : null}

      {!isLoading && !isError && mode === "sessions" ? (
        filteredAccounts.length > 0 ? (
          <div className="session-grid">
            {filteredAccounts.map((account) => (
              <button
                className={`session-card ${selected?.id === account.id ? "active" : ""}`}
                key={account.id}
                onClick={() => onSelectAccount(account.id)}
                type="button"
              >
                <strong>{account.login}</strong>
                <span>{account.session === "Онлайн" ? "Активная сессия" : "Сессия не активна"}</span>
                <em>{account.device}</em>
                <Chip>{account.session}</Chip>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Активных сессий нет"
            description="Сессии появятся после первого входа из мобильного приложения."
          />
        )
      ) : null}

      {!isLoading && !isError && mode === "bindings" ? (
        filteredAccounts.length > 0 ? (
          <div className="binding-grid">
            {filteredAccounts.map((account) => (
              <button
                className={`binding-card ${selected?.id === account.id ? "selected" : ""}`}
                key={account.id}
                onClick={() => onSelectAccount(account.id)}
                type="button"
              >
                <strong>{getMobileAccountAccessLabel(account)}</strong>
                <span>{account.login}</span>
                <em>{getMobileAccountBindingCount(account)}</em>
                <Chip>{account.status}</Chip>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Привязок нет"
            description="Привязка появится после создания аккаунта и выбора сотрудника."
          />
        )
      ) : null}
    </Panel>
  );
}

function MobileAccountsTable({
  accounts,
  openMenuId,
  selectedAccountId,
  setOpenMenuId,
  onDetachEmployee,
  onOpenPanel,
  onSelectAccount,
  onToggleBlockAccount,
}: {
  accounts: MobileAccount[];
  openMenuId: string | null;
  selectedAccountId: string;
  setOpenMenuId: (id: string | null) => void;
  onDetachEmployee: (account?: MobileAccount) => MaybePromise<void>;
  onOpenPanel: (panel: MobileAccountWorkspacePanel, account?: MobileAccount) => void;
  onSelectAccount: (id: string) => void;
  onToggleBlockAccount: (account?: MobileAccount) => MaybePromise<void>;
}) {
  return (
    <div className="table-wrap account-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Логин ↓</th>
            <th>Привязанные сотрудники ↓</th>
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
              className={`clickable ${selectedAccountId === account.id ? "selected" : ""}`}
              key={account.id}
              onClick={() => onSelectAccount(account.id)}
            >
              <td>
                <strong>{account.login}</strong>
              </td>
              <td>
                <EmployeeChipList account={account} />
              </td>
              <td>{account.role}</td>
              <td>
                <Chip>{account.status}</Chip>
              </td>
              <td>
                <SessionBadge value={account.session} />
              </td>
              <td>{account.lastSeen}</td>
              <td>
                <span className="device-cell">{account.device}</span>
                <span className="muted-line">{account.version}</span>
              </td>
              <td className="account-actions-cell">
                <button
                  aria-label={`Просмотр ${account.login}`}
                  className="icon-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenPanel("view", account);
                  }}
                  type="button"
                >
                  ◉
                </button>
                <button
                  aria-label={`Редактировать ${account.login}`}
                  className="icon-button"
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
                  className="icon-button"
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
                    onOpenPanel={onOpenPanel}
                    onDetachEmployee={onDetachEmployee}
                    onToggleBlockAccount={onToggleBlockAccount}
                  />
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmployeeChipList({ account }: { account: MobileAccount }) {
  const employees = account.employeeScope === "all" ? ["Все сотрудники"] : account.boundEmployees ?? [];

  if (employees.length === 0) {
    return (
      <span className="empty-binding">
        —
        <small>Нет привязанных сотрудников</small>
      </span>
    );
  }

  return (
    <div className="employee-chip-list">
      {employees.slice(0, 3).map((employee) => (
        <span className="employee-chip" key={employee}>
          <span className="employee-avatar">{getInitials(employee)}</span>
          <span>
            <strong>{employee}</strong>
            <small>{account.employeeScope === "all" ? "Общий доступ" : "Сотрудник"}</small>
          </span>
        </span>
      ))}
      {employees.length > 3 ? <Chip tone="slate">+ еще {employees.length - 3}</Chip> : null}
      <span className="binding-count">{getMobileAccountBindingCount(account)}</span>
    </div>
  );
}

function SessionBadge({ value }: { value: MobileAccount["session"] }) {
  if (value === "-") return <span className="session-empty">—</span>;

  return (
    <span className={`session-badge ${value === "Онлайн" ? "online" : "offline"}`}>
      <span />
      {value}
    </span>
  );
}

function AccountActionMenu({
  account,
  onDetachEmployee,
  onOpenPanel,
  onToggleBlockAccount,
}: {
  account: MobileAccount;
  onDetachEmployee: (account?: MobileAccount) => MaybePromise<void>;
  onOpenPanel: (panel: MobileAccountWorkspacePanel, account?: MobileAccount) => void;
  onToggleBlockAccount: (account?: MobileAccount) => MaybePromise<void>;
}) {
  const isBlocked = account.status === "Заблокирован";

  return (
    <div className="account-action-menu" onClick={(event) => event.stopPropagation()}>
      <button onClick={() => onOpenPanel("view", account)} type="button">
        <span>◉</span> Просмотр
      </button>
      <button onClick={() => onOpenPanel("edit", account)} type="button">
        <span>✎</span> Редактировать
      </button>
      <button onClick={() => onOpenPanel("password", account)} type="button">
        <span>▣</span> Изменить пароль
      </button>
      <button onClick={() => onOpenPanel("link", account)} type="button">
        <span>+</span> Привязать сотрудника
      </button>
      <button onClick={() => onDetachEmployee(account)} type="button">
        <span>−</span> Отвязать сотрудника
      </button>
      <hr />
      <button className="danger-text" onClick={() => onToggleBlockAccount(account)} type="button">
        <span>!</span> {isBlocked ? "Разблокировать" : "Заблокировать"}
      </button>
      <button
        className="danger-text"
        onClick={() => {
          onOpenPanel("delete", account);
        }}
        type="button"
      >
        <span>×</span> Удалить
      </button>
    </div>
  );
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right, "ru"));
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
