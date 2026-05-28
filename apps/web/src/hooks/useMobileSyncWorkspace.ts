import { useCallback, useEffect, useMemo, useState } from "react";
import { createApiMobileSyncRepository } from "../repositories/mobileSyncRepository";
import type { DataSourceMode, DataSourceStatus, MobileSyncConflict } from "../types";

export interface MobileSyncWorkspace {
  conflicts: MobileSyncConflict[];
  errorMessage?: string;
  refreshConflicts: () => Promise<void>;
  resolveConflict: (clientOperationId: string, status: "accepted" | "rejected" | "repeatRequested", comment?: string) => Promise<void>;
  status: DataSourceStatus;
}

export function useMobileSyncWorkspace({
  dataSourceMode,
  showToast,
}: {
  dataSourceMode: DataSourceMode;
  showToast?: (message: string) => void;
}): MobileSyncWorkspace {
  const repository = useMemo(() => createApiMobileSyncRepository(), []);
  const [conflicts, setConflicts] = useState<MobileSyncConflict[]>([]);
  const [status, setStatus] = useState<DataSourceStatus>(dataSourceMode === "api" ? "loading" : "idle");
  const [errorMessage, setErrorMessage] = useState<string>();

  const refreshConflicts = useCallback(async () => {
    if (dataSourceMode !== "api") {
      setConflicts([]);
      setStatus("idle");
      setErrorMessage(undefined);
      return;
    }

    setStatus("loading");
    setErrorMessage(undefined);
    try {
      const rows = await repository.getConflicts();
      setConflicts(rows);
      setStatus("ready");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось загрузить конфликты мобильной синхронизации";
      setErrorMessage(message);
      setStatus("error");
      showToast?.(message);
    }
  }, [dataSourceMode, repository, showToast]);

  const resolveConflict = useCallback<MobileSyncWorkspace["resolveConflict"]>(
    async (clientOperationId, resolutionStatus, comment) => {
      await repository.resolveConflict(clientOperationId, { status: resolutionStatus, comment: comment ?? null });
      await refreshConflicts();
    },
    [refreshConflicts, repository],
  );

  useEffect(() => {
    void refreshConflicts();
  }, [refreshConflicts]);

  return {
    conflicts,
    errorMessage,
    refreshConflicts,
    resolveConflict,
    status,
  };
}
