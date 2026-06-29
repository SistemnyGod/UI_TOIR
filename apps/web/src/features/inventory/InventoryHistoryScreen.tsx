import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, History, Search, X } from "lucide-react";
import type {
  InventoryCustodyRecordDto,
  InventoryDocumentDto,
  InventoryHistoryDto,
  InventoryItemDto,
  InventoryListResponseDto,
} from "../../api/contracts";
import { useInventoryRepository } from "../../repositories/inventoryRepositoryContext";
import {
  buildInventoryMovementJournal,
  buildInventoryMovementReport,
  filterInventoryMovements,
  formatMovementQuantity,
  movementActionLabel,
  movementSourceLabel,
  movementStatusLabel,
  type InventoryMovementAction,
  type InventoryMovementPeriod,
  type InventoryMovementRow,
  type InventoryMovementSource,
  type InventoryMovementStatus,
} from "./history/inventoryMovementJournal";
import "./inventoryWeb.css";

type InventoryHistoryScreenProps = {
  error?: string;
  history?: InventoryListResponseDto<InventoryHistoryDto>;
  loading?: boolean;
};

type MovementState = {
  custodyRecords: InventoryCustodyRecordDto[];
  documents: InventoryDocumentDto[];
  history: InventoryHistoryDto[];
  items: InventoryItemDto[];
};

const emptyMovementState: MovementState = {
  custodyRecords: [],
  documents: [],
  history: [],
  items: [],
};

const pageSize = 25;

