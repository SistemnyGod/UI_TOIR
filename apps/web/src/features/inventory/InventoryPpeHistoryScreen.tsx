import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FileClock, RefreshCw, RotateCcw, Search } from "lucide-react";
import type { InventoryPpeHistoryRowDto } from "../../api/contracts";
import type { ScreenId } from "../../types";
import { useInventoryRepository } from "../../repositories/inventoryRepositoryContext";
import { formatDate } from "./ppe/ppeCommon";
import { PpeModuleNav } from "./ppe/PpeModuleNav";
import { PpeButton } from "./ppe/PpeUi";
import { PpeHistoryEventDialog } from "./ppe/PpeHistoryEventDialog";
import { writeDocumentStorage } from "./ppe/documentStorage";

const historyStatuses = ["issued", "returned", "defective", "written_off"] as const;

export function InventoryPpeHistoryScreen({ onNavigate }: { onNavigate: (screen: ScreenId) => void }) {
  const repository = useInventoryRepository();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [action, setAction] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [loadedPage, setLoadedPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<InventoryPpeHistoryRowDto[]>([]);
  const [selected, setSelected] = useState<InventoryPpeHistoryRowDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const dateRangeInvalid = Boolean(dateFrom && dateTo && dateFrom > dateTo);

  useEffect(() => {
    if (dateRangeInvalid) {
      setError("");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    repository.getPpeHistory({ action, dateFrom, dateTo, page, pageSize: 30, query: deferredQuery, status })
      .then((result) => {
        if (cancelled) return;
        setRows(result.rows);
        setLoadedPage(result.page);
        setPageCount(Math.max(result.pageCount, 1));
        setTotal(result.total);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Не удалось загрузить историю СИЗ");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [action, dateFrom, dateRangeInvalid, dateTo, deferredQuery, page, reloadToken, repository, status]);

  useEffect(() => setPage(1), [action, dateFrom, dateTo, deferredQuery, status]);

  const hasFilters = Boolean(query || action || status || dateFrom || dateTo);
  const activeFilterCount = [query, action, status, dateFrom, dateTo].filter(Boolean).length;
  const pageSummary = useMemo(
    () => historyStatuses.map((value) => ({ count: rows.filter((row) => row.toStatus === value).length, label: statusLabel(value), value })),
    [rows],
  );

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
      <header className="ppe-v2-page-head">
        <div><span className="ppe-v2-eyebrow">Бухгалтерия / СИЗ</span><h1>История СИЗ</h1><p>Единый серверный журнал выдачи, возврата, списания и неисправностей.</p></div>
        <PpeModuleNav active="inventory-ppe-history" onNavigate={onNavigate} />
      </header>
      <section className="ppe-v2-history-panel">
        <header className="ppe-v2-history-toolbar">
          <div><h2>Операции с СИЗ</h2><p>Найдите событие, проверьте переход состояния и откройте карточку сотрудника.</p></div>
          {activeFilterCount > 0 ? <span className="ppe-v2-filter-count">Фильтров: {activeFilterCount}</span> : null}
        </header>
        <div className="ppe-v2-filter-bar">
          <label className="ppe-v2-search"><Search aria-hidden="true" size={17} /><input aria-label="Поиск в истории" onChange={(event) => setQuery(event.target.value)} placeholder="Сотрудник, СИЗ, норма" value={query} /></label>
          <label><span>Период с</span><input aria-invalid={dateRangeInvalid || undefined} onChange={(event) => setDateFrom(event.target.value)} type="date" value={dateFrom} /></label>
          <label><span>Период по</span><input aria-invalid={dateRangeInvalid || undefined} onChange={(event) => setDateTo(event.target.value)} type="date" value={dateTo} /></label>
          <label title="Какое действие было зарегистрировано в журнале"><span>Операция</span><select onChange={(event) => setAction(event.target.value)} value={action}><option value="">Все операции</option><option value="issued">Выдача</option><option value="returned">Возврат</option><option value="written_off">Списание</option><option value="defective">Неисправность</option></select></label>
          <label title="В каком состоянии позиция оказалась после операции"><span>Итоговое состояние</span><select onChange={(event) => setStatus(event.target.value)} value={status}><option value="">Все состояния</option><option value="issued">Выдано</option><option value="returned">Возвращено</option><option value="written_off">Списано</option><option value="defective">Неисправно</option></select></label>
          <PpeButton className="ppe-v2-reset-filters" disabled={!hasFilters} icon={<RotateCcw size={15} />} onClick={clearFilters} variant="secondary">Сбросить</PpeButton>
        </div>
        {dateRangeInvalid ? <div className="ppe-v2-history-notice is-warning" role="alert">Дата начала периода не может быть позже даты окончания.</div> : null}
        <div className="ppe-v2-history-kpis" aria-label="Сводка текущей страницы">
          {pageSummary.map((item) => <button aria-pressed={status === item.value} className={`is-${item.value}${status === item.value ? " is-selected" : ""}`} key={item.value} onClick={() => setStatus((current) => current === item.value ? "" : item.value)} type="button"><span>{item.label}</span><strong>{item.count}</strong><small>на странице</small></button>)}
        </div>
        <div className="ppe-v2-history-summary"><div><strong>{total}</strong><span>событий в выборке</span></div><small>{loading ? "Обновляем выборку" : error || dateRangeInvalid ? "Ранее загруженная выборка" : hasFilters ? "Применены фильтры" : "Все операции"} · новые сверху</small></div>
        {error ? <div className="ppe-v2-history-notice" role="alert"><strong>Не удалось обновить историю.</strong> {error} <PpeButton icon={<RefreshCw size={16} />} onClick={() => setReloadToken(value => value + 1)} variant="secondary">Повторить</PpeButton></div> : null}
        <p className="ppe-history-refresh-status" role="status">{loading ? rows.length ? "Обновляем историю. Показанные события остаются доступны." : "Загружаем историю…" : error || dateRangeInvalid ? "Показаны ранее загруженные события." : ""}</p>
        {rows.length > 0 ? (
          <div className="ppe-v2-table-wrap"><table className="ppe-v2-table ppe-v2-responsive-table ppe-v2-history-table"><thead><tr><th>Дата и время</th><th>Сотрудник</th><th>СИЗ / норма</th><th>Операция</th><th>Количество</th><th>Итог</th><th /></tr></thead><tbody>{rows.map((row) => <tr className={selected?.id === row.id ? "is-selected" : ""} key={row.id}><td data-label="Дата и время">{formatDateTime(row.createdAt)}</td><td data-label="Сотрудник"><strong>{row.employeeName}</strong></td><td data-label="СИЗ / норма"><strong>{row.normItemName || row.itemName}</strong>{row.normItemName && row.normItemName !== row.itemName ? <small>{row.itemName}</small> : null}</td><td data-label="Операция"><span className={`ppe-v2-action-badge is-${row.action}`}>{actionLabel(row.action, row.actionLabel)}</span></td><td data-label="Количество">{row.quantity} {row.unit}</td><td data-label="Итог"><span className={`ppe-v2-status is-${row.toStatus}`}>{statusLabel(row.toStatus)}</span></td><td className="ppe-v2-actions-cell" data-label="Детали"><PpeButton aria-label={`Открыть детали операции: ${row.employeeName}, ${row.itemName}`} icon={<ChevronRight size={18} />} onClick={() => setSelected(row)} size="compact" variant="icon" /></td></tr>)}</tbody></table></div>

        ) : !loading && !dateRangeInvalid && !error ? <div className="ppe-v2-state ppe-v2-state-large"><FileClock size={34} /><strong>Событий нет</strong><span>{hasFilters ? "Измените период или сбросьте фильтры." : "Операции появятся после первой выдачи СИЗ."}</span>{hasFilters ? <PpeButton icon={<RotateCcw size={15} />} onClick={clearFilters} variant="secondary">Сбросить фильтры</PpeButton> : null}</div> : null}
        <div className="ppe-v2-pagination"><PpeButton aria-label="Предыдущая страница" disabled={page <= 1 || loading || dateRangeInvalid || Boolean(error)} icon={<ChevronLeft size={17} />} onClick={() => setPage((value) => value - 1)} size="compact" variant="icon" /><span>Страница {loadedPage} из {pageCount}</span><PpeButton aria-label="Следующая страница" disabled={page >= pageCount || loading || dateRangeInvalid || Boolean(error)} icon={<ChevronRight size={17} />} onClick={() => setPage((value) => value + 1)} size="compact" variant="icon" /></div>
      </section>
      {selected ? <PpeHistoryEventDialog onClose={() => setSelected(null)} onOpenEmployee={() => { writeDocumentStorage("localStorage", "patrol360.inventory.ppe.employee", selected.employeeId); onNavigate("inventory-ppe"); }} row={selected} /> : null}
    </section>
  );
}

function formatDateTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? formatDate(value) : date.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }); }
function actionLabel(action: string, fallback: string) { return ({ defective: "Неисправность", issued: "Выдача", returned: "Возврат", written_off: "Списание" } as Record<string, string>)[action] ?? fallback; }
function statusLabel(value: string) { return ({ defective: "Неисправно", issued: "Выдано", returned: "Возвращено", written_off: "Списано" } as Record<string, string>)[value] ?? value; }
