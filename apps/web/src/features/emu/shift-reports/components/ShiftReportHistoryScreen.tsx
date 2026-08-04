import { AlertCircle, CalendarRange, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  EmuShiftReportCategory,
  EmuShiftReportSummaryDto,
  EmuShiftType,
} from '../../../../api/emuShiftReportContracts';
import type { useEmuShiftReportsWorkspace } from '../../../../hooks/useEmuShiftReportsWorkspace';
import { localDate } from '../shiftReportUi';
import { ShiftReportHistoryFilters } from './ShiftReportHistoryFilters';
import { shiftReportHistoryGroups, ShiftReportHistoryGroup } from './ShiftReportHistoryGroup';

type Workspace = ReturnType<typeof useEmuShiftReportsWorkspace>;

function startOfPeriod(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - Math.max(0, days - 1));
  return localDate(date);
}

function displayDate(value: string) {
  if (!value) return '—';
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}.${month}.${year}` : value;
}

export function ShiftReportHistoryScreen({ workspace }: { workspace: Workspace }) {
  const today = localDate();
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [shiftType, setShiftType] = useState<EmuShiftType | ''>('');
  const [category, setCategory] = useState<EmuShiftReportCategory | ''>('');
  const [search, setSearch] = useState('');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});

  const normalizedSearch = search.trim();
  const canSearch = normalizedSearch.length !== 1;
  const refresh = useCallback(async () => {
    if (!canSearch) return;
    await workspace.loadHistory({ dateFrom, dateTo, shiftType, workerCategory: category, search: normalizedSearch, favoriteOnly, page });
  }, [canSearch, category, dateFrom, dateTo, favoriteOnly, normalizedSearch, page, shiftType, workspace.loadHistory]);

  useEffect(() => {
    workspace.cancelHistory();
    if (!canSearch) return undefined;
    const timer = window.setTimeout(() => void refresh(), 400);
    return () => {
      window.clearTimeout(timer);
      workspace.cancelHistory();
    };
  }, [canSearch, refresh, workspace.cancelHistory]);

  async function loadItemDetail(item: EmuShiftReportSummaryDto) {
    setDetailErrors((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    try {
      await workspace.loadDetail(item.id);
    } catch (reason) {
      setDetailErrors((current) => ({
        ...current,
        [item.id]: reason instanceof Error ? reason.message : 'Не удалось загрузить отчёт.',
      }));
    }
  }

  async function toggle(item: EmuShiftReportSummaryDto) {
    if (expanded.has(item.id)) {
      setExpanded((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
      return;
    }
    setExpanded((current) => new Set(current).add(item.id));
    await loadItemDetail(item);
  }

  const visibleGroups = shiftReportHistoryGroups.filter((group) => (
    (!category || group.category === category) && (!shiftType || group.shift === shiftType)
  ));
  const groupedRows = useMemo(() => {
    const result = new Map<string, EmuShiftReportSummaryDto[]>();
    for (const item of workspace.rows) {
      const key = `${item.workerCategory}-${item.shiftType}`;
      const rows = result.get(key);
      if (rows) rows.push(item);
      else result.set(key, [item]);
    }
    return result;
  }, [workspace.rows]);

  const initialHistoryLoading = !workspace.historyInitialized;
  const refreshing = workspace.historyLoading && workspace.historyInitialized;
  const periodLabel = dateFrom === dateTo ? displayDate(dateFrom) : `${displayDate(dateFrom)} — ${displayDate(dateTo)}`;

  function beforeFilterChange() {
    workspace.cancelHistory();
    setPage(1);
  }

  function changeDateRange(from: string, to: string) {
    beforeFilterChange();
    setDateFrom(from);
    setDateTo(to);
  }

  function choosePreset(days: 1 | 7 | 30) {
    beforeFilterChange();
    setDateFrom(startOfPeriod(days));
    setDateTo(localDate());
  }

  function resetAdditionalFilters() {
    beforeFilterChange();
    setShiftType('');
    setCategory('');
    setSearch('');
    setFavoriteOnly(false);
  }

  return (
    <main className='emu-shift-report-page emu-history-page'>
      <header className='emu-shift-header emu-history-header'>
        <div>
          <h1>История сменных отчётов</h1>
          <p>Дневные и ночные отчёты слесарей и электриков за выбранный период.</p>
          <div className='emu-history-period-summary'><CalendarRange aria-hidden='true' size={15} /><span>{periodLabel}</span><b>{workspace.historyInitialized ? `${workspace.historyTotal} отч.` : 'Загрузка…'}</b></div>
        </div>
        <button type='button' className='emu-refresh-button' disabled={workspace.historyLoading} onClick={() => void refresh()}>
          <RefreshCw className={workspace.historyLoading ? 'spin' : ''} aria-hidden='true' size={17} />{workspace.historyLoading ? 'Обновляем…' : 'Обновить'}
        </button>
      </header>

      <ShiftReportHistoryFilters
        dateFrom={dateFrom}
        dateTo={dateTo}
        shiftType={shiftType}
        category={category}
        search={search}
        onDateRangeChange={changeDateRange}
        onPresetChange={choosePreset}
        onShiftChange={(value) => { beforeFilterChange(); setShiftType(value); }}
        onCategoryChange={(value) => { beforeFilterChange(); setCategory(value); }}
        onSearchChange={(value) => { beforeFilterChange(); setSearch(value); }}
        favoriteOnly={favoriteOnly}
        onFavoriteOnlyChange={(value) => { beforeFilterChange(); setFavoriteOnly(value); }}
        onReset={resetAdditionalFilters}
      />

      <div className={`emu-history-status ${refreshing ? 'is-refreshing' : ''}`} aria-live='polite'>
        {refreshing ? <span><RefreshCw className='spin' aria-hidden='true' size={15} />Получаем свежие данные — показанные отчёты остаются доступными</span> : null}
        {workspace.error ? <p className='emu-form-error'><AlertCircle aria-hidden='true' size={17} />{workspace.error}<button type='button' onClick={() => void refresh()}>Повторить</button></p> : null}
      </div>

      <div className={`emu-history-grid ${refreshing ? 'is-refreshing' : ''} ${visibleGroups.length === 1 ? 'is-single' : ''}`} aria-busy={workspace.historyLoading || initialHistoryLoading}>
        {visibleGroups.map((group) => (
          <ShiftReportHistoryGroup
            key={`${group.category}-${group.shift}`}
            group={group}
            rows={groupedRows.get(`${group.category}-${group.shift}`) ?? []}
            loading={initialHistoryLoading}
            refreshing={refreshing}
            expanded={expanded}
            details={workspace.details}
            detailErrors={detailErrors}
            onToggle={(item) => void toggle(item)}
            onRetry={(item) => void loadItemDetail(item)}
          />
        ))}
      </div>

      {workspace.historyPageCount > 1 ? (
        <nav className='emu-history-pagination' aria-label='Страницы истории'>
          <button type='button' disabled={workspace.historyLoading || workspace.historyPage <= 1} onClick={() => { workspace.cancelHistory(); setPage((current) => Math.max(1, current - 1)); }}><ChevronLeft aria-hidden='true' size={16} />Назад</button>
          <span>Страница <b>{workspace.historyPage}</b> из {workspace.historyPageCount} · показано {workspace.rows.length} из {workspace.historyTotal}</span>
          <button type='button' disabled={workspace.historyLoading || workspace.historyPage >= workspace.historyPageCount} onClick={() => { workspace.cancelHistory(); setPage((current) => Math.min(workspace.historyPageCount, current + 1)); }}>Далее<ChevronRight aria-hidden='true' size={16} /></button>
        </nav>
      ) : null}
    </main>
  );
}