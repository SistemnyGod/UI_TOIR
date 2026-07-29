import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  EmuCreateShiftReportDto,
  EmuShiftReportDetailDto,
  EmuShiftReportOptionsDto,
  EmuShiftReportQuery,
  EmuShiftReportSummaryDto,
} from '../api/emuShiftReportContracts';
import { createEmuShiftReportsRepository } from '../repositories/emuShiftReportsRepository';

export function useEmuShiftReportsWorkspace({ historyEnabled, optionsEnabled }: { historyEnabled: boolean; optionsEnabled: boolean }) {
  const repository = useMemo(() => createEmuShiftReportsRepository(), []);
  const [options, setOptions] = useState<EmuShiftReportOptionsDto | null>(null);
  const [rows, setRows] = useState<EmuShiftReportSummaryDto[]>([]);
  const [details, setDetails] = useState<Record<string, EmuShiftReportDetailDto>>({});
  const [loading, setLoading] = useState(optionsEnabled);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');
  const mountedRef = useRef(true);
  const detailRequestsRef = useRef<Record<string, Promise<EmuShiftReportDetailDto>>>({});

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const loadOptions = useCallback(async () => {
    if (!optionsEnabled) return null;
    if (mountedRef.current) {
      setLoading(true);
      setError('');
    }
    try {
      const value = await repository.getOptions();
      if (mountedRef.current) setOptions(value);
      return value;
    } catch (reason) {
      if (mountedRef.current) {
        setError(reason instanceof Error ? reason.message : 'Не удалось загрузить параметры сменного отчёта.');
      }
      throw reason;
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [optionsEnabled, repository]);

  useEffect(() => {
    if (!optionsEnabled) {
      setLoading(false);
      return;
    }
    void loadOptions().catch(() => undefined);
  }, [loadOptions, optionsEnabled]);

  const loadHistory = useCallback(async (query: EmuShiftReportQuery) => {
    if (!historyEnabled) return;
    setHistoryLoading(true);
    setError('');
    try {
      const result = await repository.getList({ ...query, pageSize: 100 });
      if (mountedRef.current) setRows(result.rows);
    } catch (reason) {
      if (mountedRef.current) {
        setError(reason instanceof Error ? reason.message : 'Не удалось загрузить историю отчётов.');
      }
    } finally {
      if (mountedRef.current) setHistoryLoading(false);
    }
  }, [historyEnabled, repository]);

  const loadDetail = useCallback(async (id: string) => {
    if (details[id]) return details[id];
    const pending = detailRequestsRef.current[id];
    if (pending) return pending;
    const request = repository.getDetail(id).then((detail) => {
      if (mountedRef.current) setDetails((current) => ({ ...current, [id]: detail }));
      return detail;
    }).finally(() => {
      delete detailRequestsRef.current[id];
    });
    detailRequestsRef.current[id] = request;
    return request;
  }, [details, repository]);

  const create = useCallback((payload: EmuCreateShiftReportDto) => repository.create(payload), [repository]);
  return { options, rows, details, loading, historyLoading, error, create, loadOptions, loadHistory, loadDetail };
}
