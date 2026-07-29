import { AlertCircle, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import type {
  EmuShiftReportCategory,
  EmuShiftReportSummaryDto,
  EmuShiftType,
} from '../../../../api/emuShiftReportContracts';
import type { useEmuShiftReportsWorkspace } from '../../../../hooks/useEmuShiftReportsWorkspace';
import { categoryLabels, localDate } from '../shiftReportUi';
import { ShiftReportHistoryFilters } from './ShiftReportHistoryFilters';
import { shiftReportHistoryGroups, ShiftReportHistoryGroup } from './ShiftReportHistoryGroup';

type Workspace = ReturnType<typeof useEmuShiftReportsWorkspace>;

export function ShiftReportHistoryScreen({ workspace }: { workspace: Workspace }) {
  const [date, setDate] = useState(localDate());
  const [shiftType, setShiftType] = useState<EmuShiftType | ''>('');
  const [category, setCategory] = useState<EmuShiftReportCategory | ''>('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});

  async function refresh() {
    await workspace.loadHistory({ date, shiftType, workerCategory: category, search: search.trim() });
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 250);
    return () => window.clearTimeout(timer);
    // Each filter intentionally starts the same debounced request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, date, search, shiftType, workspace.loadHistory]);

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

  return (
    <main className='emu-shift-report-page'>
      <header className='emu-shift-header'>
        <div>
          <span>ЭМУ · сменный журнал</span>
          <h1>История сменных отчётов</h1>
          <p>Дневные и ночные отчёты слесарей и электриков за выбранную дату.</p>
        </div>
        <button type='button' className='emu-refresh-button' disabled={workspace.historyLoading} onClick={() => void refresh()}>
          <RefreshCw aria-hidden='true' size={17} />Обновить
        </button>
      </header>

      <ShiftReportHistoryFilters
        date={date}
        shiftType={shiftType}
        category={category}
        search={search}
        onDateChange={setDate}
        onShiftChange={setShiftType}
        onCategoryChange={setCategory}
        onSearchChange={setSearch}
      />

      <div className='emu-history-status' aria-live='polite'>
        {workspace.historyLoading ? <span><RefreshCw className='spin' aria-hidden='true' size={16} />Обновляем историю…</span> : null}
        {workspace.error ? <p className='emu-form-error'><AlertCircle aria-hidden='true' size={17} />{workspace.error}<button type='button' onClick={() => void refresh()}>Повторить</button></p> : null}
      </div>

      <div className='emu-history-grid'>
        {visibleGroups.map((group) => (
          <ShiftReportHistoryGroup
            key={`${group.category}-${group.shift}`}
            group={group}
            rows={workspace.rows.filter((item) => item.workerCategory === group.category && item.shiftType === group.shift)}
            expanded={expanded}
            details={workspace.details}
            detailErrors={detailErrors}
            onToggle={(item) => void toggle(item)}
            onRetry={(item) => void loadItemDetail(item)}
          />
        ))}
      </div>
    </main>
  );
}
