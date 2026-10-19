import { useEffect, useRef, useState } from "react";

/** The editor owns pending/error; its workspace owns successful writes. */
export function useDialogAction(busy = false) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true), inFlight = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function run(operation: () => Promise<void | boolean>) {
    if (busy || inFlight.current) return;
    inFlight.current = true; setSaving(true); setError("");
    try {
      const result = await operation();
      if (mounted.current && result === false) setError("Не удалось выполнить действие. Данные сохранены в форме — повторите попытку.");
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : "Не удалось выполнить действие. Повторите попытку.");
    } finally {
      inFlight.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  return { pending: busy || saving, error, run, clearError: () => setError("") };
}
