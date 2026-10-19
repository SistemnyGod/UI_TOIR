import { useEffect, useRef, useState } from "react";

export function useCustodyCommand(onSuccess: () => void) {
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const mounted = useRef(true), inFlight = useRef(false), success = useRef(onSuccess);
  success.current = onSuccess;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function run(operation: () => Promise<void | boolean>) {
    if (inFlight.current) return;
    inFlight.current = true; setPending(true); setError("");
    try {
      const result = await operation();
      if (!mounted.current) return;
      if (result === false) setError("Операция не выполнена. Проверьте данные и повторите попытку.");
      else success.current();
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : "Не удалось выполнить операцию. Повторите попытку.");
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  }
  return { pending, error, setError, run };
}
