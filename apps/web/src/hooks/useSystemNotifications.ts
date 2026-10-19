import { useEffect, useMemo, useRef, useState } from "react";
import type { DataSourceMode } from "../types";
import type { SystemNotificationDto } from "../api/contracts";
import { createSystemNotificationsRepository } from "../repositories/systemNotificationsRepository";

const REFRESH_INTERVAL_MS = 60_000;

export function useSystemNotifications({
  dataSourceMode,
  enabled,
  sessionKey,
  showToast,
}: {
  dataSourceMode: DataSourceMode;
  enabled: boolean;
  sessionKey: string;
  showToast: (message: string) => void;
}) {
  const repository = useMemo(() => createSystemNotificationsRepository(), []);
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;
  const owner = `${dataSourceMode}:${enabled}:${sessionKey}`;
  const [feed, setFeed] = useState<{ owner: string; items: SystemNotificationDto[]; status: "idle" | "loading" | "ready" | "error" }>({ owner, items: [], status: "idle" });

  useEffect(() => {
    if (dataSourceMode !== "api" || !enabled) {
      setFeed({ owner, items: [], status: "idle" });
      return;
    }

    let cancelled = false;
    let didReportError = false;
    let refreshInProgress = false;

    async function load({ silent = false }: { silent?: boolean } = {}) {
      if (cancelled || refreshInProgress) return;
      refreshInProgress = true;
      if (!silent) setFeed(previous => ({ owner, items: previous.owner === owner ? previous.items : [], status: "loading" }));
      try {
        const next = await repository.list(24);
        if (cancelled) return;
        setFeed({ owner, items: next, status: "ready" });
      } catch (error) {
        if (cancelled) return;
        setFeed(previous => ({ owner, items: previous.owner === owner ? previous.items : [], status: "error" }));
        if (!didReportError) {
          didReportError = true;
          showToastRef.current(error instanceof Error ? error.message : "Не удалось загрузить системные уведомления");
        }
      } finally {
        refreshInProgress = false;
      }
    }

    void load();
    const refreshVisible = () => { if (document.visibilityState === "visible") void load({ silent: true }); };
    const intervalId = window.setInterval(refreshVisible, REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", refreshVisible);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [dataSourceMode, enabled, repository, owner]);

  return feed.owner === owner ? { items: feed.items, status: feed.status } : { items: [], status: "idle" as const };
}
