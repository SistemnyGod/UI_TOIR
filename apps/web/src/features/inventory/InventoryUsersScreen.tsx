import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search, ShieldAlert, UserCog } from "lucide-react";
import type { InventoryListResponseDto, InventoryUserDto } from "../../api/contracts";
import { useInventoryRepository } from "../../repositories/inventoryRepositoryContext";
import "./inventoryWeb.css";

type InventoryUsersScreenProps = {
  error?: string;
  loading?: boolean;
  onNotify: (message: string) => void;
  onReload: () => Promise<void>;
  users?: InventoryListResponseDto<InventoryUserDto>;
};

export function InventoryUsersScreen({ error, loading = false, onNotify, users }: InventoryUsersScreenProps) {
  const inventoryRepository = useInventoryRepository();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [role, setRole] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [rowsState, setRowsState] = useState<InventoryListResponseDto<InventoryUserDto> | undefined>(users);
  const [serverError, setServerError] = useState(error ?? "");
  const [isLoading, setIsLoading] = useState(loading);
  const [busyId, setBusyId] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, role, status]);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setServerError("");

    inventoryRepository
      .getUsers({
        page,
        pageSize,
        query: debouncedQuery || undefined,
        role: role === "all" ? undefined : role,
        status: status === "all" ? undefined : status,
      })
      .then((nextRows) => {
        if (mounted) setRowsState(nextRows);
      })
      .catch((loadError) => {
        if (mounted) setServerError(loadError instanceof Error ? loadError.message : "API пользователей не ответил");
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [debouncedQuery, inventoryRepository, page, pageSize, reloadKey, role, status]);

  const rows = rowsState?.rows ?? [];
  const total = rowsState?.total ?? 0;
  const pageCount = rowsState?.pageCount ?? 0;
  const roles = useMemo(() => uniqueValues(rows.flatMap((row) => row.roles)), [rows]);
  const visibleRoles = role === "all" || roles.includes(role) ? roles : [role, ...roles];

  async function disableUser(row: InventoryUserDto) {
    try {
      setBusyId(row.id);
      await inventoryRepository.disableUser(row.id);
      onNotify("Пользователь Inventory отключен");
      setReloadKey((value) => value + 1);
    } catch (disableError) {
      onNotify(disableError instanceof Error ? disableError.message : "Не удалось отключить пользователя");
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="inventory-users-screen">
      <header className="inventory-users-commandbar">
        <div className="inventory-users-title">
          <span className="inventory-users-title-icon"><UserCog size={22} /></span>
          <div>
            <p>Бухгалтерия</p>
            <h1>Пользователи Inventory</h1>
            <span>Права бухгалтерского модуля поверх текущего RBAC Patrol360.</span>
          </div>
        </div>
      </header>

      {serverError ? <UsersState kind="error" title="API пользователей не ответил" text={serverError} /> : null}
      {isLoading ? <UsersState kind="loading" title="Загрузка пользователей" text="Получаем пользователей и роли Inventory." /> : null}

      {!isLoading && !serverError ? (
        <>
          <section className="inventory-users-kpis" aria-label="Сводка пользователей">
            <UsersKpi label="Всего в фильтре" value={total} />
            <UsersKpi label="На странице" tone="blue" value={rows.length} />
            <UsersKpi label="Активные" tone="green" value={rows.filter((row) => row.status !== "disabled").length} />
            <UsersKpi label="Отключены" tone="red" value={rows.filter((row) => row.status === "disabled").length} />
          </section>

          <section className="inventory-users-filters">
            <label className="inventory-users-search">
              <Search size={17} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по логину, имени или роли" type="search" />
            </label>
            <select value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="all">Все роли</option>
              {visibleRoles.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">Все статусы</option>
              <option value="active">Активные</option>
              <option value="disabled">Отключенные</option>
            </select>
            <select aria-label="Размер страницы" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
              {[25, 50, 100].map((value) => <option key={value} value={value}>{value} строк</option>)}
            </select>
          </section>

          <section className="inventory-users-table-card">
            <div className="inventory-users-panel-head">
              <div>
                <h2>Доступ к бухгалтерии</h2>
                <p>{rows.length} из {total} записей</p>
              </div>
              <UsersPager page={page} pageCount={pageCount} onPage={setPage} />
            </div>
            <UsersTable busyId={busyId} onDisable={disableUser} rows={rows} />
          </section>
        </>
      ) : null}
    </section>
  );
}

function UsersTable({ busyId, onDisable, rows }: { busyId: string; onDisable: (row: InventoryUserDto) => Promise<void>; rows: InventoryUserDto[] }) {
  if (!rows.length) {
    return <UsersState kind="empty" title="Пользователи не найдены" text="Измените фильтр или настройте RBAC для пользователей Inventory." />;
  }

  return (
    <div className="inventory-users-table-wrap">
      <table className="inventory-users-table">
        <thead>
          <tr>
            <th>Логин</th>
            <th>Имя</th>
            <th>Статус</th>
            <th>Роли</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td><strong>{row.login}</strong></td>
              <td>{row.displayName || "не указано"}</td>
              <td><span className={`inventory-users-status ${row.status}`}>{userStatusLabel(row.status)}</span></td>
              <td>{row.roles.join(", ") || "ролей нет"}</td>
              <td>
                <button className="button ghost danger" disabled={row.status === "disabled" || busyId === row.id} onClick={() => void onDisable(row)} type="button">
                  <ShieldAlert size={14} />
                  {busyId === row.id ? "Отключаем..." : "Отключить"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UsersPager({ onPage, page, pageCount }: { onPage: (page: number) => void; page: number; pageCount: number }) {
  return (
    <div className="inventory-users-pager">
      <button className="button ghost" disabled={page <= 1} onClick={() => onPage(page - 1)} type="button"><ChevronLeft size={15} /> Назад</button>
      <span>{page} / {Math.max(pageCount, 1)}</span>
      <button className="button ghost" disabled={pageCount === 0 || page >= pageCount} onClick={() => onPage(page + 1)} type="button">Вперед <ChevronRight size={15} /></button>
    </div>
  );
}

function UsersKpi({ label, tone = "slate", value }: { label: string; tone?: "blue" | "green" | "red" | "slate"; value: number }) {
  return (
    <article className={`inventory-users-kpi tone-${tone}`}>
      <span>{label}</span>
      <strong>{formatQuantity(value)}</strong>
    </article>
  );
}

function UsersState({ kind, text, title }: { kind: "empty" | "error" | "loading"; text: string; title: string }) {
  return (
    <div className={`inventory-users-state is-${kind}`}>
      <span>{kind === "loading" ? "..." : kind === "error" ? "!" : "0"}</span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function userStatusLabel(status: string) {
  const labels: Record<string, string> = {
    active: "Активен",
    archived: "Архив",
    disabled: "Отключен",
  };
  return labels[status] ?? status;
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ru"));
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(value);
}
