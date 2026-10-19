import { CalendarRange, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AnchoredPopover } from './AnchoredPopover';
import { Button } from './primitives';
import { calendarDates, dateKey, dateLabel, monthStart, moveCalendarDate, parseDateKey, periodLabel } from './dateRange';
import './dateRangePicker.css';

export function DateRangePicker({ dateFrom, dateTo, onChange, title = 'Выбор периода', triggerClassName = '', monthCount = 1, autoApply = false, allowClear = false }: {
  dateFrom: string; dateTo: string; onChange: (from: string, to: string) => void;
  title?: string; triggerClassName?: string; monthCount?: 1 | 2; autoApply?: boolean; allowClear?: boolean;
}) {
  const id = useId(), trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ from: dateFrom, to: dateTo });
  const [month, setMonth] = useState(() => monthStart(parseDateKey(dateFrom) ?? new Date()));
  const [focusDate, setFocusDate] = useState(dateFrom || dateKey(new Date()));
  const [moveFocus, setMoveFocus] = useState(false);
  const initialDate = useRef(focusDate);
  const selectingEnd = Boolean(draft.from && !draft.to);
  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }); };
  const apply = (from: string, to: string) => { onChange(from, to); close(); };

  useLayoutEffect(() => {
    if (!open || !moveFocus) return;
    document.getElementById(id)?.querySelector<HTMLElement>(`[data-date="${focusDate}"]:not(:disabled)`)?.focus({ preventScroll: true });
    setMoveFocus(false);
  }, [open, moveFocus, focusDate, month, id]);

  useLayoutEffect(() => {
    if (!open) return;
    function keepVisibleFocus() {
      const surface = document.getElementById(id), active = document.activeElement;
      if (!surface || active !== document.body && !surface.contains(active)) return;
      const date = parseDateKey(focusDate);
      if (window.innerWidth <= 760 && date) setMonth(monthStart(date));
      // Hiding the second month during rotation can move browser focus to body.
      setMoveFocus(true);
    }
    window.addEventListener('resize', keepVisibleFocus);
    return () => window.removeEventListener('resize', keepVisibleFocus);
  }, [open, focusDate, id]);

  function openPicker() {
    const start = parseDateKey(dateFrom || dateTo) ?? new Date();
    const value = dateKey(start);
    setDraft({ from: dateFrom, to: dateTo }); setMonth(monthStart(start)); setFocusDate(value); initialDate.current = value; setOpen(true);
  }
  function showMonth(offset: number) {
    const next = monthStart(month, offset); setMonth(next); setFocusDate(dateKey(next));
  }
  function select(value: string) {
    setFocusDate(value);
    if (!selectingEnd) { setDraft({ from: value, to: '' }); return; }
    const range = value < draft.from ? { from: value, to: draft.from } : { from: draft.from, to: value };
    setDraft(range);
    if (autoApply) apply(range.from, range.to);
  }
  function navigate(event: KeyboardEvent<HTMLButtonElement>, value: string) {
    const next = moveCalendarDate(value, event.key, event.shiftKey);
    if (!next) return;
    event.preventDefault(); setFocusDate(next); setMoveFocus(true);
    const date = parseDateKey(next)!;
    if (date.getMonth() !== month.getMonth() || date.getFullYear() !== month.getFullYear()) setMonth(monthStart(date));
  }

  return <div className='date-range-field'>
    <button aria-controls={open ? id : undefined} aria-expanded={open} aria-haspopup='dialog' aria-label={`Период: ${periodLabel(dateFrom, dateTo)}`} className={`date-range-trigger ${triggerClassName}`} onClick={() => open ? close() : openPicker()} ref={trigger} type='button'>
      <CalendarRange aria-hidden='true' size={17} /><span>{periodLabel(dateFrom, dateTo)}</span>
    </button>
    {open ? <AnchoredPopover anchorRef={trigger} className={`date-range-surface ${monthCount === 2 ? 'date-range-surface-wide' : ''}`} id={id} initialFocusSelector={`[data-date="${initialDate.current}"]:not(:disabled)`} label={title} onClose={() => setOpen(false)}>
      <header className='date-range-surface-header'>
        <strong>{title}</strong><button aria-label='Закрыть календарь' onClick={close} type='button'><X aria-hidden='true' size={18} /></button>
      </header>
      <div className='date-range-surface-body' onFocusCapture={event => {
        const body = event.currentTarget, target = event.target;
        const bounds = body.getBoundingClientRect(), field = target.getBoundingClientRect();
        if (field.top < bounds.top + 4) body.scrollTop -= bounds.top + 4 - field.top;
        else if (field.bottom > bounds.bottom - 4) body.scrollTop += field.bottom - bounds.bottom + 4;
      }}>
        <nav aria-label='Переключение месяцев' className='date-range-month-navigation'>
          <button aria-label='Предыдущий месяц' onClick={() => showMonth(-1)} type='button'><ChevronLeft aria-hidden='true' size={18} /></button>
          <span aria-live='polite'>{month.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</span>
          <button aria-label='Следующий месяц' onClick={() => showMonth(1)} type='button'><ChevronRight aria-hidden='true' size={18} /></button>
        </nav>
        <div className='date-range-months'>
          {Array.from({ length: monthCount }, (_, index) => {
            const current = monthStart(month, index);
            const label = current.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
            return <section aria-label={label} className='date-range-month' key={dateKey(current)}>
              {monthCount === 2 ? <h3>{label}</h3> : null}
              <div aria-hidden='true' className='date-range-weekdays'>{['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => <span key={day}>{day}</span>)}</div>
              <div aria-label={`Даты: ${label}`} className='date-range-dates' role='group'>
                {calendarDates(current).map(date => {
                  const value = dateKey(date), outside = date.getMonth() !== current.getMonth();
                  const start = value === draft.from, end = value === draft.to;
                  const inRange = Boolean(draft.from && draft.to && value > draft.from && value < draft.to);
                  return <button aria-current={value === dateKey(new Date()) ? 'date' : undefined} aria-hidden={outside || undefined} aria-label={`${dateLabel(value)}${start ? ', начало периода' : ''}${end ? ', конец периода' : ''}`} aria-pressed={start || end} className={`${outside ? 'is-outside' : ''} ${start || end ? 'is-selected' : ''} ${inRange ? 'is-in-range' : ''}`} data-date={value} disabled={outside} key={value} onClick={() => select(value)} onKeyDown={event => navigate(event, value)} tabIndex={value === focusDate && !outside ? 0 : -1} type='button'>{date.getDate()}</button>;
                })}
              </div>
            </section>;
          })}
        </div>
        <p aria-live='polite' className='date-range-instruction'>{selectingEnd ? `Начало: ${dateLabel(draft.from)}. Выберите окончание периода.` : `Выбран период: ${periodLabel(draft.from, draft.to)}`}</p>
        <p className='visually-hidden'>Стрелки — выбор даты, Home и End — границы недели, Page Up и Page Down — месяцы. Enter — выбрать дату. Escape — отменить.</p>
      </div>
      <footer className='date-range-surface-actions'>
        {allowClear ? <Button onClick={() => apply('', '')} variant='ghost'>Очистить</Button> : null}
        <Button onClick={close} variant='secondary'>Отмена</Button>
        {selectingEnd ? <Button onClick={() => apply(draft.from, draft.from)} variant='primary'>Выбрать один день</Button> : !autoApply ? <Button disabled={!draft.from || !draft.to} onClick={() => apply(draft.from, draft.to)} variant='primary'>Применить</Button> : null}
      </footer>
    </AnchoredPopover> : null}
  </div>;
}
