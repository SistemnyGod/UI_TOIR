import { useId, useMemo, useState } from "react";
import { Package, Plus, Trash2, Layers } from "lucide-react";
import type { InventoryPpeNormRowDto } from "../../../api/contracts";
import { ModalShell } from "../../../shared/ui/ModalShell";
import { createDraftLine, formatPriceInput, parsePriceInput } from "./documentDraft";
import { addMonths, type DraftLine } from "./documentWorkflow";
import { KitLineActions } from "./KitLineActions";
import { KitTemplates } from "./KitTemplates";

type Props = { currentUserId: string; canManageTemplates: boolean; normSetId: string; rows: InventoryPpeNormRowDto[]; allRows: InventoryPpeNormRowDto[]; lines: DraftLine[]; editable: boolean; date: string; onLines: (lines: DraftLine[] | ((current: DraftLine[]) => DraftLine[])) => void; onAddFullKit: () => void };
export function DocumentKit(p: Props) {
  const [picker, setPicker] = useState(false);
  const [templates, setTemplates] = useState(false);
  const [grouping, setGrouping] = useState("category");
  const groupNames = useMemo(() => new Map(p.allRows.filter(row => row.rowType === "group").map(row => [row.id, row.normItemName])), [p.allRows]);
  const grouped = useMemo(() => {
    const result = new Map<string, DraftLine[]>();
    for (const line of p.lines) {
      const row = p.rows.find(row => row.id === line.normRowId);
      const group = grouping === "gost" ? line.standards?.map(item => item.designation).filter(Boolean).join(", ") || "Стандарты не указаны" : grouping === "basis" ? line.normPoint ?? row?.normPoint ?? "Пункт нормы не указан" : groupNames.get(row?.parentRowId ?? "") || "Без категории";
      result.set(group, [...(result.get(group) ?? []), line]);
    }
    return [...result];
  }, [p.lines, p.rows, grouping, groupNames]);
  const update = (id: string, patch: Partial<DraftLine>) => p.onLines(current => current.map(line => (line.id === id || (patch.normPoint !== undefined && line.normRowId === current.find(item => item.id === id)?.normRowId)) ? { ...line, ...patch } : line));
  const total = p.lines.reduce((sum, line) => sum + line.quantity * (line.unitPriceMinor ?? 0), 0);
  return <div className="ppe-kit">
    <div className="ppe-kit-toolbar"><h2>Подбор и проверка комплекта СИЗ</h2>{p.editable ? <div className="ppe-document-actions"><button className="button primary" onClick={() => setPicker(true)} type="button"><Plus size={18} /> Добавить СИЗ</button><button className="button secondary" onClick={() => setTemplates(true)} type="button"><Layers size={18} /> Из шаблона</button><button className="button ghost" onClick={p.onAddFullKit} type="button">Заполнить по норме</button></div> : null}</div>
    <div className="ppe-kit-toolbar"><label>Группировать <select value={grouping} onChange={event => setGrouping(event.target.value)}><option value="category">По категории</option><option value="gost">По ГОСТ</option><option value="basis">По основанию выдачи</option></select></label><span className="ppe-ref-muted">Шаблон не заменяет проверку применимости нормы</span></div>
    <div className="ppe-document-lines">{grouped.map(([group, lines]) => <section key={group}><h3 className="ppe-kit-group">{group}</h3>{lines.map(line => <article key={line.id} className="ppe-kit-line"><div className="ppe-kit-item"><Package size={26} /><span><strong>{line.itemName}</strong>{line.normName !== line.itemName ? <small>{line.normName}</small> : null}</span></div><LineFields line={line} disabled={!p.editable} onChange={patch => update(line.id, patch)} />
      <KitLineActions line={line} editable={p.editable} onChange={patch => update(line.id, patch)} onRemove={() => p.onLines(current => current.filter(row => row.id !== line.id))} /></article>)}</section>)}</div>
    {!p.lines.length ? <div className="ppe-document-state"><Package size={28} /><p>Комплект пока пуст</p><p>Выберите СИЗ вручную, заполните по норме или примените шаблон. Позиции появятся здесь для редактирования.</p></div> : null}
    <div className="ppe-kit-total">{p.lines.length} позиций · {(total / 100).toLocaleString("ru-RU")} ₽{p.lines.some(line => line.unitPriceMinor === null) ? <small>Без стоимости позиций с неуказанной ценой</small> : null}</div>
    {picker ? <KitPicker userId={p.currentUserId} canManageShared={p.canManageTemplates} normSetId={p.normSetId} rows={p.rows} groupNames={groupNames} date={p.date} onClose={() => setPicker(false)} onAdd={selected => { p.onLines(current => [...current, ...selected]); setPicker(false); }} /> : null}
    {templates ? <KitTemplates userId={p.currentUserId} canManageShared={p.canManageTemplates} normSetId={p.normSetId} rows={p.rows} lines={p.lines} date={p.date} onClose={() => setTemplates(false)} onApply={p.onLines} /> : null}
  </div>;
}