export function InventoryHistoryScreen({ error, history, loading = false }: InventoryHistoryScreenProps) {
  const inventoryRepository = useInventoryRepository();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [period, setPeriod] = useState<InventoryMovementPeriod>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [action, setAction] = useState<"all" | InventoryMovementAction>("all");
  const [source, setSource] = useState<"all" | InventoryMovementSource>("all");
  const [employee, setEmployee] = useState("");
  const [item, setItem] = useState("");
  const [group, setGroup] = useState("all");
  const [status, setStatus] = useState<"all" | InventoryMovementStatus>("all");
  const [page, setPage] = useState(1);
  const [rowsState, setRowsState] = useState<MovementState>({ ...emptyMovementState, history: history?.rows ?? [] });
  const [serverError, setServerError] = useState(error ?? "");
  const [isLoading, setIsLoading] = useState(loading);
  const [selected, setSelected] = useState<InventoryMovementRow | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [action, dateFrom, dateTo, debouncedQuery, employee, group, item, period, source, status]);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setServerError("");

    Promise.all([
      inventoryRepository.getDocuments({ pageSize: 500 }),
      inventoryRepository.getCustodyRecords({ pageSize: 500 }),
      inventoryRepository.getHistory({ pageSize: 1000 }),
      inventoryRepository.getItems({ pageSize: 500 }),
    ])
      .then(([documents, custodyRecords, historyRows, items]) => {
        if (!mounted) return;
        setRowsState({
          custodyRecords: custodyRecords.rows,
          documents: documents.rows,
          history: historyRows.rows,
          items: items.rows,
        });
      })
      .catch((loadError) => {
        if (mounted) setServerError(loadError instanceof Error ? loadError.message : "Не удалось загрузить журнал движений");
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [inventoryRepository]);

  const movements = useMemo(() => buildInventoryMovementJournal(rowsState), [rowsState]);
  const filteredMovements = useMemo(
    () => filterInventoryMovements(movements, { action, dateFrom, dateTo, employee, group, item, period, query: debouncedQuery, source, status }),
    [action, dateFrom, dateTo, debouncedQuery, employee, group, item, movements, period, source, status],
  );
  const report = useMemo(() => buildInventoryMovementReport(filteredMovements), [filteredMovements]);
  const pageCount = Math.max(1, Math.ceil(filteredMovements.length / pageSize));
  const pageRows = filteredMovements.slice((page - 1) * pageSize, page * pageSize);
  const employees = useMemo(() => unique(movements.map((row) => row.employeeName).filter(Boolean)), [movements]);
  const items = useMemo(() => unique(movements.map((row) => row.itemName).filter(Boolean)), [movements]);
  const groups = useMemo(() => unique(["Рации", "Инструменты", "Ключи", "Прочее", ...movements.map((row) => row.group).filter(Boolean)]), [movements]);
  const hasFilters = Boolean(debouncedQuery || period !== "all" || dateFrom || dateTo || action !== "all" || source !== "all" || employee || item || group !== "all" || status !== "all");

  return (
    <section className="inventory-history-screen">
      <header className="inventory-history-commandbar">
        <div className="inventory-history-title">
          <span className="inventory-history-title-icon"><History size={22} /></span>
          <div>
            <p>Бухгалтерия</p>
            <h1>История</h1>
            <span>Единый журнал движений выдачи и предметов под запись.</span>
          </div>
        </div>
      </header>

      {serverError ? <HistoryState kind="error" title="Журнал не загрузился" text={serverError} /> : null}
      {isLoading ? <HistoryState kind="loading" title="Загрузка истории" text="Получаем выдачи, под запись и события движения." /> : null}

      {!isLoading && !serverError ? (
        <>
          <section className="inventory-history-kpis" aria-label="Сводка истории">
            <HistoryKpi label="Всего выдано" tone="blue" value={report.totals.issued} />
            <HistoryKpi label="На руках" tone="green" value={report.totals.inUse} />
            <HistoryKpi label="Возвращено" value={report.totals.returned} />
            <HistoryKpi label="Списано / неисправно" tone="red" value={report.totals.writtenOff + report.totals.lost} />
          </section>

          <section className="inventory-history-filters">
            <label className="inventory-history-search">
              <Search size={17} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Сотрудник, предмет, комментарий" type="search" />
            </label>
            <div className="inventory-history-period" aria-label="Период">
              <select aria-label="Быстрый период" value={period} onChange={(event) => setPeriod(event.target.value as InventoryMovementPeriod)}>
                <option value="all">Вся история</option>
                <option value="today">Сегодня</option>
                <option value="7d">7 дней</option>
                <option value="30d">30 дней</option>
                <option value="custom">С / по</option>
              </select>
              <input aria-label="Дата с" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPeriod("custom"); }} type="date" />
              <i />
              <input aria-label="Дата по" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPeriod("custom"); }} type="date" />
            </div>
            <select aria-label="Действие" value={action} onChange={(event) => setAction(event.target.value as "all" | InventoryMovementAction)}>
              <option value="all">Все действия</option>
              <option value="issued">Выдано</option>
              <option value="returned">Возвращено</option>
              <option value="written_off">Списано</option>
              <option value="lost">Неисправно</option>
              <option value="archived">Архив</option>
            </select>
            <select aria-label="Источник" value={source} onChange={(event) => setSource(event.target.value as "all" | InventoryMovementSource)}>
              <option value="all">Все источники</option>
              <option value="issue">Выдача</option>
              <option value="custody">Под запись</option>
            </select>
            <select aria-label="Сотрудник" value={employee} onChange={(event) => setEmployee(event.target.value)}>
              <option value="">Все сотрудники</option>
              {employees.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <select aria-label="Предмет" value={item} onChange={(event) => setItem(event.target.value)}>
              <option value="">Все предметы</option>
              {items.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <select aria-label="Группа" value={group} onChange={(event) => setGroup(event.target.value)}>
              <option value="all">Все группы</option>
              {groups.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <select aria-label="Статус" value={status} onChange={(event) => setStatus(event.target.value as "all" | InventoryMovementStatus)}>
              <option value="all">Все статусы</option>
              <option value="in_use">На руках</option>
              <option value="returned">Возвращено</option>
              <option value="written_off">Списано</option>
              <option value="lost">Неисправно</option>
              <option value="archived">Архив</option>
            </select>
          </section>

          <section className="inventory-history-journal">
            <div className="inventory-history-panel-head">
              <div>
                <h2>Журнал движений</h2>
                <p>{filteredMovements.length} из {movements.length} движений</p>
              </div>
              <HistoryPager page={page} pageCount={pageCount} onPage={setPage} />
            </div>
            <MovementTable rows={pageRows} emptyByFilter={hasFilters && movements.length > 0} onSelect={setSelected} />
          </section>
        </>
      ) : null}

      {selected ? <MovementDrawer row={selected} onClose={() => setSelected(null)} /> : null}
    </section>
  );
}

