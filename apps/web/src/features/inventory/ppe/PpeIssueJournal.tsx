import { useEffect, useRef, useState } from "react";
import { Download, Plus, Settings2, ArrowLeft, RefreshCw } from "lucide-react";
import type { PpeIssueDocumentDto, PpeIssueDocumentSummaryDto } from "../../../api/contracts";
import type { PpeIssueJournalPage } from "../../../api/ppeJournalContracts";
import type { ScreenId } from "../../../types";
import { useInventoryRepository } from "../../../repositories/inventoryRepositoryContext";
import { ModalShell } from "../../../shared/ui/ModalShell";
import { InventoryPpeScreen } from "../InventoryPpeScreen";
import { JournalPeriodPicker } from "./JournalPeriodPicker";
import { addMonths } from "./documentWorkflow";
import { formatRuDate } from "./documentDraft";
import { ppeErrorMessage } from "./ppeErrors";
import "../styles/ppe-issue-document.css";
import "../styles/ppe-reference.css";
import "../styles/ppe-journal.css";

const columnNames = { department: "Подразделение", date: "Дата выдачи", status: "Статус документа", quantity: "Кол-во позиций", total: "Стоимость" };
type Column = keyof typeof columnNames;
const statusName = (status: string) => status === "confirmed" ? "Выдано" : status === "draft" ? "Выдаётся" : "Отменено";
export function PpeIssueJournal({ currentUserId = "anonymous", canManage, canExport, onNavigate, onNotify }: { currentUserId?: string; canManage: boolean; canExport: boolean; onNavigate: (screen: ScreenId) => void; onNotify: (text: string) => void }) {
  const repository = useInventoryRepository();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [legacy, setLegacy] = useState(false);
  const [rows, setRows] = useState<PpeIssueDocumentSummaryDto[]>([]);
  const [filters, setFilters] = useState({ query: "", department: "", status: "", from: "", to: "", employeeId: "" });
  const [result, setResult] = useState<PpeIssueJournalPage | null>(null);
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [columns, setColumns] = useState<Column[]>(["department", "date", "status", "quantity"]);
  const [settings, setSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<PpeIssueDocumentDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const request = useRef(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true); setError(""); setSelected(null); setRows([]); setDetailLoading(false); request.current++;
    const timer = window.setTimeout(() => {
      void repository.getPpeIssueDocumentCapabilities().then(async capabilities => {
        if (!active) return;
        setEnabled(capabilities.enabled);
        if (capabilities.enabled) {
          const next = await repository.getPpeIssueJournal({ ...filters, employeeId: filters.employeeId || undefined, page, pageSize: size }, controller.signal);
          if (active) { setResult(next); setRows(next.items); }
        }
      }).catch(reason => { if (active) setError(ppeErrorMessage(reason, "Не удалось загрузить журнал")); }).finally(() => { if (active) setLoading(false); });
    }, 200);
    return () => { active = false; controller.abort(); window.clearTimeout(timer); request.current++; };
  }, [repository, currentUserId, retry, filters, page, size]);
  useEffect(() => { setResult(null); }, [repository, currentUserId]);
  useEffect(() => {
    try { const value = JSON.parse(localStorage.getItem(`ppe.journal.columns.${currentUserId}`) ?? "null"); setColumns(Array.isArray(value) ? value.filter(item => item in columnNames) : ["department", "date", "status", "quantity"]); } catch { setColumns(["department", "date", "status", "quantity"]); }
  }, [currentUserId]);
  const total = result?.total ?? 0;
  const pageCount = result?.pageCount ?? 1;
  const currentPage = result?.page ?? 1;
  const visible = rows;
  function patchFilters(patch: Partial<typeof filters>) { setFilters(current => ({ ...current, ...patch })); setPage(1); }
  async function open(id: string) {
    const current = ++request.current; setDetailLoading(true); setError("");
    try { const value = await repository.getPpeIssueDocument(id); if (current === request.current) setSelected(value); }
    catch (reason) { if (current === request.current) setError(ppeErrorMessage(reason, "Не удалось открыть документ")); }
    finally { if (current === request.current) setDetailLoading(false); }
  }
  function openConstructor(id?: string) {
    if (id) sessionStorage.setItem(`ppe.open-document.${currentUserId}`, id);
    else localStorage.removeItem(`patrol360.inventory.ppe.issue-document.${currentUserId}`);
    onNavigate("inventory-ppe-create");
  }
  async function exportRows() {
    const generation = request.current;
    setExporting(true); setError("");
    try {
      const file = await repository.exportPpeIssueJournal({ ...filters, employeeId: filters.employeeId || undefined });
      if (generation !== request.current) return;
      const url = URL.createObjectURL(file.blob); const link = document.createElement("a"); link.href = url; link.download = file.fileName; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) { setError(ppeErrorMessage(reason, "Не удалось экспортировать журнал")); }
    finally { setExporting(false); }
  }
  if (enabled === false) return <InventoryPpeScreen onNavigate={onNavigate} onNotify={onNotify} />;
  if (legacy) return <><button className="button ghost" onClick={() => setLegacy(false)} type="button"><ArrowLeft size={18} /> Журнал выдачи</button><InventoryPpeScreen onNavigate={onNavigate} onNotify={onNotify} /></>;
  return <section className="ppe-document-screen ppe-journal"><header className="ppe-document-head"><div><p>СИЗ / Журнал выдачи</p><h1>Выдача СИЗ</h1></div><div className="ppe-document-actions">{canManage ? <button className="button primary" onClick={() => openConstructor()} type="button"><Plus size={18} /> Оформить выдачу</button> : null}<button className="button secondary" onClick={() => setSettings(true)} type="button"><Settings2 size={18} /> Настроить столбцы</button>{canExport ? <button className="button secondary" disabled={loading || exporting} onClick={() => void exportRows()} type="button"><Download size={18} /> Экспорт</button> : null}</div></header>
    <div className="ppe-journal-summary"><span>Все <b>{result?.summary.total ?? 0}</b></span><span>Выдано <b>{result?.summary.confirmed ?? 0}</b></span><span>Выдаётся <b>{result?.summary.draft ?? 0}</b></span><span>Есть просрочка <b>{result?.summary.overdue ?? 0}</b></span><button className="button ghost" onClick={() => setLegacy(true)} type="button">Нормы и личные карточки</button></div>
    <div className="ppe-ref-fields ppe-journal-filters"><label>Сотрудник<input type="search" placeholder="ФИО или табельный номер" value={filters.query} onChange={event => patchFilters({ query: event.target.value, employeeId: "" })} /></label><label>Подразделение<select value={filters.department} onChange={event => patchFilters({ department: event.target.value })}><option value="">Все подразделения</option>{(result?.departments ?? []).map(value => <option key={value}>{value}</option>)}</select></label><JournalPeriodPicker from={filters.from} to={filters.to} onChange={(from, to) => patchFilters({ from, to })} /><label>Статус документа<select value={filters.status} onChange={event => patchFilters({ status: event.target.value })}><option value="">Все статусы</option><option value="confirmed">Выдано</option><option value="draft">Выдаётся</option><option value="overdue">Есть просрочка</option><option value="cancelled">Отменено</option></select></label><button className="button ghost" onClick={() => patchFilters({ query: "", department: "", status: "", from: "", to: "", employeeId: "" })} type="button">Сбросить фильтры</button></div>
    {filters.employeeId ? <p>История выбранного сотрудника <button className="button ghost" onClick={() => patchFilters({ employeeId: "" })} type="button">Все сотрудники</button></p> : null}
    {error ? <div role="alert" className="ppe-document-alert is-error">{error}<button className="button secondary" onClick={() => setRetry(value => value + 1)} type="button"><RefreshCw size={18} /> Повторить</button></div> : null}
    {loading ? <p role="status">Загрузка журнала…</p> : <div className="ppe-journal-table"><table><thead><tr><th>Сотрудник</th>{columns.map(column => <th key={column}>{columnNames[column]}</th>)}<th>Действия</th></tr></thead><tbody>{visible.map(row => <tr key={row.id}><td><button className="ppe-journal-name" disabled={detailLoading} onClick={() => void open(row.id)} type="button">{row.employeeName}</button><small>Таб. № {row.personnelNo || "—"}</small></td>{columns.map(column => <td data-label={columnNames[column]} key={column}>{column === "department" ? row.department || "—" : column === "date" ? formatRuDate(row.documentDate) : column === "quantity" ? row.linesCount : column === "total" ? row.totalMinor === null ? "—" : `${(row.totalMinor / 100).toLocaleString("ru-RU")} ₽` : <span className={`ppe-issue-badge ${row.hasOverdue ? "is-overdue" : row.status}`}>{row.hasOverdue ? "Есть просрочка" : statusName(row.status)}</span>}</td>)}<td><button className="button ghost" disabled={detailLoading} onClick={() => void open(row.id)} type="button">Открыть</button></td></tr>)}</tbody></table>{!visible.length ? <div className="ppe-document-state">Выдачи не найдены</div> : null}</div>}
    <footer className="ppe-document-footer"><span>Показано {total ? (currentPage - 1) * size + 1 : 0}–{Math.min(currentPage * size, total)} из {total}</span><label>На странице <select value={size} onChange={event => { setSize(Number(event.target.value)); setPage(1); }}>{[10,25,50,100].map(value => <option key={value}>{value}</option>)}</select></label><button className="button secondary" disabled={loading || currentPage <= 1} onClick={() => setPage(currentPage - 1)} type="button">Назад</button><span>{currentPage} / {pageCount}</span><button className="button secondary" disabled={loading || currentPage >= pageCount} onClick={() => setPage(currentPage + 1)} type="button">Далее</button></footer>
    {settings ? <ModalShell title="Настроить столбцы" className="ppe-ref-modal ppe-template-modal" onClose={() => setSettings(false)}>{(Object.keys(columnNames) as Column[]).map(column => <label key={column}><input type="checkbox" checked={columns.includes(column)} onChange={event => { const next = event.target.checked ? [...columns, column] : columns.filter(value => value !== column); setColumns(next); try { localStorage.setItem(`ppe.journal.columns.${currentUserId}`, JSON.stringify(next)); } catch { onNotify("Настройки столбцов действуют до закрытия экрана"); } }} />{columnNames[column]}</label>)}</ModalShell> : null}
    {selected ? <ModalShell title={selected.status === "draft" ? "Готовится к выдаче" : "Выдано сотруднику"} subtitle={`${selected.content.employee.fullName} · Таб. № ${selected.content.employee.personnelNo} · ${formatRuDate(selected.content.documentDate)}`} className="ppe-ref-modal" onClose={() => setSelected(null)} actions={<><button className="button secondary" onClick={() => { patchFilters({ query: "", employeeId: selected.content.employee.id, department: "", from: "", to: "", status: "" }); setSelected(null); }} type="button">История сотрудника</button><button className="button primary" onClick={() => openConstructor(selected.id)} type="button">{selected.status === "draft" && canManage ? "Продолжить выдачу" : "Открыть документы"}</button></>}><div className="ppe-journal-table"><table><thead><tr>{["СИЗ / Номенклатура","Дата выдачи","Срок / до","Количество","Стоимость"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{selected.content.lines.map(line => { const due = addMonths(line.issueDate, line.lifeMonths ?? selected.content.normRows.find(row => row.id === line.normRowId)?.lifeMonths); return <tr key={line.id}><td>{line.itemName}<small>{line.brandModelArticle}</small></td><td data-label="Дата выдачи">{formatRuDate(line.issueDate)}</td><td data-label="Срок / до">{due ? formatRuDate(due) : "Не указан"}</td><td data-label="Количество">{line.quantity} {line.unitSymbol}</td><td data-label="Стоимость">{line.totalMinor === null ? "Не указана" : `${(line.totalMinor / 100).toLocaleString("ru-RU")} ₽`}</td></tr>; })}</tbody></table></div></ModalShell> : null}
  </section>;
}