export function LineFields({ line, disabled, onChange }: { line: DraftLine; disabled: boolean; onChange: (patch: Partial<DraftLine>) => void }) {
  const presetsId = useId();
  const formatted = formatPriceInput(line.unitPriceMinor);
  const [price, setPrice] = useState<string | null>(null);
  const months = line.lifeMonths ?? null;
  const due = addMonths(line.issueDate, months);
  return <>
    <label>Пункт нормы<input maxLength={600} value={line.normPoint ?? ""} placeholder="Пункт и приложение" disabled={disabled} onChange={event => onChange({ normPoint: event.target.value })} /></label>
    <label>Дата выдачи<input type="date" value={line.issueDate} disabled={disabled} onChange={event => onChange({ issueDate: event.target.value })} /></label>
    <label className="ppe-line-duration">Срок, мес.<input type="number" min={1} max={1200} step={1} list={presetsId} value={months ?? ""} disabled={disabled} onChange={event => onChange({ lifeMonths: event.target.value ? Number(event.target.value) : null })} /><datalist id={presetsId}>{[1, 3, 6, 12, 18, 24, 36, 48].map(value => <option key={value} value={value} />)}</datalist><small>{due ? `До ${due.split("-").reverse().join(".")}` : "Срок не задан"}</small></label>
    <label>Количество<input type="number" min="0.001" step="0.001" value={line.quantity} disabled={disabled} onChange={event => onChange({ quantity: Number(event.target.value) })} /></label>
    <label>Цена, руб.<input inputMode="decimal" value={price ?? formatted} disabled={disabled} onChange={event => setPrice(event.target.value)} onBlur={() => { const parsed = parsePriceInput(price ?? formatted); if (parsed !== undefined) onChange({ unitPriceMinor: parsed }); setPrice(null); }} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>
    <label>Размер<input value={line.sizeText ?? ""} disabled={disabled} maxLength={120} onChange={event => onChange({ sizeText: event.target.value })} /></label>
  </>;
}

