import type { ReactNode } from "react";
import { Button, ModalShell } from "../../../shared/ui";
import { usePpeDialogOperation } from "./usePpeDialogOperation";
import "../styles/ppe-document-dialogs.css";

export function DocumentConfirmation({ title, subtitle, children, action, danger = false, busy = false, onConfirm, onClose, onSuccess, closeOnSuccess = true }: {
  title: string; subtitle?: string; children: ReactNode; action: string; danger?: boolean; busy?: boolean;
  onConfirm: () => boolean | void | Promise<boolean | void>; onClose: () => void; onSuccess?: () => void; closeOnSuccess?: boolean;
}) {
  const operation = usePpeDialogOperation(), pending = busy || operation.pending;
  return <ModalShell title={title} subtitle={subtitle} className="ppe-document-confirm-dialog" pending={pending} onClose={onClose}
    actions={<><Button variant="ghost" disabled={pending} onClick={onClose}>Вернуться</Button><Button variant={danger ? "danger" : "primary"} disabled={pending} onClick={() => { void operation.execute(onConfirm, accepted => { if (accepted === false) operation.setError("Действие не выполнено. Проверьте данные и повторите попытку."); else { onSuccess?.(); if (closeOnSuccess) onClose(); } }); }}>{pending ? "Выполняем…" : action}</Button></>}>
    {children}
    {operation.error ? <p className="field-error" role="alert">{operation.error}</p> : null}
  </ModalShell>;
}
