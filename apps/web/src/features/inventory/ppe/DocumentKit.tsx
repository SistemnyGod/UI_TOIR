import { useMemo, useState } from "react";
import { Package, Plus, Layers } from "lucide-react";
import type { InventoryPpeNormRowDto } from "../../../api/contracts";
import type { DraftLine } from "./documentWorkflow";
import { KitPicker } from "./KitPicker";
import { LineFields } from "./LineFields";
import "../styles/ppe-kit-dialogs.css";
import { KitLineActions } from "./KitLineActions";
import { KitTemplates } from "./KitTemplates";

type Props = { contextKey?: string; currentUserId: string; canManageTemplates: boolean; normSetId: string; rows: InventoryPpeNormRowDto[]; allRows: InventoryPpeNormRowDto[]; lines: DraftLine[]; editable: boolean; date: string; onLines: (lines: DraftLine[] | ((current: DraftLine[]) => DraftLine[])) => void; onAddFullKit: () => void };
export function DocumentKit(p: Props) { return <DocumentKitWorkspace key={`${p.currentUserId}:${p.normSetId}:${p.contextKey ?? ""}`} {...p} />; }
function DocumentKitWorkspace(p: Props) {
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
  const update = (id: string, patch: Partial<DraftLine>) => p.onLines(current => { const normRowId = current.find(item => item.id === id)?.normRowId; return current.map(line => (line.id === id || (patch.normPoint !== undefined && line.normRowId === normRowId)) ? { ...line, ...patch } : line); });
  const total = p.lines.reduce((sum, line) => sum + line.quantity * (line.unitPriceMinor ?? 0), 0);
  return <div className="ppe-kit">
    <div className="ppe-kit-toolbar"><h2>Подбор и проверка комплекта СИЗ</h2>{p.editable ? <div className="ppe-document-actions"><button className="button primary" onClick={() => setPicker(true)} type="button"><Plus size={18} /> Добавить СИЗ</button><button className="button secondary" onClick={() => setTemplates(true)} type="button"><Layers size={18} /> Из шаблона</button><button className="button ghost" onClick={p.onAddFullKit} type="button">Заполнить по норме</button></div> : null}</div>
    <div className="ppe-kit-toolbar"><label>Группировать <select value={grouping} onChange={event => setGrouping(event.target.value)}><option value="category">По категории</option><option value="gost">По ГОСТ</option><option value="basis">По основанию выдачи</option></select></label><span className="ppe-ref-muted">Шаблон не заменяет проверку применимости нормы</span></div>
    <div className="ppe-document-lines">{grouped.map(([group, lines]) => <section key={group}><h3 className="ppe-kit-group">{group}</h3>{lines.map(line => <article key={line.id} className="ppe-kit-line"><div className="ppe-kit-item"><Package size={26} /><span><strong>{line.itemName}</strong>{line.normName !== line.itemName ? <small>{line.normName}</small> : null}</span></div><LineFields line={line} disabled={!p.editable} onChange={patch => update(line.id, patch)} />
      <KitLineActions line={line} editable={p.editable} onChange={patch => update(line.id, patch)} onRemove={() => p.onLines(current => current.filter(row => row.id !== line.id))} /></article>)}</section>)}</div>
    {!p.lines.length ? <div className="ppe-document-state"><Package size={28} /><p>Комплект пока пуст</p><p>Выберите СИЗ вручную, заполните по норме или примените шаблон. Позиции появятся здесь для редактирования.</p></div> : null}
    <div className="ppe-kit-total">{p.lines.length} позиций · {(total / 100).toLocaleString("ru-RU")} ₽{p.lines.some(line => line.unitPriceMinor === null) ? <small>Без стоимости позиций с неуказанной ценой</small> : null}</div>
    {picker ? <KitPicker userId={p.currentUserId} canManageShared={p.canManageTemplates} normSetId={p.normSetId} rows={p.rows} groupNames={groupNames} date={p.date} onClose={() => setPicker(false)} onAdd={selected => p.onLines(current => [...current, ...selected])} /> : null}
    {templates ? <KitTemplates userId={p.currentUserId} canManageShared={p.canManageTemplates} normSetId={p.normSetId} rows={p.rows} lines={p.lines} date={p.date} onClose={() => setTemplates(false)} onApply={p.onLines} /> : null}
  </div>;
}
