import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function parseDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function toDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(value: string) {
  const [year, month, day] = value.split('-');
  return `${day}.${month}.${year}`;
}

function monthStart(date: Date, offset = 0) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

function monthDays(month: Date) {
  const first = monthStart(month);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
}

function CalendarMonth({
  month,
  rangeStart,
  rangeEnd,
  selectingEnd,
  onSelect,
}: {
  month: Date;
  rangeStart: string;
  rangeEnd: string;
  selectingEnd: boolean;
  onSelect: (value: string) => void;
}) {
  const days = useMemo(() => monthDays(month), [month]);
  const today = toDateValue(new Date());
  return (
    <section className='emu-date-range-month' aria-label={`${MONTHS[month.getMonth()]} ${month.getFullYear()}`}>
      <h3>{MONTHS[month.getMonth()]} <span>{month.getFullYear()}</span></h3>
      <div className='emu-date-range-weekdays' aria-hidden='true'>
        {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className='emu-date-range-days' role='grid'>
        {days.map((date) => {
          const value = toDateValue(date);
          const outside = date.getMonth() !== month.getMonth();
          const isStart = value === rangeStart;
          const isEnd = value === rangeEnd;
          const inRange = Boolean(rangeStart && rangeEnd && value >= rangeStart && value <= rangeEnd);
          return (
            <button
              key={value}
              type='button'
              role='gridcell'
              className={[
                outside ? 'is-outside' : '',
                inRange ? 'is-in-range' : '',
                isStart ? 'is-range-start' : '',
                isEnd ? 'is-range-end' : '',
                value === today ? 'is-today' : '',
              ].filter(Boolean).join(' ')}
              aria-label={`${formatDate(value)}${isStart ? ', начало периода' : ''}${isEnd ? ', конец периода' : ''}`}
              aria-pressed={isStart || isEnd}
              disabled={outside}
              aria-hidden={outside}
              onClick={() => onSelect(value)}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
      {selectingEnd ? <span className='sr-only'>Выберите дату окончания периода</span> : null}
    </section>
  );
}

export function ShiftReportDateRangePicker({
  dateFrom,
  dateTo,
  onChange,
}: {
  dateFrom: string;
  dateTo: string;
  onChange: (dateFrom: string, dateTo: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => monthStart(parseDate(dateFrom)));
  const [draftStart, setDraftStart] = useState(dateFrom);
  const [draftEnd, setDraftEnd] = useState(dateTo);
  const [selectingEnd, setSelectingEnd] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  function openPicker() {
    setDraftStart(dateFrom);
    setDraftEnd(dateTo);
    setSelectingEnd(false);
    setVisibleMonth(monthStart(parseDate(dateFrom)));
    setOpen(true);
  }

  function selectDate(value: string) {
    if (!selectingEnd) {
      setDraftStart(value);
      setDraftEnd(value);
      setSelectingEnd(true);
      return;
    }
    const from = value < draftStart ? value : draftStart;
    const to = value < draftStart ? draftStart : value;
    setDraftStart(from);
    setDraftEnd(to);
    onChange(from, to);
    setSelectingEnd(false);
    setOpen(false);
  }

  function selectOneDay() {
    onChange(draftStart, draftStart);
    setDraftEnd(draftStart);
    setSelectingEnd(false);
    setOpen(false);
  }

  const label = dateFrom === dateTo
    ? formatDate(dateFrom)
    : `${formatDate(dateFrom)} — ${formatDate(dateTo)}`;

  return (
    <div className='emu-date-range-picker' ref={rootRef}>
      <button
        type='button'
        className='emu-date-range-trigger'
        aria-haspopup='dialog'
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPicker())}
      >
        <CalendarRange aria-hidden='true' size={16} />
        <span><small>Период</small><strong>{label}</strong></span>
      </button>
      {open ? (
        <div className='emu-date-range-popover' role='dialog' aria-label='Выбор периода отчётов'>
          <header>
            <div>
              <strong>{selectingEnd ? 'Выберите окончание периода' : 'Выберите начало периода'}</strong>
              <span>{selectingEnd ? `Начало: ${formatDate(draftStart)}` : 'Можно выбрать один день или диапазон'}</span>
            </div>
            <nav aria-label='Переключение месяцев'>
              <button type='button' aria-label='Предыдущий месяц' onClick={() => setVisibleMonth((current) => monthStart(current, -1))}><ChevronLeft aria-hidden='true' size={17} /></button>
              <button type='button' aria-label='Следующий месяц' onClick={() => setVisibleMonth((current) => monthStart(current, 1))}><ChevronRight aria-hidden='true' size={17} /></button>
            </nav>
          </header>
          <div className='emu-date-range-calendars'>
            <CalendarMonth month={visibleMonth} rangeStart={draftStart} rangeEnd={draftEnd} selectingEnd={selectingEnd} onSelect={selectDate} />
            <CalendarMonth month={monthStart(visibleMonth, 1)} rangeStart={draftStart} rangeEnd={draftEnd} selectingEnd={selectingEnd} onSelect={selectDate} />
          </div>
          <footer>
            <span>{selectingEnd ? 'Теперь выберите дату «по» или подтвердите один день.' : `Выбран период: ${label}`}</span>
            <div>
              <button type='button' className='button secondary' onClick={() => setOpen(false)}>Отмена</button>
              {selectingEnd ? <button type='button' className='button primary' onClick={selectOneDay}>Выбрать один день</button> : null}
            </div>
          </footer>
        </div>
      ) : null}
    </div>
  );
}