export function parseDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) || dateKey(date) !== value ? null : date;
}
export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function monthStart(date: Date, offset = 0) { return new Date(date.getFullYear(), date.getMonth() + offset, 1); }
export function dateLabel(value: string) { return parseDateKey(value)?.toLocaleDateString('ru-RU') ?? value; }
export function periodLabel(from: string, to: string) {
  if (from && to) return from === to ? dateLabel(from) : `${dateLabel(from)} — ${dateLabel(to)}`;
  return from ? `с ${dateLabel(from)}` : to ? `по ${dateLabel(to)}` : 'Все даты';
}
export function calendarDates(month: Date) {
  const first = monthStart(month), offset = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => new Date(first.getFullYear(), first.getMonth(), index - offset + 1));
}
export function moveCalendarDate(value: string, key: string, shift: boolean) {
  const date = parseDateKey(value);
  if (!date) return null;
  const step = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[key];
  if (step !== undefined) date.setDate(date.getDate() + step);
  else if (key === 'Home' || key === 'End') date.setDate(date.getDate() - (date.getDay() + 6) % 7 + (key === 'End' ? 6 : 0));
  else if (key === 'PageUp' || key === 'PageDown') {
    const next = monthStart(date, (key === 'PageUp' ? -1 : 1) * (shift ? 12 : 1));
    next.setDate(Math.min(date.getDate(), new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
    return dateKey(next);
  } else return null;
  return dateKey(date);
}
