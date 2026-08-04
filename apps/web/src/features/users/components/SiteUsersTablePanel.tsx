import { ChevronLeft, ChevronRight, Plus, Search, SlidersHorizontal } from "lucide-react";
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
const pageSizeOptions = [8, 16, 24] as const;
type UserPageSize = (typeof pageSizeOptions)[number];

export function SiteUsersTablePanel({
  users,
  canManage = true,
  errorMessage,
  selectedUserId,
  status = "idle",
  onOpenCreate,
  onOpenProfile: _onOpenProfile,
  onRetry,
  onSelectUser,
}: SiteUsersTablePanelProps) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<(typeof allRoles)[number]>("all");
  const [userStatus, setUserStatus] = useState<(typeof allStatuses)[number]>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<UserPageSize>(8);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return users.filter((user) => {
      const matchesQuery = !normalizedQuery
        || user.login.toLowerCase().includes(normalizedQuery)
        || user.fullName.toLowerCase().includes(normalizedQuery)
        || user.role.toLowerCase().includes(normalizedQuery);
      return matchesQuery
        && (role === "all" || user.role === role)
        && (userStatus === "all" || user.status === userStatus);
    });
  }, [query, role, userStatus, users]);

  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleUsers = filteredUsers.slice((safePage - 1) * pageSize, safePage * pageSize);
  const firstVisible = filteredUsers.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const lastVisible = Math.min(filteredUsers.length, safePage * pageSize);

  useEffect(() => setPage(1), [query, role, userStatus, users]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  return (
    <Panel
      title="Пользователи"
      note={`${users.length} учетных записей`}
      className="site-users-table-panel site-users-directory-panel"
      actions={(
        <button className="button ghost small site-users-add-button" disabled={!canManage} onClick={onOpenCreate} type="button">
          <Plus size={15} />
          Добавить
        </button>
      )}
    >
      <div className="site-users-directory-controls">
        <label className="site-users-search-field">
          <Search aria-hidden="true" size={16} />
          <input aria-label="Поиск пользователей" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск пользователя..." />
          <button aria-label="Фильтры пользователей" title="Фильтры пользователей" type="button"><SlidersHorizontal size={15} /></button>
        </label>
        <div className="site-users-filter-row">
          <select aria-label="Роль" value={role} onChange={(event) => setRole(event.target.value as (typeof allRoles)[number])}>
            {allRoles.map((item) => <option key={item} value={item}>{item === "all" ? "Все роли" : item}</option>)}
          </select>
          <select aria-label="Статус" value={userStatus} onChange={(event) => setUserStatus(event.target.value as (typeof allStatuses)[number])}>
            {allStatuses.map((item) => <option key={item} value={item}>{item === "all" ? "Все статусы" : item}</option>)}
          </select>
        </div>
      </div>

      <div className="site-users-directory-list">
        {status === "loading" ? <div className="site-users-loading">Загрузка пользователей...</div> : null}
        {status === "error" ? (
          <EmptyState title="Пользователи не загрузились" description={errorMessage} action={onRetry ? <button className="button ghost" onClick={onRetry} type="button">Повторить</button> : undefined} />
        ) : null}
        {status !== "loading" && status !== "error" && filteredUsers.length === 0 ? (
          <EmptyState title="Пользователи не найдены" description="Измените параметры поиска или создайте новую учетную запись." />
        ) : null}
        {status !== "loading" && status !== "error" && visibleUsers.map((user) => (
          <button
            aria-pressed={selectedUserId === user.id}
            className={`site-user-directory-row ${selectedUserId === user.id ? "is-selected" : ""}`}
            key={user.id}
            onClick={() => onSelectUser(user.id)}
            type="button"
          >
            <span className="site-user-avatar">{getInitials(user.fullName || user.login)}</span>
            <span className="site-user-directory-copy">
              <strong title={user.fullName || user.login}>{user.fullName || user.login}</strong>
              <small>{user.login}</small>
              <span>
                <em>{user.role}</em>
                <i className={user.status === "Активен" ? "is-active" : "is-blocked"}>{user.status}</i>
              </span>
            </span>
            <b>{user.access.length}</b>
          </button>
        ))}
      </div>

      <footer className="site-users-directory-footer">
        <span>Показано {firstVisible}-{lastVisible} из {filteredUsers.length}</span>
        <div className="site-users-directory-pagination">
          <button aria-label="Предыдущая страница" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} type="button"><ChevronLeft size={16} /></button>
          <strong>{safePage}</strong>
          <span>из {pageCount}</span>
          <button aria-label="Следующая страница" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)} type="button"><ChevronRight size={16} /></button>
        </div>
        <label>
          <span>На странице</span>
          <select aria-label="Пользователей на странице" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value) as UserPageSize); setPage(1); }}>
            {pageSizeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
      </footer>
    </Panel>
  );
}

function getInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "П";
}