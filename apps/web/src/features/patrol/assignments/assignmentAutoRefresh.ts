export const ASSIGNMENT_AUTO_REFRESH_INTERVAL_MS = 10_000;

export function subscribeAssignmentAutoRefresh(
  refresh: () => Promise<unknown> | unknown,
  intervalMs = ASSIGNMENT_AUTO_REFRESH_INTERVAL_MS,
) {
  let disposed = false;
  let refreshInProgress = false;

  const runRefresh = async () => {
    if (disposed || refreshInProgress) return;
    refreshInProgress = true;
    try {
      await refresh();
    } finally {
      refreshInProgress = false;
    }
  };

  const handleFocus = () => void runRefresh();
  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") void runRefresh();
  };

  const intervalId = window.setInterval(() => void runRefresh(), intervalMs);
  window.addEventListener("focus", handleFocus);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    disposed = true;
    window.clearInterval(intervalId);
    window.removeEventListener("focus", handleFocus);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}
