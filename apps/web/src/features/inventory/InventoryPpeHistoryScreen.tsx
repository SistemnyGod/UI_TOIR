import { useDeferredValue, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, FileClock, RotateCcw, Search, X } from "lucide-react";
import type { InventoryPpeHistoryRowDto } from "../../api/contracts";
import type { ScreenId } from "../../types";
import { useInventoryRepository } from "../../repositories/inventoryRepositoryContext";
import { formatDate } from "./ppe/ppeCommon";
import { PpeModuleNav } from "./ppe/PpeModuleNav";
import { PpeButton } from "./ppe/PpeUi";

export function InventoryPpeHistoryScreen({ onNavigate }: { onNavigate: (screen: ScreenId) => void }) {
  const repository = useInventoryRepository();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [action, setAction] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<InventoryPpeHistoryRowDto[]>([]);
  const [selected, setSelected] = useState<InventoryPpeHistoryRowDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    repository.getPpeHistory({ action, dateFrom, dateTo, page, pageSize: 30, query: deferredQuery, status })
      .then((result) => {
        if (cancelled) return;
        setRows(result.rows);
        setPageCount(Math.max(result.pageCount, 1));
        setTotal(result.total);
      })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Не удалось загрузить историю СИЗ"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [action, dateFrom, dateTo, deferredQuery, page, repository, status]);

  useEffect(() => setPage(1), [action, dateFrom, dateTo, deferredQuery, status]);

  const hasFilters = Boolean(query || action || status || dateFrom || dateTo);
  function clearFilters() {
    setQuery("");
    setAction("");
    setStatus("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  return (
    <section className="ppe-v2-screen">
      <header className="ppe-v2-page-head"><div><span className="ppe-v2-eyebrow">Бухгалтерия / СИЗ</span><h1>История СИЗ</h1><p>Единый серверный журнал выдачи, возврата, списания и неисправностей.</p></div><PpeModuleNav active="inventory-ppe-history" onNavigate={onNavigate} /></header>
      <section className="ppe-v2-history-panel">
        <div className="ppe-v2-filter-bar">
          <label className="ppe-v2-search"><Search size={17} /><input aria-label="Поиск в истории" onChange={(event) => setQuery(event.target.value)} placeholder="Сотрудник, СИЗ, норма" value={query} /></label>
          <label><span>Период с</span><input onChange={(event) => setDateFrom(event.target.value)} type="date" value={dateFrom} /></label>
          <label><span>по</span><input onChange={(event) => setDateTo(event.target.value)} type="date" value={dateTo} /></label>
          <label><span>Действие</span><select onChange={(event) => setAction(event.target.value)} value={action}><option value="">Все действия</option><option value="issued">Выдано</option><option value="returned">Возвращено</option><option value="written_off">Списано</option><option value="defective">Неисправно</option></select></label>
          <label><span>Статус</span><select onChange={(event) => setStatus(event.target.value)} value={status}><option value="">Все статусы</option><option value="issued">Выдано</option><option value="returned">Возвращено</option><option value="written_off">Списано</option><option value="defective">Неисправно</option></select></label>
          <PpeButton className="ppe-v2-reset-filters" disabled={!hasFilters} icon={<RotateCcw size={15} />} onClick={clearFilters} variant="secondary">Сбросить</PpeButton>
        </div>
        <div className="ppe-v2-history-summary"><div><strong>{total}</strong><span>событий в выборке</span></div><small>{hasFilters ? "Применены фильтры" : "Все операции"} · новые сверху</small></div>
        {error ? <div className="ppe-v2-state ppe-v2-state-large"><strong>Ошибка загрузки</strong><span>{error}</span></div> : loading ? <div className="ppe-v2-state ppe-v2-state-large">Загрузка истории…</div> : rows.length === 0 ? <div className="ppe-v2-state ppe-v2-state-large"><FileClock size={34} /><strong>Событий нет</strong><span>Измените период или фильтры.</span></div> : (
          <div className="ppe-v2-table-wrap"><table className="ppe-v2-table ppe-v2-responsive-table"><thead><tr><th>Дата и время</th><th>Сотрудник</th><th>СИЗ / норма</th><th>Действие</th><th>Количество</th><th>Статус</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td data-label="Дата">{formatDateTime(row.createdAt)}</td><td data-label="Сотрудник"><strong>{row.employeeName}</strong></td><td data-label="СИЗ / норма"><strong>{row.normItemName || row.itemName}</strong><small>{row.itemName}</small></td><td data-label="Действие">{row.actionLabel}</td><td data-label="Количество">{row.quantity} {row.unit}</td><td data-label="Статус"><span className={`ppe-v2-status is-${row.toStatus}`}>{statusLabel(row.toStatus)}</span></td><td className="ppe-v2-actions-cell"><PpeButton aria-label="Открыть детали" icon={<ChevronRight size={18} />} onClick={() => setSelected(row)} size="compact" variant="icon" /></td></tr>)}</tbody></table></div>
        )}
        <div className="ppe-v2-pagination"><button aria-label="Предыдущая страница" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} type="button"><ChevronLeft size={17} /></button><span>{page} / {pageCount}</span><button aria-label="Следующая страница" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)} type="button"><ChevronRight size={17} /></button></div>
      </section>
      {selected ? <HistoryEventDrawer onClose={() => setSelected(null)} onOpenEmployee={() => { window.localStorage.setItem("patrol360.inventory.ppe.employee", selected.employeeId); onNavigate("inventory-ppe"); }} row={selected} /> : null}
    </section>
  );
}


function HistoryEventDrawer({ onClose, onOpenEmployee, row }: { onClose: () => void; onOpenEmployee: () => void; row: InventoryPpeHistoryRowDto }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="ppe-v2-drawer-backdrop" onMouseDown={onClose} role="presentation">
      <aside aria-label="Детали события" aria-modal="true" className="ppe-v2-drawer" onMouseDown={(event) => event.stopPropagation()} role="dialog">
        <header>
          <div><span className="ppe-v2-eyebrow">Операция СИЗ</span><h2>{row.actionLabel}</h2><p>{formatDateTime(row.createdAt)}</p></div>
          <PpeButton aria-label="Закрыть" icon={<X size={20} />} onClick={onClose} variant="icon" />
        </header>
        <div className="ppe-v2-drawer-summary">
          <strong>{row.normItemName || row.itemName}</strong>
          <span>{row.employeeName}</span>
          <div><span className={`ppe-v2-status is-${row.fromStatus}`}>{statusLabel(row.fromStatus || "—")}</span><ChevronRight size={16} /><span className={`ppe-v2-status is-${row.toStatus}`}>{statusLabel(row.toStatus)}</span></div>
        </div>
        <dl>
          <div><dt>Номенклатура</dt><dd>{row.itemName}</dd></div>
          <div><dt>Количество</dt><dd>{row.quantity} {row.unit}</dd></div>
          <div><dt>Инициатор</dt><dd>{row.actor || "Система"}</dd></div>
          <div className="is-wide"><dt>Комментарий</dt><dd>{row.comment || "Без комментария"}</dd></div>
        </dl>
        <footer><PpeButton onClick={onOpenEmployee} variant="primary">Открыть карточку сотрудника</PpeButton></footer>
      </aside>
    </div>
  );
}function formatDateTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? formatDate(value) : date.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }); }
function statusLabel(value: string) { return ({ defective: "Неисправно", issued: "Выдано", returned: "Возвращено", written_off: "Списано" } as Record<string, string>)[value] ?? value; }
