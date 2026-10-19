import { useEffect, useRef, useState } from "react";
import { usePageLeaveGuard } from "../../../shared/navigation/usePageLeaveGuard";

/** Keeps a form open on failure and captures the version the operator opened. */
export function useWorkMutation({ onClose, onNotify, work, values, leaveMessage, leaveLabel }: {
  onClose: () => void;
  onNotify: (message: string) => void;
  work?: { id: string; rowVersion: number };
  values?: unknown;
  leaveMessage?: string;
  leaveLabel?: string;
}) {
  const fingerprint = JSON.stringify(values);
  const [initial] = useState(fingerprint);
  const [target] = useState(() => ({ id: work?.id, rowVersion: work?.rowVersion }));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const alive = useRef(true);
  const guard = usePageLeaveGuard({ dirty: fingerprint !== initial, pending, message: leaveMessage, leaveLabel });
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function run<T>(operation: () => Promise<T>, successMessage: string, afterSuccess?: (saved: T) => void) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const saved = await operation();
      if (!alive.current) return;
      afterSuccess?.(saved);
      onNotify(successMessage);
      onClose();
    } catch (error) {
      if (alive.current) setError(error instanceof Error ? error.message : "Не удалось сохранить изменения. Повторите попытку.");
    } finally {
      busy.current = false;
      if (alive.current) setPending(false);
    }
  }
  return { error, pending, leaveDialog: guard.leaveDialog, rowVersion: target.rowVersion ?? 0, workId: target.id ?? "", run, close: () => { if (!busy.current) guard.requestLeave(onClose); } };
}
