import { useCallback, useEffect, useRef, useState } from "react";

const refreshIndicatorDelayMs = 300;

/** Keeps background refreshes invisible when they complete quickly and visible only as a compact hint when they take longer. */
export function useSmoothRefreshIndicator() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showRefreshIndicator, setShowRefreshIndicator] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const beginRefresh = useCallback(() => {
    clearTimer();
    setIsRefreshing(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setShowRefreshIndicator(true);
    }, refreshIndicatorDelayMs);
  }, [clearTimer]);

  const endRefresh = useCallback(() => {
    clearTimer();
    setIsRefreshing(false);
    setShowRefreshIndicator(false);
  }, [clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  return { beginRefresh, endRefresh, isRefreshing, showRefreshIndicator };
}