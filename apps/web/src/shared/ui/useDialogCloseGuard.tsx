import { useRef, useState } from "react";
import { Button } from "./primitives";
import { ModalShell } from "./ModalShell";

/** All dismissal paths share the same pending and unsaved-change policy. */
export function useDialogCloseGuard({ dirty, pending, onClose, message = "Изменения ещё не сохранены. При закрытии они будут потеряны." }: { dirty: boolean | (() => boolean); pending: boolean; onClose: () => void; message?: string }) {
  const [confirming, setConfirming] = useState(false);
  const current = useRef({ dirty, pending, onClose });
  current.current = { dirty, pending, onClose };
  const requestClose = () => {
    if (current.current.pending) return;
    if (typeof current.current.dirty === "function" ? current.current.dirty() : current.current.dirty) setConfirming(true);
    else current.current.onClose();
  };
  const discardDialog = confirming ? (
    <ModalShell
      className="confirm-window"
      title="Несохранённые изменения"
      onClose={() => setConfirming(false)}
      actions={<>
        <Button onClick={() => setConfirming(false)} variant="ghost">Продолжить редактирование</Button>
        <Button onClick={() => { if (!current.current.pending) { setConfirming(false); current.current.onClose(); } }} variant="danger" disabled={pending}>Закрыть без сохранения</Button>
      </>}
    >
      <p>{message}</p>
    </ModalShell>
  ) : null;
  return { requestClose, discardDialog };
}
