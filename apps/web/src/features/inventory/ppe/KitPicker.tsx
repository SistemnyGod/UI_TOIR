import { useMemo, useState } from "react";
import { Layers, Package, Trash2 } from "lucide-react";
import type { InventoryPpeNormRowDto } from "../../../api/contracts";
import { Button, ModalShell, useDialogCloseGuard } from "../../../shared/ui";
import { createDraftLine } from "./documentDraft";
import type { DraftLine } from "./documentWorkflow";
import { KitTemplates } from "./KitTemplates";
import { LineFields } from "./LineFields";
import { validateKitLines } from "./kitLineValidation";
import { usePpeDialogOperation } from "./usePpeDialogOperation";
import "../styles/ppe-kit-dialogs.css";

type Props = { userId: string; canManageShared: boolean; normSetId: string; rows: InventoryPpeNormRowDto[]; groupNames: Map<string, string>; date: string; onClose: () => void; onAdd: (lines: DraftLine[]) => void | boolean | Promise<void | boolean> };
export function KitPicker(props: Props) { return <PickerWorkspace key={`${props.userId}:${props.normSetId}:${props.date}`} {...props} />; }
function PickerWorkspace({ userId, canManageShared, normSetId, rows, groupNames, date, onClose, onAdd }: Props) {
  const [query, setQuery] = useState(""), [category, setCategory] = useState(""), [sort, setSort] = useState("category");
  const [templateOpen, setTemplateOpen] = useState(false), [panel, setPanel] = useState("catalog"), [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Record<string, DraftLine>>({});
  const operation = usePpeDialogOperation();
  const { requestClose, discardDialog } = useDialogCloseGuard({ dirty: Object.keys(selected).length > 0, pending: operation.pending, onClose });
  const candidates = useMemo(() => rows.flatMap(row => (row.mappings ?? []).filter(mapping => mapping.isApproved).map(mapping => ({ row, mapping, key: `${row.id}:${mapping.itemId}`, category: groupNames.get(row.parentRowId ?? "") || "Без категории" }))), [rows, groupNames]);
  const available = useMemo(() => new Set(candidates.map(item => item.key)), [candidates]);
  const visible = useMemo(() => candidates.filter(item => (!category || category === item.category) && `${item.mapping.itemName} ${item.mapping.itemSku} ${item.mapping.standards?.flatMap(standard => [standard.designation, standard.name]).join(" ") ?? ""}`.toLocaleLowerCase("ru").includes(query.trim().toLocaleLowerCase("ru"))).sort((a, b) => (sort === "category" ? a.category.localeCompare(b.category, "ru") : sort === "standard" ? (a.mapping.standards?.[0]?.designation ?? "я").localeCompare(b.mapping.standards?.[0]?.designation ?? "я", "ru") : 0) || a.mapping.itemName.localeCompare(b.mapping.itemName, "ru")), [candidates, category, query, sort]);
  const pageCount = Math.max(1, Math.ceil(visible.length / 24)), currentPage = Math.min(page, pageCount);
  const selectedLines = Object.values(selected);
  function add() {
    if (!selectedLines.length) return;
    const unavailable = Object.keys(selected).find(key => !available.has(key));
    const error = unavailable ? `Соответствие для позиции «${selected[unavailable].itemName}» больше не утверждено. Уберите позицию или выберите допустимый товар.` : validateKitLines(selectedLines);
    if (error) { operation.setError(error); setPanel("selected"); return; }
    void operation.execute(() => onAdd(selectedLines), result => { if (result === false) operation.setError("Не удалось добавить позиции. Выбор сохранён — повторите попытку."); else onClose(); });
  }
  function remove(key: string) { setSelected(current => { const next = { ...current }; delete next[key]; return next; }); operation.setError(""); }
  return <><ModalShell title="Выберите СИЗ" subtitle="Подбор по утверждённым соответствиям выбранной нормы" className="ppe-kit-picker-dialog" onClose={requestClose} pending={operation.pending}
    actions={<><span className="ppe-kit-selection-count">Выбрано: {selectedLines.length}</span><Button disabled={operation.pending} variant="ghost" onClick={requestClose}>Отмена</Button><Button disabled={operation.pending || !selectedLines.length} variant="primary" onClick={add}>{operation.pending ? "Добавление…" : "Добавить выбранное"}</Button></>}>
    {operation.error ? <p role="alert" className="field-error">{operation.error}</p> : null}
    <fieldset className="ppe-kit-picker-fields" disabled={operation.pending}>
      <div className="ppe-kit-picker-tabs" role="group" aria-label="Панель подбора"><Button variant="ghost" aria-pressed={panel === "catalog"} onClick={() => setPanel("catalog")}>Каталог</Button><Button variant="ghost" aria-pressed={panel === "selected"} onClick={() => setPanel("selected")}>Выбрано ({selectedLines.length})</Button></div>
      <div className={`ppe-kit-picker-columns show-${panel}`}><section className="ppe-kit-picker-catalog">
        <div className="ppe-kit-dialog-toolbar"><h3>Каталог СИЗ</h3><Button variant="ghost" onClick={() => setTemplateOpen(true)}><Layers size={16} /> Из шаблона</Button></div>
        <div className="ppe-kit-dialog-filters"><label>Поиск<input type="search" placeholder="Наименование, артикул или стандарт" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label><label>Категория<select value={category} onChange={event => { setCategory(event.target.value); setPage(1); }}><option value="">Все категории</option>{[...new Set(candidates.map(item => item.category))].map(value => <option key={value}>{value}</option>)}</select></label><label>Сортировка<select value={sort} onChange={event => { setSort(event.target.value); setPage(1); }}><option value="category">Категория → название</option><option value="standard">По стандарту</option><option value="name">По названию</option></select></label></div>
        <div className="ppe-kit-product-grid">{visible.slice((currentPage - 1) * 24, currentPage * 24).map(item => <button type="button" className={`ppe-kit-product${selected[item.key] ? " is-selected" : ""}`} aria-label={`Выбрать СИЗ: ${item.mapping.itemName}`} aria-pressed={Boolean(selected[item.key])} key={item.key} onClick={() => { operation.setError(""); if (selected[item.key]) remove(item.key); else setSelected(current => ({ ...current, [item.key]: createDraftLine(item.row, item.mapping, date, false) })); }}>
          <Package aria-hidden="true" size={22} /><strong>{item.mapping.itemName}</strong><small>Арт. {item.mapping.itemSku || "не указан"}</small><small>{item.mapping.standards?.length ? item.mapping.standards.map(standard => `${standard.designation}${standard.name ? ` — ${standard.name}` : ""}`).join("; ") : "Стандарты не указаны"}</small><b>{item.mapping.defaultUnitPriceMinor ? `${(item.mapping.defaultUnitPriceMinor / 100).toLocaleString("ru-RU")} ₽` : "Цена не указана"}</b>
        </button>)}</div>
        {!visible.length ? <p className="ppe-kit-dialog-hint">Товары не найдены. Доступны только утверждённые соответствия выбранной норме.</p> : null}
        <nav className="ppe-kit-dialog-pager" aria-label="Страницы каталога СИЗ"><Button variant="ghost" size="sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Назад</Button><span>{currentPage} / {pageCount} · {visible.length} позиций</span><Button variant="ghost" size="sm" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Вперёд</Button></nav>
      </section><section className="ppe-kit-picker-selected"><h3>Выбранные позиции · {selectedLines.length}</h3><p className="ppe-kit-dialog-hint">Проверьте срок, количество, цену и размер.</p>{!selectedLines.length ? <p>Выберите позиции в каталоге или примените шаблон.</p> : null}
        {Object.entries(selected).map(([key, line]) => <article key={key}><div className="ppe-kit-dialog-toolbar"><strong>{line.itemName}</strong><Button variant="ghost" aria-label={`Убрать ${line.itemName}`} onClick={() => remove(key)}><Trash2 size={16} /></Button></div>{!available.has(key) ? <p className="field-error">Соответствие больше не утверждено.</p> : null}<div className="ppe-kit-dialog-fields"><LineFields line={line} disabled={operation.pending} onChange={patch => { setSelected(current => ({ ...current, [key]: { ...current[key], ...patch } })); operation.setError(""); }} /></div></article>)}
      </section></div>
    </fieldset>
  </ModalShell>{discardDialog}
    {templateOpen ? <KitTemplates userId={userId} canManageShared={canManageShared} normSetId={normSetId} rows={rows} lines={selectedLines} date={date} onClose={() => setTemplateOpen(false)} onApply={updater => { setSelected(current => Object.fromEntries(updater(Object.values(current)).map(line => [`${line.normRowId}:${line.itemId}`, line]))); setPanel("selected"); }} /> : null}
  </>;
}
