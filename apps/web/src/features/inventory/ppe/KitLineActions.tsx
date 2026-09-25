import { useState } from "react";
import { Settings2, Trash2 } from "lucide-react";
import { ModalShell } from "../../../shared/ui/ModalShell";
import type { DraftLine } from "./documentWorkflow";
export function KitLineActions({ line, editable, onChange, onRemove }: { line: DraftLine; editable: boolean; onChange: (patch: Partial<DraftLine>) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  return <div className="ppe-kit-line-actions"><button className="ppe-document-icon" type="button" title="Исключение и ручной контроль" aria-label={`Контроль: ${line.itemName}`} onClick={() => setOpen(true)}><Settings2 size={18} /></button>{editable ? <button className="ppe-document-icon" type="button" title="Удалить позицию" aria-label={`Удалить ${line.itemName}`} onClick={onRemove}><Trash2 size={18} /></button> : null}
    {open ? <ModalShell title="Исключение и ручной контроль" subtitle={line.itemName} className="ppe-ref-modal ppe-actions-modal" onClose={() => setOpen(false)}><label className="ppe-document-manual"><input type="checkbox" checked={Boolean(line.manualControlConfirmed)} disabled={!editable} onChange={event => onChange({ manualControlConfirmed: event.target.checked })} /> Ручной контроль</label><label className="ppe-line-reason">Причина исключения<textarea rows={3} maxLength={2000} disabled={!editable} value={line.exceptionReason ?? ""} onChange={event => onChange({ exceptionReason: event.target.value })} /></label></ModalShell> : null}
  </div>;
}
