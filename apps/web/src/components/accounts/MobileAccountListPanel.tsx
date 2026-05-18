import { getMobileAccountAccessLabel, getMobileAccountBindingCount } from "../../domain/mobileAccounts";
import type { AccountMode, MobileAccount } from "../../types";
import { Chip, EmptyState, Panel, SectionTabs } from "../ui";

type MaybePromise<T> = T | Promise<T>;

export function MobileAccountListPanel({
  accounts,
  employeeName,
  mode,
  selectedAccountId,
  onAttachEmployee,
  onDeleteAccount,
  onModeChange,
  onNotify,
  onResetPassword,
  onSelectAccount,
}: {
  accounts: MobileAccount[];
  employeeName: string;
  mode: AccountMode;
  selectedAccountId: string;
  onAttachEmployee: (employeeName: string) => MaybePromise<void>;
  onDeleteAccount: () => MaybePromise<void>;
  onModeChange: (mode: AccountMode) => void;
  onNotify: (message: string) => void;
  onResetPassword: () => MaybePromise<void>;
  onSelectAccount: (id: string) => void;
}) {
  const selected = accounts.find((account) => account.id === selectedAccountId);
  const onlineSessions = accounts.filter((account) => account.session === "Онлайн").length;
  const boundAccounts = accounts.filter((account) => account.status !== "Не привязан").length;

  return (
    <Panel
      title="Аккаунты телефона"
      note="Создание, удаление, сброс пароля и привязка сотрудников к мобильному входу"
      actions={
        <>
          <button
            className="button primary"
            onClick={() => onNotify("Заполните форму справа, затем создайте мобильный аккаунт")}
            type="button"
          >
            Создать аккаунт
          </button>
          <button className="button ghost" onClick={() => void onResetPassword()} type="button">
            Сбросить пароль
          </button>
          <button className="button ghost" onClick={() => void onAttachEmployee(employeeName)} type="button">
            Привязать
          </button>
          <button className="button ghost danger-outline" onClick={() => void onDeleteAccount()} type="button">
            Удалить
          </button>
        </>
      }
    >
      <div className="filters">
        <label className="wide-filter">
          Поиск
          <input placeholder="Логин, ФИО или телефон" />
        </label>
        <label>
          Статус аккаунта
          <select defaultValue="all">
            <option value="all">Все</option>
          </select>
        </label>
        <label>
          Статус сессии
          <select defaultValue="all">
            <option value="all">Все</option>
          </select>
        </label>
        <label>
          Роль
          <select defaultValue="all">
            <option value="all">Все</option>
          </select>
        </label>
      </div>

      <SectionTabs
        value={mode}
        onChange={onModeChange}
        tabs={[
          { id: "accounts", label: "Аккаунты", count: accounts.length },
          { id: "sessions", label: "Сессии", count: onlineSessions },
          { id: "bindings", label: "Привязки", count: boundAccounts },
        ]}
      />

      {mode === "accounts" ? (
        accounts.length > 0 ? (
          <MobileAccountsTable accounts={accounts} selectedAccountId={selected?.id ?? ""} onSelectAccount={onSelectAccount} />
        ) : (
          <EmptyState
            title="Мобильных аккаунтов нет"
            description="Создайте первый аккаунт или подключите список из backend API."
            action={
              <button
                className="button ghost"
                onClick={() => onNotify("Форма создания аккаунта находится справа")}
                type="button"
              >
                Создать аккаунт
              </button>
            }
          />
        )
      ) : null}

      {mode === "sessions" ? (
        accounts.length > 0 ? (
          <div className="session-grid">
            {accounts.map((account) => (
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

      {mode === "bindings" ? (
        accounts.length > 0 ? (
          <div className="binding-grid">
            {accounts.map((account) => (
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
  selectedAccountId,
  onSelectAccount,
}: {
  accounts: MobileAccount[];
  selectedAccountId: string;
  onSelectAccount: (id: string) => void;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Логин</th>
            <th>Доступ сотрудникам</th>
            <th>Роль</th>
            <th>Статус аккаунта</th>
            <th>Статус сессии</th>
            <th>Последняя активность</th>
            <th>Устройство</th>
            <th>Версия</th>
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
                <strong>{getMobileAccountAccessLabel(account)}</strong>
                <span className="muted-line">{getMobileAccountBindingCount(account)}</span>
              </td>
              <td>{account.role}</td>
              <td>
                <Chip>{account.status}</Chip>
              </td>
              <td>
                <Chip>{account.session}</Chip>
              </td>
              <td>{account.lastSeen}</td>
              <td>{account.device}</td>
              <td>{account.version}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
