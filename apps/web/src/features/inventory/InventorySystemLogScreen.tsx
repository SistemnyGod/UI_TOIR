import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ScrollText, Search, X } from "lucide-react";
import type { InventoryListResponseDto, InventorySystemLogDto } from "../../api/contracts";
import { useInventoryRepository } from "../../repositories/inventoryRepositoryContext";
import "./inventoryWeb.css";

type InventorySystemLogScreenProps = {
  error?: string;
  loading?: boolean;
  rows?: InventoryListResponseDto<InventorySystemLogDto>;
};

export function InventorySystemLogScreen({ error, loading = false, rows }: InventorySystemLogScreenProps) {
  const inventoryRepository = useInventoryRepository();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [entityType, setEntityType] = useState("all");
  const [action, setAction] = useState("all");
  const [actor, setActor] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [logState, setLogState] = useState<InventoryListResponseDto<InventorySystemLogDto> | undefined>(rows);
  const [serverError, setServerError] = useState(error ?? "");
  const [isLoading, setIsLoading] = useState(loading);
  const [selected, setSelected] = useState<InventorySystemLogDto | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [action, actor, dateFrom, dateTo, debouncedQuery, entityType]);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setServerError("");

    inventoryRepository
      .getSystemLog({
        action: action === "all" ? undefined : action,
        actor: actor.trim() || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        entityType: entityType === "all" ? undefined : entityType,
        page,
        pageSize,
        query: debouncedQuery || undefined,
      })
      .then((nextRows) => {
        if (mounted) setLogState(nextRows);
      })
      .catch((loadError) => {
        if (mounted) setServerError(loadError instanceof Error ? loadError.message : "API журнала не ответил");
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [action, actor, dateFrom, dateTo, debouncedQuery, entityType, inventoryRepository, page, pageSize]);

  const logRows = logState?.rows ?? [];
  const total = logState?.total ?? 0;
  const pageCount = logState?.pageCount ?? 0;
  const entities = useMemo(() => unique(logRows.map((row) => row.entityType).filter(Boolean)), [logRows]);
  const actions = useMemo(() => unique(logRows.map((row) => row.action).filter(Boolean)), [logRows]);
  const actors = useMemo(() => unique(logRows.map((row) => row.actor).filter(Boolean)), [logRows]);
  const visibleActors = actor.trim() ? unique([...actors, actor.trim()]) : actors;

  return (
    <section className="inventory-system-log-screen">
      <header className="inventory-system-log-commandbar">
        <div className="inventory-system-log-title">
          <span className="inventory-system-log-title-icon"><ScrollText size={22} /></span>
          <div>
            <p>Бухгалтерия</p>
            <h1>Системный журнал</h1>
            <span>Аудит изменений Inventory: импорт, операции, печать и настройки.</span>
          </div>
        </div>
      </header>

      {serverError ? <SystemLogState kind="error" title="API журнала не ответил" text={serverError} /> : null}
      {isLoading ? <SystemLogState kind="loading" title="Загрузка журнала" text="Получаем последние записи аудита." /> : null}

      {!isLoading && !serverError ? (
        <>
          <section className="inventory-system-log-kpis" aria-label="Сводка аудита">
            <SystemLogKpi label="Всего записей" value={total} />
            <SystemLogKpi label="На странице" tone="blue" value={logRows.length} />
            <SystemLogKpi label="Сущностей" tone="green" value={entities.length} />
          </section>

          <section className="inventory-system-log-filters">
            <label className="inventory-system-log-search">
              <Search size={17} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по деталям, сущности, действию или пользователю" type="search" />
            </label>
            <select value={entityType} onChange={(event) => setEntityType(event.target.value)}>
              <option value="all">Все сущности</option>
              {entities.map((entity) => <option key={entity} value={entity}>{entityLabel(entity)}</option>)}
            </select>
            <select value={action} onChange={(event) => setAction(event.target.value)}>
              <option value="all">Все действия</option>
              {actions.map((value) => <option key={value} value={value}>{actionLabel(value)}</option>)}
            </select>
            <select value={actor} onChange={(event) => setActor(event.target.value)}>
              <option value="">Все пользователи</option>
              {visibleActors.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <input aria-label="Дата с" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} type="date" />
            <input aria-label="Дата по" value={dateTo} onChange={(event) => setDateTo(event.target.value)} type="date" />
            <select aria-label="Размер страницы" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
              {[25, 50, 100].map((value) => <option key={value} value={value}>{value} строк</option>)}
            </select>
          </section>

          <section className="inventory-system-log-card">
            <div className="inventory-system-log-panel-head">
              <div>
                <h2>Записи аудита</h2>
                <p>{logRows.length} из {total} записей</p>
              </div>
              <SystemLogPager page={page} pageCount={pageCount} onPage={setPage} />
            </div>
            <SystemLogTable onSelect={setSelected} rows={logRows} />
          </section>
        </>
      ) : null}

      {selected ? <SystemLogDrawer onClose={() => setSelected(null)} row={selected} /> : null}
    </section>
  );
}

