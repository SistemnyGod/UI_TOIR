import { useCallback, useEffect, useRef, useState } from "react";

export function useToast(timeoutMs = 2400) {
  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const showToast = useCallback(
    (message: string) => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }

      setToast(message);
      timerRef.current = window.setTimeout(() => {
        setToast(null);
        timerRef.current = null;
      }, timeoutMs);
    },
    [timeoutMs],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  return { toast, showToast };
}
