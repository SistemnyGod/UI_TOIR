import { useEffect, useRef, useState } from "react";
import { ppeErrorMessage } from "./ppeErrors";

/** The caller performs the request; UI changes are applied only to this mounted workspace. */
export function usePpeDialogOperation() {
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const inFlight = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function execute<T>(request: () => Promise<T> | T, apply: (value: T) => void) {
    if (inFlight.current) return false;
    inFlight.current = true; setPending(true); setError("");
    try {
      const value = await request();
      if (!mounted.current) return false;
      apply(value); return true;
    } catch (failure) {
      if (mounted.current) setError(ppeErrorMessage(failure, "Не удалось выполнить действие. Повторите попытку."));
      return false;
    } finally { inFlight.current = false; if (mounted.current) setPending(false); }
  }
  return { pending, error, setError, execute };
}
