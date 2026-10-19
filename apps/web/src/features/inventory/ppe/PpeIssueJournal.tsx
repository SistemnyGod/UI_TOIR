import { useEffect, useState } from "react";
import { Download, Plus, Settings2, ArrowLeft, RefreshCw } from "lucide-react";
import type { ScreenId } from "../../../types";
import { ModalShell } from "../../../shared/ui/ModalShell";
import { writeDocumentStorage } from "./documentStorage";
import { InventoryPpeScreen } from "../InventoryPpeScreen";
import { JournalFilters } from "./journal/JournalFilters";
import { JournalTable } from "./journal/JournalTable";
import { JournalDocumentModal } from "./journal/JournalDocumentModal";
import { journalColumnNames, readJournalColumns, type JournalColumn } from "./journal/journalColumns";
import { usePpeIssueJournal } from "./journal/usePpeIssueJournal";
import "../styles/ppe-issue-document.css";
import "../styles/ppe-reference.css";
import "../styles/ppe-journal.css";

export function PpeIssueJournal({ currentUserId = "anonymous", canManage, canExport, onNavigate, onNotify }: {
  currentUserId?: string; canManage: boolean; canExport: boolean;
  onNavigate: (screen: ScreenId) => void; onNotify: (text: string) => void;
}) {
  const journal = usePpeIssueJournal(currentUserId);
  const [legacy, setLegacy] = useState(false);
  const [columns, setColumns] = useState<JournalColumn[]>(() => readJournalColumns(currentUserId));
  const [settings, setSettings] = useState(false);
  useEffect(() => { setLegacy(false); setSettings(false); setColumns(readJournalColumns(currentUserId)); }, [currentUserId]);
  const { enabled, filters, result, rows, size, loading, error, selected, detailLoading, exporting, patchFilters } = journal;
  const total = result?.total ?? 0;
  const pageCount = result?.pageCount ?? 1;
  const currentPage = result?.page ?? 1;
  const responseSize = result?.pageSize ?? size;

  function openConstructor(id?: string) {
    if (id) writeDocumentStorage("sessionStorage", `ppe.open-document.${currentUserId}`, id);
    else writeDocumentStorage("localStorage", `patrol360.inventory.ppe.issue-document.${currentUserId}`);
    onNavigate("inventory-ppe-create");
  }
  function prepareNorms() {
    writeDocumentStorage("sessionStorage", "patrol360:inventory-ppe:norm-settings-intent", JSON.stringify({ position: "" }));
    onNavigate("inventory-settings");
  }
  function changeColumns(column: JournalColumn, checked: boolean) {
    const next = checked ? [...new Set([...columns, column])] : columns.filter(value => value !== column);
    setColumns(next);
    try { localStorage.setItem(`ppe.journal.columns.${currentUserId}`, JSON.stringify(next)); }
    catch { onNotify("Настройки столбцов действуют до закрытия экрана"); }
  }

  if (legacy) return <>
    <button className="button ghost" onClick={() => setLegacy(false)} type="button">
      <ArrowLeft size={18} /> Журнал выдачи</button>
    <InventoryPpeScreen currentUserId={currentUserId} canManage={canManage} canExport={canExport} onNavigate={onNavigate} onNotify={onNotify} />
  </>;
  return <section className="ppe-document-screen ppe-journal">
    <header className="ppe-document-head">
      <div>
        <p>СИЗ / Журнал выдачи</p>
        <h1>Выдача СИЗ</h1>
      </div>
      <div className="ppe-document-actions">
        {canManage ? <button className="button primary" onClick={() => openConstructor()} type="button">
          <Plus size={18} /> Оформить выдачу</button> : null}
        <button className="button secondary" disabled={loading} onClick={journal.refresh} type="button">
          <RefreshCw size={18} /> Обновить</button>
        <button className="button secondary" onClick={() => setSettings(true)} type="button">
          <Settings2 size={18} /> Настроить столбцы</button>
        {canExport ? <button className="button secondary" disabled={loading || exporting} onClick={() => void journal.exportRows()} type="button">
          <Download size={18} /> {exporting ? "Экспорт…" : "Экспорт"}</button> : null}
      </div>
    </header>
    {enabled === false ? <div className="ppe-document-alert is-warning">Новые выдачи выключены до завершения проверки норм. <button type="button" className="button secondary" onClick={prepareNorms}>Подготовить нормы СИЗ</button>
    </div> : null}
    <div className="ppe-journal-summary">
      <span>Все <b>{result?.summary.total ?? 0}</b>
      </span>
      <span>Выдано <b>{result?.summary.confirmed ?? 0}</b>
      </span>
      <span>Выдаётся <b>{result?.summary.draft ?? 0}</b>
      </span>
      <span>Есть просрочка <b>{result?.summary.overdue ?? 0}</b>
      </span>
      <button className="button ghost" onClick={() => setLegacy(true)} type="button">Нормы и личные карточки</button>
    </div>
    <JournalFilters filters={filters} departments={result?.departments ?? []} onChange={patchFilters} />
    {filters.employeeId ? <p>История выбранного сотрудника <button className="button ghost" onClick={() => patchFilters({ employeeId: "" })} type="button">Все сотрудники</button>
    </p> : null}
    {error ? <div role="alert" className="ppe-document-alert is-error">{error}<button className="button secondary" onClick={journal.refresh} type="button">
      <RefreshCw size={18} /> Повторить</button>
    </div> : null}
    <div className="ppe-journal-loading" role="status" aria-live="polite">{loading ? rows.length ? "Обновление журнала…" : "Загрузка журнала…" : detailLoading ? "Открываем документ…" : ""}</div>
    <JournalTable rows={rows} columns={columns} loading={loading} detailLoading={detailLoading} onOpen={id => void journal.openDocument(id)} />
    <footer className="ppe-document-footer">
      <span>Показано {total ? (currentPage - 1) * responseSize + 1 : 0}–{Math.min(currentPage * responseSize, total)} из {total}</span>
      <label>На странице <select value={size} onChange={event => { journal.setSize(Number(event.target.value)); journal.setPage(1); }}>{[10, 25, 50, 100].map(value => <option key={value}>{value}</option>)}</select>
      </label>
      <button className="button secondary" disabled={loading || currentPage <= 1} onClick={() => journal.setPage(currentPage - 1)} type="button">Назад</button>
      <span>{currentPage} / {pageCount}</span>
      <button className="button secondary" disabled={loading || currentPage >= pageCount} onClick={() => journal.setPage(currentPage + 1)} type="button">Далее</button>
    </footer>
    {settings ? <ModalShell title="Настроить столбцы" className="ppe-ref-modal ppe-template-modal ppe-journal-column-settings" onClose={() => setSettings(false)}>
      {(Object.keys(journalColumnNames) as JournalColumn[]).map(column => <label key={column}>
        <input type="checkbox" checked={columns.includes(column)} onChange={event => changeColumns(column, event.target.checked)} />{journalColumnNames[column]}</label>)}
    </ModalShell> : null}
    {selected ? <JournalDocumentModal document={selected} canManage={canManage} onClose={journal.closeDocument}
      onHistory={() => { patchFilters({ query: "", employeeId: selected.content.employee.id, department: "", from: "", to: "", status: "" }); journal.closeDocument(); }}
      onOpen={() => openConstructor(selected.id)} /> : null}
  </section>;
}
