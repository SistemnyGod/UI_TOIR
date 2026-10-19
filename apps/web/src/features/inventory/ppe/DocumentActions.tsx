import { useState } from "react";
import { Ellipsis, Plus, Trash2, ArrowLeftRight } from "lucide-react";
import { Button, ModalShell, useDialogCloseGuard } from "../../../shared/ui";
import { DocumentConfirmation } from "./DocumentConfirmation";
import { usePpeDialogOperation } from "./usePpeDialogOperation";
import "../styles/ppe-document-dialogs.css";

type Props = { busy: boolean; draft: boolean; hasUnsavedChanges: boolean; contextKey: string; onNew: () => boolean; onCancel: () => Promise<boolean>; onMigrate: (cardId: string) => Promise<boolean> };
export function DocumentActions(props: Props) { return <DocumentActionsWorkspace key={props.contextKey} {...props} />; }
function DocumentActionsWorkspace(props: Props) {
  const [open, setOpen] = useState(false);
  return <><button className="button secondary" type="button" disabled={props.busy} aria-haspopup="dialog" onClick={() => setOpen(true)}><Ellipsis size={18} /> Действия</button>
    {open ? <ActionsDialog {...props} onClose={() => setOpen(false)} /> : null}
  </>;
}
function ActionsDialog({ busy, draft, hasUnsavedChanges, onNew, onCancel, onMigrate, onClose }: Props & { onClose: () => void }) {
  const [cardId, setCardId] = useState(""), [intent, setIntent] = useState<"new" | "cancel" | "migrate" | null>(null);
  const operation = usePpeDialogOperation(), pending = busy || operation.pending;
  const { requestClose, discardDialog } = useDialogCloseGuard({ dirty: Boolean(cardId), pending, onClose });
  const run = (action: () => boolean | Promise<boolean>) => operation.execute(action, accepted => { if (accepted) onClose(); else operation.setError("Действие не выполнено. Ввод сохранён — повторите попытку."); });
  const confirmation = intent === "cancel" ? { title: "Отменить черновик выдачи?", action: "Отменить черновик", perform: onCancel }
    : intent === "migrate" ? { title: "Перенести старый черновик?", action: "Перенести черновик", perform: () => onMigrate(cardId.trim()) }
    : { title: "Начать новую выдачу?", action: "Начать новую выдачу", perform: onNew };
  return <><ModalShell title="Действия с выдачей" subtitle="Создание, отмена и перенос черновика" className="ppe-document-actions-dialog" pending={pending} onClose={requestClose}
    actions={<Button variant="ghost" disabled={pending} onClick={requestClose}>Закрыть просмотр</Button>}>
    <div className="ppe-document-command"><Button variant="primary" disabled={pending} onClick={() => { if (hasUnsavedChanges || cardId) setIntent("new"); else void run(onNew); }}><Plus size={18} /> Новая выдача</Button><p>Создать отдельный документ. Сохранённая выдача останется в журнале.</p></div>
    {draft ? <div className="ppe-document-command"><Button variant="danger" disabled={pending} onClick={() => setIntent("cancel")}><Trash2 size={18} /> Отменить черновик</Button><p>Отменённый документ будет доступен в истории без возможности редактирования.</p></div> : null}
    <details className="ppe-document-command"><summary>Перенести старый черновик</summary><p>Для ранее созданной личной карточки СИЗ. Источник определяется по идентификатору карточки.</p><label>Идентификатор карточки<input value={cardId} disabled={pending} onChange={event => { setCardId(event.target.value); operation.setError(""); }} /></label><Button variant="ghost" disabled={pending || !cardId.trim()} onClick={() => setIntent("migrate")}><ArrowLeftRight size={18} /> Перенести черновик</Button></details>
    {operation.error ? <p className="field-error" role="alert">{operation.error}</p> : null}
  </ModalShell>{discardDialog}
    {intent ? <DocumentConfirmation key={intent} title={confirmation.title} subtitle={intent === "migrate" ? cardId.trim() : undefined} action={confirmation.action} danger={intent === "cancel" || hasUnsavedChanges} busy={pending} onClose={() => setIntent(null)} onConfirm={confirmation.perform} onSuccess={onClose}>
      <p>{intent === "cancel" ? "Черновик будет отменён. Это действие не подтверждает выдачу и не удаляет документ из истории." : intent === "migrate" ? "Откроется документ, перенесённый из указанной карточки." : "Текущий сохранённый документ останется в журнале. Начнётся отдельная выдача."}</p>
      {hasUnsavedChanges || intent === "new" && cardId ? <p>Несохранённый ввод текущей формы будет потерян. Вернитесь к редактированию, если его нужно сохранить.</p> : null}
    </DocumentConfirmation> : null}
  </>;
}
