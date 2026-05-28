import { useEffect, useMemo, useState } from "react";
import type { DataSourceMode } from "../types";
import type { SystemNotificationDto } from "../api/contracts";
import { createSystemNotificationsRepository } from "../repositories/systemNotificationsRepository";

const REFRESH_INTERVAL_MS = 60_000;

export function useSystemNotifications({
  dataSourceMode,
  enabled,
  showToast,
}: {
  dataSourceMode: DataSourceMode;
  enabled: boolean;
  showToast: (message: string) => void;
}) {
  const repository = useMemo(() => createSystemNotificationsRepository(), []);
  const [items, setItems] = useState<SystemNotificationDto[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    if (dataSourceMode !== "api" || !enabled) {
      setItems([]);
      setStatus("idle");
      return;
    }

    let cancelled = false;
    let didReportError = false;

    async function load({ silent = false }: { silent?: boolean } = {}) {
      if (!silent) setStatus("loading");
      try {
        const next = await repository.list(24);
        if (cancelled) return;
        setItems(next);
        setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        setStatus("error");
        if (!didReportError) {
          didReportError = true;
          showToast(error instanceof Error ? error.message : "Не удалось загрузить системные уведомления");
        }
      }
    }

    void load();
    const intervalId = window.setInterval(() => void load({ silent: true }), REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [dataSourceMode, enabled, repository, showToast]);

  return { items, status };
}