function KitPicker({ userId, canManageShared, normSetId, rows, groupNames, date, onClose, onAdd }: { userId: string; canManageShared: boolean; normSetId: string; rows: InventoryPpeNormRowDto[]; groupNames: Map<string, string>; date: string; onClose: () => void; onAdd: (lines: DraftLine[]) => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [templateOpen, setTemplateOpen] = useState(false);
  const [panel, setPanel] = useState("catalog");
  const [selected, setSelected] = useState<Record<string, DraftLine>>({});
  const [sort, setSort] = useState("category");
  const candidates = rows.flatMap(row => (row.mappings ?? []).filter(mapping => mapping.isApproved).map(mapping => ({ row, mapping, key: `${row.id}:${mapping.itemId}`, category: groupNames.get(row.parentRowId ?? "") || "Без категории" })));
  const visible = candidates.filter(item => (!category || category === item.category) && `${item.mapping.itemName} ${item.mapping.itemSku} ${item.mapping.standards?.flatMap(row => [row.designation, row.name]).join(" ") ?? ""}`.toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru"))).sort((a, b) => (sort === "category" ? a.category.localeCompare(b.category, "ru") : sort === "standard" ? (a.mapping.standards?.[0]?.designation ?? "я").localeCompare(b.mapping.standards?.[0]?.designation ?? "я", "ru") : 0) || a.mapping.itemName.localeCompare(b.mapping.itemName, "ru"));
  if (templateOpen) return <KitTemplates userId={userId} canManageShared={canManageShared} normSetId={normSetId} rows={rows} lines={Object.values(selected)} date={date} onClose={() => setTemplateOpen(false)} onApply={updater => { setSelected(current => Object.fromEntries(updater(Object.values(current)).map(line => [`${line.normRowId}:${line.itemId}`, line]))); setPanel("selected"); }} />;
  return <ModalShell title="Выберите СИЗ" className="ppe-ref-modal ppe-picker-modal ppe-picker-split" onClose={onClose} actions={<><span>Выбрано {Object.keys(selected).length} позиций</span><button className="button secondary" onClick={onClose} type="button">Отмена</button><button className="button primary" disabled={!Object.keys(selected).length} onClick={() => onAdd(Object.values(selected))} type="button">Добавить выбранное</button></>}>
    <div className="ppe-picker-tabs" role="group" aria-label="Панель подбора"><button type="button" className="button secondary" aria-pressed={panel === "catalog"} onClick={() => setPanel("catalog")}>Каталог</button><button type="button" className="button secondary" aria-pressed={panel === "selected"} onClick={() => setPanel("selected")}>Выбрано ({Object.keys(selected).length})</button></div>
    <div className={`ppe-picker-columns show-${panel}`}><section className="ppe-picker-catalog"><div className="ppe-kit-toolbar"><h3>Каталог СИЗ</h3><button className="button secondary" type="button" onClick={() => setTemplateOpen(true)}><Layers size={18} /> Из шаблона</button></div>
    <div className="ppe-picker-filters"><label>Поиск<input type="search" placeholder="По наименованию, артикулу или стандарту" value={query} onChange={event => setQuery(event.target.value)} /></label><label>Категория<select value={category} onChange={event => setCategory(event.target.value)}><option value="">Все категории</option>{[...new Set(candidates.map(item => item.category))].map(value => <option key={value}>{value}</option>)}</select></label><label>Сортировка<select value={sort} onChange={event => setSort(event.target.value)}><option value="category">Категория → название</option><option value="standard">По стандарту</option><option value="name">По названию</option></select></label></div>
    <div className="ppe-picker-grid">{visible.map(item => <button type="button" className={`ppe-product-tile ${selected[item.key] ? "is-selected" : ""}`} aria-pressed={Boolean(selected[item.key])} key={item.key} onClick={() => setSelected(current => { const next = { ...current }; if (next[item.key]) delete next[item.key]; else next[item.key] = createDraftLine(item.row, item.mapping, date, false); return next; })}><Package size={40} /><strong>{item.mapping.itemName}</strong><small>Арт. {item.mapping.itemSku || "не указан"}</small><small className="ppe-tile-standards" title={item.mapping.standards?.map(row => `${row.designation} — ${row.name}`).join("; ")}>{item.mapping.standards?.length ? item.mapping.standards.map(row => row.name ? `${row.designation} — ${row.name}` : row.designation).join("; ") : "Стандарты не указаны"}</small><b>{item.mapping.defaultUnitPriceMinor ? `${(item.mapping.defaultUnitPriceMinor / 100).toLocaleString("ru-RU")} ₽` : "Цена не указана"}</b></button>)}</div>
    {!visible.length ? <p>Товары не найдены. Доступны только утверждённые соответствия выбранной норме.</p> : null}
    </section><section className="ppe-picker-editor"><h3>Выбранные позиции · {Object.keys(selected).length}</h3><p className="ppe-ref-muted">Укажите срок, количество, цену и размер перед добавлением.</p>{!Object.keys(selected).length ? <p className="ppe-document-state">Выберите карточки слева или примените шаблон.</p> : null}
    <div className="ppe-picker-selected">{Object.entries(selected).map(([key, line]) => <section key={key}><div className="ppe-kit-toolbar"><strong>{line.itemName}</strong><button type="button" className="ppe-document-icon" aria-label={`Убрать ${line.itemName}`} onClick={() => setSelected(current => { const next = { ...current }; delete next[key]; return next; })}><Trash2 size={18} /></button></div><div className="ppe-ref-fields"><LineFields line={line} disabled={false} onChange={patch => setSelected(current => ({ ...current, [key]: { ...current[key], ...patch } }))} /></div></section>)}</div>
    </section></div>
  </ModalShell>;
}
