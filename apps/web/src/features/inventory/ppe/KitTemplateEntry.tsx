import type { PpeKitTemplateDto } from "../../../api/contracts";
import { Button } from "../../../shared/ui";

export function KitTemplateEntry({ template, name, disabled, canEdit, compatible, onName, onRename, onApply, onCopy, onArchive }: {
  template: PpeKitTemplateDto; name: string; disabled: boolean; canEdit: boolean; compatible: boolean;
  onName: (name: string) => void; onRename: () => void; onApply: () => void; onCopy: () => void; onArchive: () => void;
}) {
  return <details className="ppe-kit-template-entry"><summary>{template.name} · {template.lines.length} позиций · {template.isShared ? `Общий, ${template.ownerName}` : "Личный"}</summary>
    {!compatible ? <p className="ppe-kit-dialog-hint">Шаблон относится к другой норме. Для текущего документа он недоступен.</p> : null}
    {canEdit ? <form className="ppe-kit-template-rename" onSubmit={event => { event.preventDefault(); onRename(); }}><label>Название шаблона<input maxLength={160} value={name} disabled={disabled} onChange={event => onName(event.target.value)} /></label><Button variant="ghost" disabled={disabled || !name.trim() || name === template.name} type="submit">Сохранить имя</Button></form> : null}
    <ul>{template.lines.map((line, index) => <li key={`${line.normRowId}:${line.itemId}:${index}`}><strong>{line.itemName}</strong><span>{line.quantity} {line.unitSymbol} · {line.lifeMonths ? `${line.lifeMonths} мес.` : "Срок из нормы"}</span></li>)}</ul>
    <div className="ppe-kit-template-actions"><Button variant="primary" disabled={disabled || !compatible} onClick={onApply}>Применить шаблон</Button><Button variant="ghost" disabled={disabled} onClick={onCopy}>Создать копию</Button>{canEdit ? <Button variant="danger" disabled={disabled} onClick={onArchive}>В архив</Button> : null}</div>
  </details>;
}
