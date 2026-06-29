import type { HistoryView } from "./emuHistoryTypes";

type EmuHistoryTabsProps = {
  activeView: HistoryView;
  counts: Record<HistoryView, number>;
  onChange: (view: HistoryView) => void;
};

export function EmuHistoryTabs({ activeView, counts, onChange }: EmuHistoryTabsProps) {
  return (
    <nav className="emu-history-tabs" aria-label="Режим истории выполненных работ">
      <HistoryTab active={activeView === "summary"} count={counts.summary} label="Общий отчет" onClick={() => onChange("summary")} />
      <HistoryTab active={activeView === "employees"} count={counts.employees} label="По сотрудникам" onClick={() => onChange("employees")} />
      <HistoryTab active={activeView === "sections"} count={counts.sections} label="По участкам" onClick={() => onChange("sections")} />
      <HistoryTab active={activeView === "details"} count={counts.details} label="Подробная история" onClick={() => onChange("details")} />
    </nav>
  );
}

function HistoryTab({ active, count, label, onClick }: { active: boolean; count: number; label: string; onClick: () => void }) {
  return (
    <button className={active ? "active" : ""} onClick={onClick} type="button">
      {label}
      <span>{count}</span>
    </button>
  );
}
