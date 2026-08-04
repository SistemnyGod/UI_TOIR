import { AlertCircle, ChevronRight } from 'lucide-react';
import type {
  EmuShiftReportCategory,
  EmuShiftReportDetailDto,
  EmuShiftReportSummaryDto,
  EmuShiftType,
} from '../../../../api/emuShiftReportContracts';
import { categoryLabels, formatDuration, shiftLabels } from '../shiftReportUi';

export type ShiftReportHistoryGroupKey = { category: EmuShiftReportCategory; shift: EmuShiftType };

export const shiftReportHistoryGroups: ShiftReportHistoryGroupKey[] = [
  { category: 'mechanic', shift: 'day' },
  { category: 'mechanic', shift: 'night' },
  { category: 'electrician', shift: 'day' },
  { category: 'electrician', shift: 'night' },
];

function submittedTime(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function reportDate(value: string) {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}.${month}.${year}` : value;
}

function ShiftReportDetails({ detail, summary, error, onRetry }: { detail?: EmuShiftReportDetailDto; summary?: EmuShiftReportSummaryDto; error?: string; onRetry: () => void }) {
  if (error) {
    return (
      <div className='emu-detail-state error' role='alert'>
        <AlertCircle aria-hidden='true' size={17} />
        <span>{error}</span>
        <button type='button' className='emu-detail-retry' onClick={onRetry}>Повторить</button>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className='emu-detail-state emu-detail-loading' role='status' aria-label='Загружаем список работ'>
        <span className='emu-history-skeleton emu-history-skeleton-wide' />
        <span className='emu-history-skeleton emu-history-skeleton-short' />
        <span className='emu-history-skeleton emu-history-skeleton-wide' />
      </div>
    );
  }
  return (
    <div className='emu-history-detail'>
      <div className='emu-detail-meta'>
        <span>Отчёт составил: <strong>{detail.createdByName}</strong></span>
        <span>Работ: <strong>{detail.workCount}</strong></span>
        <span>Итого: <strong>{formatDuration(detail.totalDurationMinutes)}</strong></span>
      </div>
      <div className='emu-detail-mobile-meta' aria-label='Сводка отчёта'>
        <span><b>Дата</b>{summary?.reportDate ?? detail.reportDate}</span>
        <span><b>Смена</b>{summary ? shiftLabels[summary.shiftType] : shiftLabels[detail.shiftType]}</span>
        <span><b>Общее время</b>{formatDuration(summary?.totalDurationMinutes ?? detail.totalDurationMinutes)}</span>
        <span><b>Отправлен</b>{submittedTime(summary?.submittedAt ?? detail.submittedAt)}</span>
      </div>
      <div className='emu-history-detail-table'>
        <table>
          <thead><tr><th>№</th><th>Выполненная работа</th><th>Время</th><th>Участок</th><th>Примечание</th></tr></thead>
          <tbody>
            {detail.lines.map((line) => (
              <tr key={line.id}>
                <td data-label='№'>{line.sequenceNo}</td>
                <td data-label='Работа'>{line.workDescription}</td>
                <td data-label='Время'>{formatDuration(line.durationMinutes)}</td>
                <td data-label='Участок'>{line.sectionName || '—'}</td>
                <td data-label='Примечание'>{line.note || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ShiftReportHistoryGroup({
  group,
  rows,
  expanded,
  details,
  detailErrors,
  onToggle,
  onRetry,
  loading,
  refreshing,
}: {
  group: ShiftReportHistoryGroupKey;
  rows: EmuShiftReportSummaryDto[];
  expanded: Set<string>;
  details: Record<string, EmuShiftReportDetailDto>;
  detailErrors: Record<string, string>;
  onToggle: (item: EmuShiftReportSummaryDto) => void;
  onRetry: (item: EmuShiftReportSummaryDto) => void;
  loading: boolean;
  refreshing: boolean;
}) {
  return (
    <section className={`emu-shift-card emu-history-group ${refreshing ? 'is-refreshing' : ''}`}>
      <header>
        <div><span>{categoryLabels[group.category]}</span><h2>{shiftLabels[group.shift]} смена</h2></div>
        <b aria-label={`${rows.length} отчётов`}>{rows.length}</b>
      </header>
      {loading && rows.length === 0 ? (
        <div className='emu-history-loading' role='status' aria-label='Загружаем отчёты'>
          <span className='emu-history-skeleton emu-history-skeleton-wide' />
          <span className='emu-history-skeleton emu-history-skeleton-short' />
        </div>
      ) : rows.length === 0 ? (
        <div className='emu-history-empty'><span>Отчётов нет</span><small>В этой группе пока нет отправленных отчётов.</small></div>
      ) : (
        <div className='emu-history-row-list'>
          {rows.map((item) => {
        const isExpanded = expanded.has(item.id);
        const panelId = `shift-report-detail-${item.id}`;
        return (
          <article className='emu-history-row' key={item.id}>
            <button
              type='button'
              className='emu-history-summary'
              aria-expanded={isExpanded}
              aria-controls={panelId}
              onClick={() => onToggle(item)}
            >
              <ChevronRight className='chevron' aria-hidden='true' size={20} />
              <span className='employee'><strong>{item.employeeName}</strong><small>{item.position} · {item.department || 'Подразделение не указано'}</small></span>
              <span className='report-date'><strong>{reportDate(item.reportDate)}</strong><small>дата</small></span>
              <span><strong>{item.workCount}</strong><small>работ</small></span>
              <span><strong>{formatDuration(item.totalDurationMinutes)}</strong><small>общее время</small></span>
              <span><strong>{submittedTime(item.submittedAt)}</strong><small>отправлен</small></span>
            </button>
            <div id={panelId} className={`emu-history-detail-panel ${isExpanded ? 'is-open' : ''}`} aria-hidden={!isExpanded}>
              <div className='emu-history-detail-panel-inner'>
                {isExpanded ? <ShiftReportDetails detail={details[item.id]} summary={item} error={detailErrors[item.id]} onRetry={() => onRetry(item)} /> : null}
              </div>
            </div>
          </article>
        );
          })}
        </div>
      )}
    </section>
  );
}