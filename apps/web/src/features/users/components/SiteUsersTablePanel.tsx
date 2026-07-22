import { useEffect, useMemo, useState } from "react";
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
const pageSizeOptions = [10, 25, 50, 100] as const;
type UserPageSize = (typeof pageSizeOptions)[number];

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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<UserPageSize>(10);

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

  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleUsers = filteredUsers.slice((safePage - 1) * pageSize, safePage * pageSize);
  const firstVisible = filteredUsers.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const lastVisible = Math.min(filteredUsers.length, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [query, role, userStatus, users]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

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
      >
        <input
          aria-label="Поиск"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Логин, ФИО или роль"
        />
        <select
          aria-label="Роль"
          value={role}
          onChange={(event) => setRole(event.target.value as (typeof allRoles)[number])}
        >
          {allRoles.map((item) => <option key={item} value={item}>{item === "all" ? "Все роли" : item}</option>)}
        </select>
        <select
          aria-label="Статус"
          value={userStatus}
          onChange={(event) => setUserStatus(event.target.value as (typeof allStatuses)[number])}
        >
          {allStatuses.map((item) => <option key={item} value={item}>{item === "all" ? "Все статусы" : item}</option>)}
        </select>
      </div>

      <div
        className="site-users-list"
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

        {status !== "loading" && status !== "error" && visibleUsers.map((user) => (
          <article
            className={`site-user-row ${selectedUserId === user.id ? "is-selected" : ""}`}
            key={user.id}
            onClick={() => onSelectUser(user.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectUser(user.id);
              }
            }}
            role="button"
            tabIndex={0}
          >
            <div className="site-user-row-main">
              <span className="site-user-avatar">{getInitials(user.fullName || user.login)}</span>
              <span className="site-user-row-copy">
                <strong>{user.fullName || user.login}</strong>
                <small className="site-user-row-login">{user.login}</small>
                <span className="site-user-row-meta-line">
                  <span className="site-user-role-badge">{user.role}</span>
                  <span className={`site-user-status-badge ${user.status === "Активен" ? "is-active" : "is-blocked"}`}>{user.status}</span>
                  <span className="site-user-access-count">{user.access.length} прав</span>
                </span>
              </span>
            </div>
            <div
              className="site-user-row-actions"
              onClick={(event) => event.stopPropagation()}
            >
              <button className="button ghost small" onClick={() => onOpenProfile?.(user)} type="button">Профиль</button>
            </div>
          </article>
        ))}
      </div>

      <footer className="site-users-table-footer">
        <span>Показано {firstVisible}-{lastVisible} из {filteredUsers.length} · всего пользователей: {users.length}</span>
        <label className="site-users-page-size">
          На странице
          <select aria-label="Количество пользователей на странице" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value) as UserPageSize); setPage(1); }}>
            {pageSizeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <div className="site-users-pagination-actions">
          <button className="button ghost small" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} type="button">Назад</button>
          <strong>Страница {safePage} из {pageCount}</strong>
          <button className="button ghost small" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)} type="button">Далее</button>
        </div>
      </footer>
    </Panel>
  );
}

function getInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "П";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}
