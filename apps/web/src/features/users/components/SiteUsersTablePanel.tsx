import { useMemo, useState } from "react";
import { EmptyState, Panel } from "../../../shared/ui";
import type { DataSourceStatus, SiteUser } from "../../../types";
import { SITE_USER_ROLES, SITE_USER_STATUSES } from "../../../repositories/siteUsersRepository";

interface SiteUsersTablePanelProps {
  users: SiteUser[];
  canManage?: boolean;
  errorMessage?: string;
  selectedUserId?: string;
  status?: DataSourceStatus;
  onOpenCreate: () => void;
  onOpenProfile?: (user: SiteUser) => void;
  onRetry?: () => void;
  onSelectUser: (id: string) => void;
}

const allRoles = ["all", ...SITE_USER_ROLES] as const;
const allStatuses = ["all", ...SITE_USER_STATUSES] as const;

export function SiteUsersTablePanel({
  users,
  canManage = true,
  errorMessage,
  selectedUserId,
  status = "idle",
  onOpenCreate,
  onOpenProfile,
  onRetry,
  onSelectUser,
}: SiteUsersTablePanelProps) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<(typeof allRoles)[number]>("all");
  const [userStatus, setUserStatus] = useState<(typeof allStatuses)[number]>("all");

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return users.filter((user) => {
      const matchesQuery = !normalizedQuery
        || user.login.toLowerCase().includes(normalizedQuery)
        || user.fullName.toLowerCase().includes(normalizedQuery)
        || user.role.toLowerCase().includes(normalizedQuery);
      const matchesRole = role === "all" || user.role === role;
      const matchesStatus = userStatus === "all" || user.status === userStatus;
      return matchesQuery && matchesRole && matchesStatus;
    });
  }, [query, role, userStatus, users]);

  return (
    <Panel
      title="Пользователи"
      note="Веб-доступ, роли, статусы, индивидуальные права и ограничения по участкам."
      className="site-users-table-panel site-users-directory-panel"
      actions={
        <button className="button primary" disabled={!canManage} onClick={onOpenCreate} type="button">
          Создать пользователя
        </button>
      }
    >
      <div
        className="site-users-toolbar"
        style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
      >
        <input
          aria-label="Поиск"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Логин, ФИО или роль"
          style={{ gridColumn: "1 / -1", minHeight: 32, padding: "0 10px" }}
        />
        <select
          aria-label="Роль"
          value={role}
          onChange={(event) => setRole(event.target.value as (typeof allRoles)[number])}
          style={{ minHeight: 32, padding: "0 10px" }}
        >
          {allRoles.map((item) => <option key={item} value={item}>{item === "all" ? "Все роли" : item}</option>)}
        </select>
        <select
          aria-label="Статус"
          value={userStatus}
          onChange={(event) => setUserStatus(event.target.value as (typeof allStatuses)[number])}
          style={{ minHeight: 32, padding: "0 10px" }}
        >
          {allStatuses.map((item) => <option key={item} value={item}>{item === "all" ? "Все статусы" : item}</option>)}
        </select>
      </div>

      <div
        className="site-users-list"
        style={{
          alignSelf: "start",
          background: "transparent",
          border: 0,
          display: "grid",
          gap: 6,
          height: "auto",
          maxHeight: "none",
          minHeight: 0,
          overflow: "visible",
          padding: 0,
        }}
      >
        {status === "loading" ? (
          <EmptyState title="Загружаем пользователей" description="Получаем список учетных записей и их текущий доступ." />
        ) : null}

        {status === "error" ? (
          <EmptyState
            title="Пользователи не загрузились"
            description={errorMessage ?? "API пользователей вернул ошибку."}
            action={onRetry ? <button className="button ghost" onClick={onRetry} type="button">Повторить</button> : undefined}
          />
        ) : null}

        {status !== "loading" && status !== "error" && filteredUsers.length === 0 ? (
          <EmptyState
            title="Пользователи не найдены"
            description="Измените фильтры или создайте новую учетную запись."
            action={<button className="button primary" disabled={!canManage} onClick={onOpenCreate} type="button">Создать пользователя</button>}
          />
        ) : null}

        {status !== "loading" && status !== "error" && filteredUsers.map((user) => (
          <article
            className={`site-user-row ${selectedUserId === user.id ? "is-selected" : ""}`}
            key={user.id}
            onClick={() => onSelectUser(user.id)}
            style={{
              alignItems: "center",
              display: "flex",
              gap: 8,
              height: 58,
              justifyContent: "space-between",
              maxHeight: 58,
              minHeight: 58,
              minWidth: 0,
              padding: 8,
            }}
          >
            <div className="site-user-row-main">
              <span className="site-user-avatar">{getInitials(user.fullName || user.login)}</span>
              <span className="site-user-row-copy">
                <strong>{user.fullName || user.login}</strong>
                <small className="site-user-row-login">{user.login}</small>
                <small className="site-user-row-meta-line">{user.role} · {user.status} · {user.access.length} прав</small>
              </span>
            </div>
            <div
              className="site-user-row-actions"
              onClick={(event) => event.stopPropagation()}
              style={{ alignSelf: "center", display: "grid", flex: "0 0 66px", gap: 4, gridTemplateColumns: "1fr", height: 26 }}
            >
              <button className="button ghost small" onClick={() => onOpenProfile?.(user)} style={{ flex: "0 0 auto", height: 26, minHeight: 26, padding: "0 4px", width: "100%" }} type="button">Профиль</button>
            </div>
          </article>
        ))}
      </div>

      <footer className="site-users-table-footer" style={{ paddingTop: 0 }}>
        <span>Показано {filteredUsers.length} из {users.length}</span>
      </footer>
    </Panel>
  );
}

function getInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "П";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}
