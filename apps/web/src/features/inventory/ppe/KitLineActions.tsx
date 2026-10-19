import { useId, useRef, useState } from "react";
import { Settings2, Trash2 } from "lucide-react";
import { Button, ModalShell, useDialogCloseGuard } from "../../../shared/ui";
import type { DraftLine } from "./documentWorkflow";
import { usePpeDialogOperation } from "./usePpeDialogOperation";

type Props = { line: DraftLine; editable: boolean; onChange: (patch: Partial<DraftLine>) => void | boolean | Promise<void | boolean>; onRemove: () => void };
export function KitLineActions(props: Props) {
  const [open, setOpen] = useState(false);
  return <div className="ppe-kit-line-actions"><button className="ppe-document-icon" type="button" title="Исключение и ручной контроль" aria-label={`Контроль: ${props.line.itemName}`} onClick={() => setOpen(true)}><Settings2 size={18} /></button>{props.editable ? <button className="ppe-document-icon" type="button" title="Удалить позицию" aria-label={`Удалить ${props.line.itemName}`} onClick={props.onRemove}><Trash2 size={18} /></button> : null}
    {open ? <LineControlDialog key={props.line.id} {...props} onClose={() => setOpen(false)} /> : null}
  </div>;
}
function LineControlDialog({ line, editable, onChange, onClose }: Props & { onClose: () => void }) {
  const [draft, setDraft] = useState(() => ({ manualControlConfirmed: Boolean(line.manualControlConfirmed), exceptionReason: line.exceptionReason ?? "" }));
  const initial = useRef(JSON.stringify(draft)), formId = useId(), operation = usePpeDialogOperation();
  const { requestClose, discardDialog } = useDialogCloseGuard({ dirty: JSON.stringify(draft) !== initial.current, pending: operation.pending, onClose });
  function apply() {
    if (!editable) return;
    if (draft.manualControlConfirmed && !draft.exceptionReason.trim()) { operation.setError("Укажите причину исключения для ручного контроля."); return; }
    void operation.execute(() => onChange(draft), result => { if (result === false) operation.setError("Не удалось применить изменения. Ввод сохранён."); else onClose(); });
  }
  return <><ModalShell title="Исключение и ручной контроль" subtitle={line.itemName} className="ppe-kit-control-dialog" onClose={requestClose} pending={operation.pending}
    actions={<><Button disabled={operation.pending} variant="ghost" onClick={requestClose}>{editable ? "Отмена" : "Закрыть просмотр"}</Button>{editable ? <Button form={formId} disabled={operation.pending} type="submit" variant="primary">{operation.pending ? "Применение…" : "Применить к строке"}</Button> : null}</>}>
    <form id={formId} onSubmit={event => { event.preventDefault(); apply(); }}><fieldset disabled={!editable || operation.pending}>
      <label className="ppe-kit-dialog-checkbox"><input type="checkbox" checked={draft.manualControlConfirmed} onChange={event => setDraft(current => ({ ...current, manualControlConfirmed: event.target.checked }))} /> Ручной контроль</label>
      <label className="ppe-kit-control-reason">Причина исключения<textarea rows={5} maxLength={2000} value={draft.exceptionReason} onChange={event => { setDraft(current => ({ ...current, exceptionReason: event.target.value })); operation.setError(""); }} /></label>
    </fieldset></form>
    {operation.error ? <p className="field-error" role="alert">{operation.error}</p> : null}
  </ModalShell>{discardDialog}</>;
}