function SystemLogTable({ onSelect, rows }: { onSelect: (row: InventorySystemLogDto) => void; rows: InventorySystemLogDto[] }) {
  if (!rows.length) {
    return <SystemLogState kind="empty" title="Системный журнал пуст" text="Аудит появится после операций, импорта, печати и административных изменений." />;
  }

  return (
    <div className="inventory-system-log-table-wrap">
      <table className="inventory-system-log-table">
        <thead>
          <tr>
            <th>Дата</th>
            <th>Сущность</th>
            <th>Действие</th>
            <th>Детали</th>
            <th>Пользователь</th>
            <th>Просмотр</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{formatDate(row.createdAt)}</td>
              <td>{entityLabel(row.entityType)}</td>
              <td><span className="inventory-system-log-action">{actionLabel(row.action)}</span></td>
              <td>{row.details || "нет деталей"}</td>
              <td>{row.actor || "не указан"}</td>
              <td><button className="button ghost" onClick={() => onSelect(row)} type="button">Открыть</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SystemLogDrawer({ onClose, row }: { onClose: () => void; row: InventorySystemLogDto }) {
  return (
    <div className="inventory-system-log-drawer-backdrop" onMouseDown={onClose} role="presentation">
      <aside className="inventory-system-log-drawer" aria-label="Детали аудита" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p>{entityLabel(row.entityType)}</p>
            <h2>{actionLabel(row.action)}</h2>
          </div>
          <button className="inventory-system-log-icon-button" onClick={onClose} type="button" aria-label="Закрыть"><X size={18} /></button>
        </header>
        <section className="inventory-system-log-detail-grid">
          <div><span>Дата</span><strong>{formatDate(row.createdAt)}</strong></div>
          <div><span>Пользователь</span><strong>{row.actor || "не указан"}</strong></div>
          <div><span>ID сущности</span><strong>{row.entityId || "нет"}</strong></div>
          <div><span>Сущность</span><strong>{entityLabel(row.entityType)}</strong></div>
        </section>
        <section className="inventory-system-log-description">
          <h3>Детали</h3>
          <p>{row.details || "Нет деталей"}</p>
        </section>
      </aside>
    </div>
  );
}

function SystemLogPager({ onPage, page, pageCount }: { onPage: (page: number) => void; page: number; pageCount: number }) {
  return (
    <div className="inventory-system-log-pager">
      <button className="button ghost" disabled={page <= 1} onClick={() => onPage(page - 1)} type="button"><ChevronLeft size={15} /> Назад</button>
      <span>{page} / {Math.max(pageCount, 1)}</span>
      <button className="button ghost" disabled={pageCount === 0 || page >= pageCount} onClick={() => onPage(page + 1)} type="button">Вперед <ChevronRight size={15} /></button>
    </div>
  );
}

function SystemLogKpi({ label, tone = "slate", value }: { label: string; tone?: "blue" | "green" | "red" | "slate"; value: number }) {
  return (
    <article className={`inventory-system-log-kpi tone-${tone}`}>
      <span>{label}</span>
      <strong>{formatQuantity(value)}</strong>
    </article>
  );
}

function SystemLogState({ kind, text, title }: { kind: "empty" | "error" | "loading"; text: string; title: string }) {
  return (
    <div className={`inventory-system-log-state is-${kind}`}>
      <span>{kind === "loading" ? "..." : kind === "error" ? "!" : "0"}</span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function unique(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, "ru"));
}

function formatDate(value?: string | null) {
  if (!value) return "Нет данных";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(value);
}

function actionLabel(action?: string | null) {
  const labels: Record<string, string> = {
    archive: "Архив",
    archived: "Архивировано",
    close: "Закрытие",
    confirm_issue: "Подтверждение выдачи",
    create: "Создание",
    created: "Создано",
    disabled: "Отключено",
    docx_exported: "Выгрузка DOCX",
    export: "Экспорт",
    issue: "Выдача",
    import: "Импорт",
    line_update: "Изменение строки",
    open: "Открытие",
    pdf_exported: "Выгрузка PDF",
    print: "Печать",
    printed: "Печать",
    return: "Возврат",
    returned: "Возвращено",
    status_changed: "Изменение статуса",
    update: "Изменение",
    updated: "Изменено",
    write_off: "Списание",
    written_off: "Списано",
  };
  return action ? labels[action] ?? action : "Нет действия";
}

function entityLabel(entityType?: string | null) {
  const labels: Record<string, string> = {
    assignment_event: "Событие назначения",
    custody: "Акт под запись",
    custody_document: "Акт под запись",
    custody_record: "Строка акта",
    document: "Документ учета",
    employee: "Сотрудник",
    export_job: "Экспорт",
    inventory_item: "Номенклатура",
    ppe_card: "Карточка СИЗ",
    ppe_card_line: "Строка СИЗ",
    site_user: "Пользователь",
    stock_move: "Движение предмета",
    system_log: "Системный журнал",
  };
  return entityType ? labels[entityType] ?? entityType : "Нет сущности";
}
