import { DateRangePicker } from '../../../../shared/ui';

export function ShiftReportDateRangePicker(props: { dateFrom: string; dateTo: string; onChange: (from: string, to: string) => void }) {
  return <DateRangePicker {...props} autoApply monthCount={2} title='Выбор периода отчётов' triggerClassName='emu-date-range-trigger' />;
}
