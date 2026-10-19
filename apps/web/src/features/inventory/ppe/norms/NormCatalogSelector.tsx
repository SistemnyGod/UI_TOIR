import { useDeferredValue, useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { InventoryItemDto, InventoryPpeNormRowDto } from "../../../../api/contracts";
import { Button, ModalShell } from "../../../../shared/ui";
import { rankPpeCatalogItemsForNorm } from "../ppeNormSearch";
import { usePpeDialogOperation } from "../usePpeDialogOperation";
import "../../styles/ppe-norm-editor.css";

type Props = { disabled: boolean; items: InventoryItemDto[]; onSelect: (itemId: string) => Promise<boolean>; row: InventoryPpeNormRowDto };
export function NormCatalogSelector(props: Props) {
  return <SelectorWorkspace key={props.row.id} {...props} />;
}
function SelectorWorkspace(props: Props) {
  const [open, setOpen] = useState(false);
  return <div className="inventory-ppe-norm-catalog-selector"><Button aria-expanded={open} disabled={props.disabled || !props.items.length} onClick={() => setOpen(true)}><Search aria-hidden="true" size={14} />{props.row.mappings.length ? "Добавить допустимый товар" : "Подобрать товар из номенклатуры"}</Button>
    {open ? <CatalogDialog {...props} onClose={() => setOpen(false)} /> : null}</div>;
}
function CatalogDialog({ disabled, items, onSelect, row, onClose }: Props & { onClose: () => void }) {
  const [query, setQuery] = useState(""), [showOther, setShowOther] = useState(false), [page, setPage] = useState(0);
  const deferredQuery = useDeferredValue(query), operation = usePpeDialogOperation();
  const matches = useMemo(() => rankPpeCatalogItemsForNorm(row, items, deferredQuery, showOther, Number.MAX_SAFE_INTEGER), [deferredQuery, items, row, showOther]);
  const pageSize = 20, lastPage = Math.max(0, Math.ceil(matches.length / pageSize) - 1), currentPage = Math.min(page, lastPage);
  const visible = matches.slice(currentPage * pageSize, (currentPage + 1) * pageSize), busy = disabled || operation.pending;
  function select(itemId: string) {
    if (busy) return;
    void operation.execute(() => onSelect(itemId), saved => { if (saved) onClose(); else operation.setError("Сопоставление не выполнено. Обновите набор перед повторным действием."); });
  }
  return <ModalShell title="Подбор товара для нормы" subtitle={row.normItemName} className="ppe-norm-catalog-dialog" pending={operation.pending} onClose={onClose}
    actions={<><Button variant="ghost" disabled={operation.pending} onClick={onClose}>Закрыть</Button><span className="ppe-norm-catalog-range" role="status">{matches.length ? currentPage * pageSize + 1 : 0}–{Math.min((currentPage + 1) * pageSize, matches.length)} из {matches.length}</span><Button disabled={busy || currentPage === 0} onClick={() => setPage(currentPage - 1)}>Назад</Button><Button disabled={busy || currentPage >= lastPage} onClick={() => setPage(currentPage + 1)}>Далее</Button></>}>
    <p className="ppe-norm-editor-context">Выбор сохраняет сопоставление. Защитные свойства и соответствие нормативу утверждаются отдельно.</p>
    <div className="ppe-norm-catalog-tools"><label>Поиск номенклатуры<input autoFocus type="search" disabled={busy} value={query} placeholder="Название, артикул, модель…" onChange={event => { setQuery(event.target.value); setPage(0); operation.setError(""); }} /></label><Button disabled={busy} aria-pressed={showOther} onClick={() => { setShowOther(value => !value); setPage(0); }}>{showOther ? "Только рекомендации" : "Все товары для ручного выбора"}</Button></div>
    <p className="ppe-norm-editor-hint">{showOther ? "Все найденные товары. Проверьте соответствие вручную." : "Рекомендации по названию и характеристикам; они не означают утверждение."}</p>
    {operation.error ? <p className="field-error" role="alert">{operation.error}</p> : null}
    <div className="ppe-norm-catalog-list">{visible.map(({ item, reasons }) => <article key={item.id}><div><strong>{item.name}</strong><small>{[item.sku || item.article, item.category, item.unit].filter(Boolean).join(" · ") || "Без дополнительных данных"}</small><span>{reasons.slice(0, 2).join(" · ")}</span></div><Button disabled={busy} isLoading={operation.pending} aria-label={"Сопоставить: " + item.name} onClick={() => select(item.id)}>Сопоставить</Button></article>)}</div>
    {!visible.length ? <p className="ppe-norm-editor-hint">{query ? "По этому запросу товары не найдены." : "Рекомендаций пока нет. Откройте все товары для ручного выбора."}</p> : null}
  </ModalShell>;
}
