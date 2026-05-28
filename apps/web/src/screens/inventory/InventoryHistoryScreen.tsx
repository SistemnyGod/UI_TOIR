import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, History, Search, X } from "lucide-react";
import type { InventoryHistoryDto, InventoryListResponseDto } from "../../api/contracts";
import { useInventoryRepository } from "../../repositories/inventoryRepositoryContext";
import "./inventoryWeb.css";

type InventoryHistoryScreenProps = {
  error?: string;
  history?: InventoryListResponseDto<InventoryHistoryDto>;
  loading?: boolean;
};

export function InventoryHistoryScreen({ error, history, loading = false }: InventoryHistoryScreenProps) {
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
  const [rowsState, setRowsState] = useState<InventoryListResponseDto<InventoryHistoryDto> | undefined>(history);
  const [serverError, setServerError] = useState(error ?? "");
  const [isLoading, setIsLoading] = useState(loading);
  const [selected, setSelected] = useState<InventoryHistoryDto | null>(null);

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
      .getHistory({
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
        if (mounted) setRowsState(nextRows);
      })
      .catch((loadError) => {
        if (mounted) setServerError(loadError instanceof Error ? loadError.message : "API истории не ответил");
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [action, actor, dateFrom, dateTo, debouncedQuery, entityType, inventoryRepository, page, pageSize]);

  const rows = rowsState?.rows ?? [];
  const total = rowsState?.total ?? 0;
  const pageCount = rowsState?.pageCount ?? 0;
  const entities = useMemo(() => unique(rows.map((row) => row.entityType).filter(Boolean)), [rows]);
  const actions = useMemo(() => unique(rows.map((row) => row.action).filter(Boolean)), [rows]);
  const actors = useMemo(() => unique(rows.map((row) => row.actor).filter(Boolean)), [rows]);
  const visibleActors = actor.trim() ? unique([...actors, actor.trim()]) : actors;

  return (
    <section className="inventory-history-screen">
      <header className="inventory-history-commandbar">
        <div className="inventory-history-title">
          <span className="inventory-history-title-icon"><History size={22} /></span>
          <div>
            <p>Бухгалтерия</p>
            <h1>История</h1>
            <span>Единый журнал выдач, возвратов, списаний, СИЗ и записей под ответственность.</span>
          </div>
        </div>
      </header>

      {serverError ? <HistoryState kind="error" title="API истории не ответил" text={serverError} /> : null}
      {isLoading ? <HistoryState kind="loading" title="Загрузка истории" text="Получаем операции, аудит строк и системные события." /> : null}

      {!isLoading && !serverError ? (
        <>
          <section className="inventory-history-kpis" aria-label="Сводка истории">
            <HistoryKpi label="Всего записей" value={total} />
            <HistoryKpi label="На странице" tone="blue" value={rows.length} />
            <HistoryKpi label="Сущностей" tone="green" value={entities.length} />
            <HistoryKpi label="Пользователей" value={actors.length} />
          </section>

          <section className="inventory-history-filters">
            <label className="inventory-history-search">
              <Search size={17} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по описанию, пользователю или действию" type="search" />
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

          <section className="inventory-history-journal">
            <div className="inventory-history-panel-head">
              <div>
                <h2>Журнал событий</h2>
                <p>{rows.length} из {total} записей</p>
              </div>
              <HistoryPager page={page} pageCount={pageCount} onPage={setPage} />
            </div>
            <HistoryTable rows={rows} onSelect={setSelected} />
          </section>
        </>
      ) : null}

      {selected ? <HistoryDrawer row={selected} onClose={() => setSelected(null)} /> : null}
    </section>
  );
}

function HistoryTable({ onSelect, rows }: { onSelect: (row: InventoryHistoryDto) => void; rows: InventoryHistoryDto[] }) {
  if (!rows.length) {
    return <HistoryState kind="empty" title="История пуста" text="События появятся после операций, печати, импорта и административных изменений." />;
  }

  return (
    <div className="inventory-history-table-wrap">
      <table className="inventory-history-table">
        <thead>
          <tr>
            <th>Дата</th>
            <th>Сущность</th>
            <th>Действие</th>
            <th>Описание</th>
            <th>Пользователь</th>
            <th>Детали</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{formatDate(row.createdAt)}</td>
              <td>{entityLabel(row.entityType)}</td>
              <td><span className="inventory-history-action">{actionLabel(row.action)}</span></td>
              <td>{formatDescription(row.description)}</td>
              <td>{row.actor || "не указан"}</td>
              <td><button className="button ghost" onClick={() => onSelect(row)} type="button">Открыть</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistoryDrawer({ onClose, row }: { onClose: () => void; row: InventoryHistoryDto }) {
  return (
    <div className="inventory-history-drawer-backdrop" role="presentation">
      <aside className="inventory-history-drawer" aria-label="Детали события">
        <header>
          <div>
            <p>{entityLabel(row.entityType)}</p>
            <h2>{actionLabel(row.action)}</h2>
          </div>
          <button className="inventory-history-icon-button" onClick={onClose} type="button" aria-label="Закрыть"><X size={18} /></button>
        </header>
        <section className="inventory-history-detail-grid">
          <div><span>Дата</span><strong>{formatDate(row.createdAt)}</strong></div>
          <div><span>Пользователь</span><strong>{row.actor || "не указан"}</strong></div>
          <div><span>Сущность</span><strong>{entityLabel(row.entityType)}</strong></div>
          <div><span>Действие</span><strong>{actionLabel(row.action)}</strong></div>
        </section>
        <section className="inventory-history-description">
          <h3>Описание</h3>
          <p>{formatDescription(row.description)}</p>
        </section>
      </aside>
    </div>
  );
}

function HistoryPager({ onPage, page, pageCount }: { onPage: (page: number) => void; page: number; pageCount: number }) {
  return (
    <div className="inventory-history-pager">
      <button className="button ghost" disabled={page <= 1} onClick={() => onPage(page - 1)} type="button"><ChevronLeft size={15} /> Назад</button>
      <span>{page} / {Math.max(pageCount, 1)}</span>
      <button className="button ghost" disabled={pageCount === 0 || page >= pageCount} onClick={() => onPage(page + 1)} type="button">Вперед <ChevronRight size={15} /></button>
    </div>
  );
}

function HistoryKpi({ label, tone = "slate", value }: { label: string; tone?: "blue" | "green" | "red" | "slate"; value: number }) {
  return (
    <article className={`inventory-history-kpi tone-${tone}`}>
      <span>{label}</span>
      <strong>{formatQuantity(value)}</strong>
    </article>
  );
}

function HistoryState({ kind, text, title }: { kind: "empty" | "error" | "loading"; text: string; title: string }) {
  return (
    <div className={`inventory-history-state is-${kind}`}>
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

function formatDescription(description?: string | null) {
  if (!description || description.trim() === "->") return "Нет описания";
  return description;
}

function actionLabel(action?: string | null) {
  const labels: Record<string, string> = {
    archive: "Архив",
    archived: "Архивировано",
    cancel: "Отмена",
    close: "Закрытие",
    closed: "Закрыто",
    confirm_issue: "Подтверждение выдачи",
    create: "Создание",
    created: "Создано",
    docx_exported: "Выгрузка DOCX",
    issue: "Выдача",
    issued: "Выдано",
    line_update: "Изменение строки",
    lost: "Утеря",
    open: "Открытие",
    opened: "Открыто",
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
    stock_move: "Складское движение",
    system_log: "Системный журнал",
  };
  return entityType ? labels[entityType] ?? entityType : "Нет сущности";
}
