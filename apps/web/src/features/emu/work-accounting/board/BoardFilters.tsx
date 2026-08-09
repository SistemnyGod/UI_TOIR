import type { EmuReferenceDto } from "../../../../api/contracts";
import { SectionTabs } from "../../../../shared/ui";
import type { WorkCardFilter, WorkDensity } from "../types";
import { workFilterLabel } from "../workAccountingUtils";

export function WorkFilterTabs({
  counts,
  onChange,
  value,
}: {
  counts: Record<WorkCardFilter, number>;
  onChange: (value: WorkCardFilter) => void;
  value: WorkCardFilter;
}) {
  const filters: WorkCardFilter[] = ["all", "working", "mixed", "paused", "attention"];

  return (
    <SectionTabs
      ariaLabel="Фильтр карточек работ"
      className="emu-work-filters"
      onChange={onChange}
      tabs={filters.map((filter) => ({ id: filter, label: workFilterLabel(filter), count: counts[filter] }))}
      value={value}
    />
  );
}

export function SectionQuickFilter({
  onChange,
  sections,
  value,
}: {
  onChange: (value: string) => void;
  sections: EmuReferenceDto[];
  value: string;
}) {
  return (
    <label className="emu-inline-select">
      <span>Участок</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Все участки</option>
        {sections.map((section) => (
          <option key={section.id} value={section.id}>{section.name}</option>
        ))}
      </select>
    </label>
  );
}

export function WorkPeriodFilter({
  from,
  onChangeFrom,
  onChangeTo,
  onClear,
  to,
}: {
  from: string;
  onChangeFrom: (value: string) => void;
  onChangeTo: (value: string) => void;
  onClear: () => void;
  to: string;
}) {
  return (
    <fieldset className="emu-work-period-filter">
      <legend>Период</legend>
      <label>
        <span>С</span>
        <input aria-label="Начало периода" type="date" value={from} onChange={(event) => onChangeFrom(event.target.value)} />
      </label>
      <label>
        <span>По</span>
        <input aria-label="Конец периода" type="date" value={to} onChange={(event) => onChangeTo(event.target.value)} />
      </label>
      {from || to ? <button aria-label="Сбросить период" className="emu-filter-clear" onClick={onClear} type="button">×</button> : null}
    </fieldset>
  );
}

export function WorkSearchFilter({ onChange, onClear, value }: { onChange: (value: string) => void; onClear: () => void; value: string }) {
  return (
    <label className="emu-work-search-filter">
      <span>Поиск</span>
      <input aria-label="Поиск по карточкам работ" type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Номер, задача, сотрудник" />
      {value ? <button aria-label="Очистить поиск" className="emu-filter-clear" onClick={onClear} type="button">×</button> : null}
    </label>
  );
}

export function DensitySwitch({ onChange, value }: { onChange: (value: WorkDensity) => void; value: WorkDensity }) {
  return (
    <SectionTabs
      ariaLabel="Плотность карточек"
      className="emu-density-switch"
      onChange={onChange}
      tabs={[{ id: "compact", label: "Компактно" }, { id: "comfortable", label: "Подробно" }]}
      value={value}
    />
  );
}
