import { useCallback, useEffect, useMemo, useState } from "react";
import type { EmuCreateShiftReportDto, EmuShiftReportDetailDto, EmuShiftReportOptionsDto, EmuShiftReportQuery, EmuShiftReportSummaryDto } from "../api/emuShiftReportContracts";
import { createEmuShiftReportsRepository } from "../repositories/emuShiftReportsRepository";

export function useEmuShiftReportsWorkspace({ historyEnabled, optionsEnabled }: { historyEnabled: boolean; optionsEnabled: boolean }) {
  const repository = useMemo(() => createEmuShiftReportsRepository(), []);
  const [options, setOptions] = useState<EmuShiftReportOptionsDto | null>(null);
  const [rows, setRows] = useState<EmuShiftReportSummaryDto[]>([]);
  const [details, setDetails] = useState<Record<string, EmuShiftReportDetailDto>>({});
  const [loading, setLoading] = useState(optionsEnabled);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { if (!optionsEnabled) { setLoading(false); return; } let active = true; setLoading(true); repository.getOptions().then((value) => { if (active) setOptions(value); }).catch((reason: Error) => { if (active) setError(reason.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [optionsEnabled, repository]);

  const loadHistory = useCallback(async (query: EmuShiftReportQuery) => {
    if (!historyEnabled) return;
    setHistoryLoading(true); setError("");
    try { const result = await repository.getList({ ...query, pageSize: 100 }); setRows(result.rows); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось загрузить историю отчётов."); }
    finally { setHistoryLoading(false); }
  }, [historyEnabled, repository]);

  const loadDetail = useCallback(async (id: string) => {
    if (details[id]) return details[id];
    const detail = await repository.getDetail(id);
    setDetails((current) => ({ ...current, [id]: detail }));
    return detail;
  }, [details, repository]);

  const create = useCallback((payload: EmuCreateShiftReportDto) => repository.create(payload), [repository]);
  return { options, rows, details, loading, historyLoading, error, create, loadHistory, loadDetail };
}
