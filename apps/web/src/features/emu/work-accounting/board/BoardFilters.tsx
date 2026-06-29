import type { EmuReferenceDto } from "../../../../api/contracts";
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
    <div className="emu-work-filters" role="tablist" aria-label="Фильтр карточек работ">
      {filters.map((filter) => (
        <button
          className={filter === value ? "active" : ""}
          key={filter}
          onClick={() => onChange(filter)}
          type="button"
        >
          {workFilterLabel(filter)} <span>{counts[filter]}</span>
        </button>
      ))}
    </div>
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

export function DensitySwitch({ onChange, value }: { onChange: (value: WorkDensity) => void; value: WorkDensity }) {
  return (
    <div className="emu-density-switch" aria-label="Плотность карточек">
      <button className={value === "compact" ? "active" : ""} onClick={() => onChange("compact")} type="button">Компактно</button>
      <button className={value === "comfortable" ? "active" : ""} onClick={() => onChange("comfortable")} type="button">Подробно</button>
    </div>
  );
}

