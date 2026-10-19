import { useEffect, useRef, useState } from "react";
import { usePageLeaveGuard } from "../../../shared/navigation/usePageLeaveGuard";

/** A retained editor may perform several writes without closing its window. */
export function useEmuDialogSession({ dirty = false, onClose, onNotify }: {
  dirty?: boolean;
  onClose: () => void;
  onNotify: (message: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const alive = useRef(true);
  const guard = usePageLeaveGuard({ dirty, pending });
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  async function run<T>(operation: () => Promise<T>, message: string, accepted?: (saved: T) => void) {
    if (busy.current) return;
    busy.current = true; setPending(true); setError("");
    try {
      const saved = await operation();
      if (!alive.current) return;
      accepted?.(saved);
      onNotify(message);
    } catch (failure) {
      if (alive.current) setError(failure instanceof Error ? failure.message : "Не удалось сохранить изменения. Повторите попытку.");
    } finally {
      busy.current = false;
      if (alive.current) setPending(false);
    }
  }

  return {
    pending, error, run, leaveDialog: guard.leaveDialog,
    close: () => { if (!busy.current) guard.requestLeave(onClose); },
    requestLeave: (action: () => void) => { if (!busy.current) guard.requestLeave(action); },
  };
}

export type EmuDialogSession = ReturnType<typeof useEmuDialogSession>;