function MovementTable({
  emptyByFilter,
  onSelect,
  rows,
}: {
  emptyByFilter: boolean;
  onSelect: (row: InventoryMovementRow) => void;
  rows: InventoryMovementRow[];
}) {
  if (!rows.length) {
    return (
      <HistoryState
        kind="empty"
        title={emptyByFilter ? "По фильтрам движений нет" : "Журнал движений пуст"}
        text={emptyByFilter ? "Измените период, источник, действие или поиск." : "Движения появятся после выдачи, возврата, списания или операции под запись."}
      />
    );
  }

  return (
    <div className="inventory-history-table-wrap">
      <table className="inventory-history-table">
        <thead>
          <tr>
            <th>Дата</th>
            <th>Сотрудник</th>
            <th>Предмет</th>
            <th>Группа</th>
            <th>Источник</th>
            <th>Действие</th>
            <th>Кол-во</th>
            <th>Статус</th>
            <th>Кто сделал</th>
            <th>Комментарий</th>
            <th>Детали</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{formatDate(row.createdAt)}</td>
              <td><strong>{row.employeeName}</strong></td>
              <td><strong>{row.itemName}</strong></td>
              <td>{row.group}</td>
              <td>{movementSourceLabel(row.source)}</td>
              <td><span className="inventory-history-action">{movementActionLabel(row.action)}</span></td>
              <td>{formatMovementQuantity(row.quantity)} {row.unit}</td>
              <td><span className={`inventory-history-status is-${row.status}`}>{movementStatusLabel(row.status)}</span></td>
              <td>{row.actor || "Система"}</td>
              <td>{row.comment || "Нет комментария"}</td>
              <td><button className="button ghost" onClick={() => onSelect(row)} type="button">Открыть</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MovementDrawer({ onClose, row }: { onClose: () => void; row: InventoryMovementRow }) {
  return (
    <div className="inventory-history-drawer-backdrop" onMouseDown={onClose} role="presentation">
      <aside className="inventory-history-drawer" aria-label="Детали движения" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p>{movementSourceLabel(row.source)}</p>
            <h2>{movementActionLabel(row.action)}</h2>
          </div>
          <button className="inventory-history-icon-button" onClick={onClose} type="button" aria-label="Закрыть"><X size={18} /></button>
        </header>
        <section className="inventory-history-detail-grid">
          <div><span>Дата</span><strong>{formatDate(row.createdAt)}</strong></div>
          <div><span>Статус</span><strong>{movementStatusLabel(row.status)}</strong></div>
          <div><span>Сотрудник</span><strong>{row.employeeName}</strong></div>
          <div><span>Предмет</span><strong>{row.itemName}</strong></div>
          <div><span>Группа</span><strong>{row.group}</strong></div>
          <div><span>Количество</span><strong>{formatMovementQuantity(row.quantity)} {row.unit}</strong></div>
          <div><span>Источник</span><strong>{movementSourceLabel(row.source)}</strong></div>
          <div><span>Кто сделал</span><strong>{row.actor || "Система"}</strong></div>
        </section>
        <section className="inventory-history-description">
          <h3>Комментарий</h3>
          <p>{row.comment || "Нет комментария"}</p>
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
      <button className="button ghost" disabled={page >= pageCount} onClick={() => onPage(page + 1)} type="button">Вперед <ChevronRight size={15} /></button>
    </div>
  );
}

function HistoryKpi({ label, tone = "slate", value }: { label: string; tone?: "blue" | "green" | "red" | "slate"; value: number }) {
  return (
    <article className={`inventory-history-kpi tone-${tone}`}>
      <span>{label}</span>
      <strong>{formatMovementQuantity(value)}</strong>
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
