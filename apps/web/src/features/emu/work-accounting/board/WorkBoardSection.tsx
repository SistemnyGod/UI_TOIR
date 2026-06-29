import type { EmuSectionWorkGroup } from "../../../../domain/emuWorkBoard";
import type { WorkDensity } from "../types";
import { WorkCard } from "./WorkCard";

export function WorkBoardSection({
  canComplete,
  canDelete,
  canPause,
  canUpdate,
  collapsed,
  density,
  now,
  onComplete,
  onCarryOver,
  onDelete,
  onDetails,
  onEdit,
  onPause,
  onResume,
  onSelect,
  onToggle,
  openDecisionWorkIds,
  section,
}: {
  canComplete: boolean;
  canDelete: boolean;
  canPause: boolean;
  canUpdate: boolean;
  collapsed: boolean;
  density: WorkDensity;
  now: Date;
  onComplete: (id: string) => void;
  onCarryOver: (id: string) => void;
  onDelete: (id: string) => void;
  onDetails: (id: string) => void;
  onEdit: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onSelect: (id: string) => void;
  onToggle: () => void;
  openDecisionWorkIds: Set<string>;
  section: EmuSectionWorkGroup;
}) {
  return (
    <section className={`emu-board-section emu-section-group ${collapsed ? "is-collapsed" : ""}`}>
      <header className="emu-board-section-header">
        <div>
          <strong>{section.sectionName}</strong>
          <span>{section.items.length} карточек на участке</span>
        </div>
        <button className="emu-group-toggle" onClick={onToggle} type="button">{collapsed ? "Развернуть" : "Свернуть"} <em>{section.items.length}</em></button>
      </header>
      {!collapsed ? <div className="emu-card-grid">
        {section.items.map((work) => (
          <WorkCard
            canComplete={canComplete}
            canDelete={canDelete}
            canPause={canPause}
            canUpdate={canUpdate}
            density={density}
            key={work.id}
            onComplete={() => onComplete(work.id)}
            onCarryOver={() => onCarryOver(work.id)}
            onDelete={() => onDelete(work.id)}
            onDetails={() => onDetails(work.id)}
            onEdit={() => onEdit(work.id)}
            onPause={() => onPause(work.id)}
            onResume={() => onResume(work.id)}
            onSelect={() => onSelect(work.id)}
            now={now}
            requiresDecision={openDecisionWorkIds.has(work.id)}
            work={work}
          />
        ))}
      </div> : null}
    </section>
  );
}

