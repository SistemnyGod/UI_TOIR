import { JournalPeriodPicker } from "../JournalPeriodPicker";
import { emptyJournalFilters, type JournalFilters as Filters } from "./usePpeIssueJournal";

export function JournalFilters({ filters, departments, onChange }: {
  filters: Filters; departments: string[]; onChange: (patch: Partial<Filters>) => void;
}) {
  return <div className="ppe-ref-fields ppe-journal-filters">
    <label>Сотрудник<input type="search" placeholder="ФИО или табельный номер" value={filters.query} onChange={event => onChange({ query: event.target.value, employeeId: "" })} />
    </label>
    <label>Подразделение<select value={filters.department} onChange={event => onChange({ department: event.target.value })}>
      <option value="">Все подразделения</option>{departments.map(value => <option key={value}>{value}</option>)}
    </select>
    </label>
    <JournalPeriodPicker from={filters.from} to={filters.to} onChange={(from, to) => onChange({ from, to })} />
    <label>Статус документа<select value={filters.status} onChange={event => onChange({ status: event.target.value })}>
      <option value="">Все статусы</option>
      <option value="confirmed">Выдано</option>
      <option value="draft">Выдаётся</option>
      <option value="overdue">Есть просрочка</option>
      <option value="cancelled">Отменено</option>
    </select>
    </label>
    <button className="button ghost" onClick={() => onChange({ ...emptyJournalFilters })} type="button">Сбросить фильтры</button>
  </div>;
}
