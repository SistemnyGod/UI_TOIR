import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  EmuCreateShiftReportDto,
  EmuReleaseShiftReportDraftDto,
  EmuSaveShiftReportDraftDto,
  EmuShiftReportDetailDto,
  EmuSetShiftReportEmployeeCategoryDto,
  EmuShiftReportOptionsDto,
  EmuShiftReportQuery,
  EmuShiftReportSummaryDto,
} from '../api/emuShiftReportContracts';
import { ApiError } from '../api/client';
import type { EmuAddFavoriteEmployeeDto, EmuFavoriteEmployeeDto } from '../api/contracts';
import { createEmuShiftReportsRepository } from '../repositories/emuShiftReportsRepository';

export function useEmuShiftReportsWorkspace({ historyEnabled, optionsEnabled }: { historyEnabled: boolean; optionsEnabled: boolean }) {
  const repository = useMemo(() => createEmuShiftReportsRepository(), []);
  const [options, setOptions] = useState<EmuShiftReportOptionsDto | null>(null);
  const [rows, setRows] = useState<EmuShiftReportSummaryDto[]>([]);
  const [details, setDetails] = useState<Record<string, EmuShiftReportDetailDto>>({});
  const [favoriteEmployees, setFavoriteEmployees] = useState<EmuFavoriteEmployeeDto[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(optionsEnabled);
  const [favoritesError, setFavoritesError] = useState('');
  const [loading, setLoading] = useState(optionsEnabled);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyInitialized, setHistoryInitialized] = useState(false);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageCount, setHistoryPageCount] = useState(1);
  const [error, setError] = useState('');
  const mountedRef = useRef(true);
  const detailRequestsRef = useRef<Record<string, Promise<EmuShiftReportDetailDto>>>({});
  const historyAbortRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    mountedRef.current = false;
    historyAbortRef.current?.abort();
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

  const loadFavorites = useCallback(async () => {
    if (!optionsEnabled || typeof repository.getFavoriteEmployees !== 'function') return;
    setFavoritesLoading(true);
    setFavoritesError('');
    try {
      const value = await repository.getFavoriteEmployees();
      if (mountedRef.current) setFavoriteEmployees(value.filter((item) => item.isActive));
    } catch (reason) {
      if (mountedRef.current) {
        setFavoritesError(reason instanceof Error ? reason.message : 'Не удалось загрузить избранных сотрудников.');
      }
    } finally {
      if (mountedRef.current) setFavoritesLoading(false);
    }
  }, [optionsEnabled, repository]);

  useEffect(() => {
    if (!optionsEnabled) {
      setFavoritesLoading(false);
      return;
    }
    void loadFavorites();
  }, [loadFavorites, optionsEnabled]);
  const loadHistory = useCallback(async (query: EmuShiftReportQuery) => {
    if (!historyEnabled) return;

    historyAbortRef.current?.abort();
    const controller = new AbortController();
    historyAbortRef.current = controller;
    if (mountedRef.current) {
      setHistoryLoading(true);
      setError('');
    }

    try {
      const result = await repository.getList({ ...query, pageSize: 24 }, { signal: controller.signal });
      if (mountedRef.current && historyAbortRef.current === controller) {
        setRows(result.rows);
        setHistoryTotal(result.total);
        setHistoryPage(result.page);
        setHistoryPageCount(result.pageCount);
        setHistoryInitialized(true);
      }
    } catch (reason) {
      if (reason instanceof ApiError && reason.kind === 'abort') return;
      if (mountedRef.current && historyAbortRef.current === controller) {
        setError(reason instanceof Error ? reason.message : 'Не удалось загрузить историю отчётов.');
        setHistoryInitialized(true);
      }
    } finally {
      if (mountedRef.current && historyAbortRef.current === controller) {
        historyAbortRef.current = null;
        setHistoryLoading(false);
      }
    }
  }, [historyEnabled, repository]);
  const cancelHistory = useCallback(() => {
    historyAbortRef.current?.abort();
    historyAbortRef.current = null;
    if (mountedRef.current) setHistoryLoading(false);
  }, []);
  const loadDetail = useCallback(async (id: string) => {
    if (details[id]) return details[id];
    const pending = detailRequestsRef.current[id];
    if (pending) return pending;
    const request = repository.getDetail(id).then((detail) => {
      if (mountedRef.current) {
        setDetails((current) => {
          const next = { ...current, [id]: detail };
          const keys = Object.keys(next);
          if (keys.length <= 100) return next;
          const trimmed = { ...next };
          keys.slice(0, keys.length - 100).forEach((key) => delete trimmed[key]);
          return trimmed;
        });
      }
      return detail;
    }).finally(() => {
      delete detailRequestsRef.current[id];
    });
    detailRequestsRef.current[id] = request;
    return request;
  }, [details, repository]);

  const addFavoriteEmployee = useCallback(async (payload: EmuAddFavoriteEmployeeDto) => {
    const result = await repository.addFavoriteEmployee(payload);
    if (mountedRef.current) {
      setFavoriteEmployees((current) => current.some((item) => item.employeeId === result.employeeId)
        ? current.map((item) => item.employeeId === result.employeeId ? result : item)
        : [...current, result]);
    }
    return result;
  }, [repository]);

  const removeFavoriteEmployee = useCallback(async (employeeId: string) => {
    const result = await repository.removeFavoriteEmployee(employeeId);
    if (mountedRef.current) setFavoriteEmployees((current) => current.filter((item) => item.employeeId !== employeeId));
    return result;
  }, [repository]);

  const setEmployeeCategory = useCallback(async (employeeId: string, payload: EmuSetShiftReportEmployeeCategoryDto) => {
    const result = await repository.setEmployeeCategory(employeeId, payload);
    if (mountedRef.current) {
      setOptions((current) => current ? {
        ...current,
        employees: current.employees.map((employee) => employee.id === result.id ? result : employee),
      } : current);
    }
    return result;
  }, [repository]);
  const saveDraft = useCallback((payload: EmuSaveShiftReportDraftDto) => repository.saveDraft(payload), [repository]);
  const releaseDraft = useCallback((payload: EmuReleaseShiftReportDraftDto) => repository.releaseDraft(payload), [repository]);
  const create = useCallback((payload: EmuCreateShiftReportDto) => repository.create(payload), [repository]);
  return { options, rows, details, favoriteEmployees, favoritesLoading, favoritesError, loading, historyLoading, historyInitialized, historyTotal, historyPage, historyPageCount, error, create, saveDraft, releaseDraft, loadOptions, loadFavorites, addFavoriteEmployee, removeFavoriteEmployee, setEmployeeCategory, loadHistory, cancelHistory, loadDetail };
}
