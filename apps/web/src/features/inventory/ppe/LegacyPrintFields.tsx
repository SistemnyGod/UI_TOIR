import { useMemo, useState } from "react";
import { Button, ModalShell, useDialogCloseGuard } from "../../../shared/ui";
import type { PrintData, PrintLine, PrintMode } from "./ppeTypes";
import { signatureRows } from "./ppePrint";

const PAGE_SIZE = 10;
export function LegacyPrintFields({ data, mode, onClose, onApply }: { data: PrintData; mode: PrintMode; onClose: () => void; onApply: (data: PrintData) => void }) {
  const [draft, setDraft] = useState(() => structuredClone(data)), [query, setQuery] = useState(""), [page, setPage] = useState(1);
  const dirty = JSON.stringify(draft) !== JSON.stringify(data);
  const close = useDialogCloseGuard({ dirty, pending: false, onClose, message: "Изменения полей ещё не применены к предпросмотру. При закрытии этого окна они будут потеряны." });
  const rows = useMemo(() => mode === "sheet" ? signatureRows(draft.lines) : draft.lines.map((line, sourceIndex) => ({ line, sourceIndex })).filter(({ line }) => !line.isSectionTitle), [draft.lines, mode]);
  // Search the original labels so editing a matching row does not remove the active input.
  const matched = rows.filter(({ sourceIndex }) => { const line = data.lines[sourceIndex]; return [line.itemName, line.printItemName, line.normPoint, line.brandModelArticle].join(" ").toLocaleLowerCase("ru").includes(query.trim().toLocaleLowerCase("ru")); });
  const pageCount = Math.max(1, Math.ceil(matched.length / PAGE_SIZE)), activePage = Math.min(page, pageCount);
  const visible = matched.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);
  function patch(sourceIndex: number, value: Partial<PrintLine>) { setDraft(current => ({ ...current, lines: current.lines.map((line, index) => index === sourceIndex ? { ...line, ...value } : line) })); }
  return <><ModalShell title="Правки для печати" subtitle={mode === "card" ? "Личная карточка" : "Лист подписи"} className="ppe-legacy-print-fields" onClose={close.requestClose}
    actions={<><Button variant="ghost" onClick={close.requestClose}>Отмена</Button><Button variant="primary" onClick={() => onApply(draft)}>Применить к предпросмотру</Button></>}>
    <p className="ppe-legacy-print-hint">Правки действуют только в открытом просмотре. Факты выдачи, количество и сведения сотрудника не изменяются.</p>
    <label className="ppe-legacy-print-search">Поиск строки<input type="search" placeholder="Наименование, пункт нормы или модель" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label>
    <div className="ppe-legacy-print-edit-rows">{visible.map(({ line, sourceIndex }) => <section key={sourceIndex}>
      <h3>Строка {sourceIndex + 1} · {data.lines[sourceIndex].itemName}</h3>
      {mode === "card" ? <>
        <label>Наименование СИЗ<textarea aria-label={`Наименование СИЗ · строка ${sourceIndex + 1}`} rows={2} value={line.printItemName ?? line.itemName} onChange={event => patch(sourceIndex, { printItemName: event.target.value })} /></label>
        <label>Пункт норм<input aria-label={`Пункт норм · строка ${sourceIndex + 1}`} value={line.normPoint} onChange={event => patch(sourceIndex, { normPoint: event.target.value })} /></label>
        <label>Единица и периодичность<input aria-label={`Единица и периодичность · строка ${sourceIndex + 1}`} value={line.issuePeriodText ?? ""} onChange={event => patch(sourceIndex, { issuePeriodText: event.target.value })} /></label>
      </> : <label>Модель, марка, артикул<textarea aria-label={`Модель, марка, артикул · строка ${sourceIndex + 1}`} rows={2} value={line.brandModelArticle ?? ""} onChange={event => patch(sourceIndex, { brandModelArticle: event.target.value })} /></label>}
    </section>)}</div>
    {!matched.length ? <p className="ppe-legacy-print-hint">Строки не найдены. Измените поисковый запрос.</p> : null}
    <nav className="ppe-legacy-print-pages" aria-label="Строки печатной формы"><span>Найдено: {matched.length} · страница {activePage} из {pageCount}</span><Button disabled={activePage === 1} onClick={() => setPage(activePage - 1)}>Назад</Button><Button disabled={activePage === pageCount} onClick={() => setPage(activePage + 1)}>Далее</Button></nav>
  </ModalShell>{close.discardDialog}</>;
}
