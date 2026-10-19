import { useRef, useState } from "react";
import { WorkCommandMenu, type WorkCommand } from "./WorkCommandMenu";
import type { EmuWorkSessionDto } from "../../../../api/contracts";
import { calculateLiveWorkSessionMinutes } from "../../../../domain/emuWorkTime";
import type { EmployeeWorkState, WorkDensity } from "../types";
import {
  activeEmployeeStatus,
  employeeStatusLabel,
  formatEmployeeShortName,
  formatMinutes,
  formatTime,
  hasWorkingEmployees,
  resolveWorkCardState,
  statusClass,
  workStateLabel,
} from "../workAccountingUtils";

export function WorkCard({
  canComplete,
  canDelete,
  canPause,
  canUpdate,
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
  requiresDecision,
  selected = false,
  work,
}: {
  canComplete: boolean;
  canDelete: boolean;
  canPause: boolean;
  canUpdate: boolean;
  density: WorkDensity;
  now: Date;
  onComplete: () => void;
  onCarryOver: () => void;
  onDelete: () => void;
  onDetails: () => void;
  onEdit: () => void;
  onPause: () => void;
  onResume: () => void;
  onSelect: () => void;
  requiresDecision: boolean;
  selected?: boolean;
  work: EmuWorkSessionDto;
}) {
  const cardState = resolveWorkCardState(work);
  const liveMinutes = calculateLiveWorkSessionMinutes(work, now);
  const hasPaused = work.employees.some((employee) => !employee.finishedAt && activeEmployeeStatus(employee) !== "Работает");
  const hasWorking = hasWorkingEmployees(work);
  const showAttention = cardState === "attention" && !hasWorking;
  const isCompleted = Boolean(work.completedAt);
  const [quickMenu, setQuickMenu] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const taskLines = work.taskDescription.split(/\r?\n/).filter(line => line.trim());
  const visibleEmployees = work.employees.slice(0, density === "compact" ? 2 : 3);
  const remainingEmployees = work.employees.length - visibleEmployees.length;
  const commands: WorkCommand[] = [
    { label: "Просмотр", action: onDetails },
    ...(canUpdate ? [{ label: "Изменить", action: onEdit }] : []),
    ...(!isCompleted && hasPaused && canPause ? [{ label: "Продолжить", action: onResume }] : []),
    ...(!isCompleted && hasWorking && canPause ? [{ label: "Пауза", action: onPause }] : []),
    ...(!isCompleted && canUpdate ? [{ label: "Перенести", action: onCarryOver }] : []),
    ...(!isCompleted && canComplete ? [{ label: "Завершить работу", action: onComplete }] : []),
    ...(canDelete ? [{ label: "Удалить", action: onDelete, danger: true }] : []),
  ];

  function openQuickMenu(event: { clientX: number; clientY: number; preventDefault?: () => void }) {
    event.preventDefault?.();
    setQuickMenu({ x: event.clientX, y: event.clientY });
  }

  return (
    <>
    <article aria-label={`Работа ${work.workNumber}`} className={`emu-work-card status-${cardState} density-${density} ${work.isCarriedOver ? "is-warning" : ""} ${selected ? "is-selected" : ""}`} onClick={onSelect} onContextMenu={openQuickMenu}>
      <div className="emu-work-card-top">
        <span className={`emu-status-pill status-${cardState}`}>{workStateLabel(cardState)}</span>
        <small>С {formatTime(work.arrivedAt)}</small>
      </div>
      <div className="emu-work-card-copy">
      {requiresDecision ? <span className="emu-decision-badge">Требует решения</span> : null}
      {work.source === "mobile" ? <span className="emu-decision-badge">Мобильное приложение</span> : null}
      <h4><button type="button" aria-label={`Открыть карточку ${work.workNumber}`} onClick={event => { event.stopPropagation(); onDetails(); }}>{taskLines[0] || "Задача не указана"}</button></h4>
      {density === "comfortable" && taskLines.length > 1 ? <p>{taskLines.slice(1).join(" ")}</p> : null}
      <div className="emu-work-meta">
        <span>{work.workNumber}</span>
        <span>{work.sectionName || "Прочее"}</span>
      </div>
      </div>
      <div className={`emu-employee-chips density-${density}`}>
        {visibleEmployees.map((employee) => {
          const status = activeEmployeeStatus(employee);
          return (
            <span className={`emu-employee-status ${statusClass(status as EmployeeWorkState)}`} key={employee.employeeId} title={employee.fullNameSnapshot}>
              {formatEmployeeShortName(employee.fullNameSnapshot)} · {employeeStatusLabel(status)}
            </span>
          );
        })}
        {work.employees.length > 1 ? <button className={`emu-work-more-people${remainingEmployees === 0 ? " is-small-only" : ""}`} type="button" aria-label={`Показать всех участников работы ${work.workNumber}`} onClick={event => { event.stopPropagation(); onDetails(); }}>Все участники: {work.employees.length} →</button> : null}
      </div>
      <div className="emu-work-card-footer">
      <dl className="emu-work-card-time"><div><dt>Работа</dt><dd>{formatMinutes(liveMinutes.workMinutes)}</dd></div><div><dt>Пауза</dt><dd>{formatMinutes(liveMinutes.waitingMinutes + liveMinutes.otherWorkMinutes)}</dd></div></dl>
      <div className="emu-card-actions">
        <button
          aria-expanded={Boolean(quickMenu)}
          aria-haspopup="menu"
          className="emu-command-button"
          ref={triggerRef}
          onClick={(event) => {
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            setQuickMenu({ x: rect.right - 220, y: rect.bottom + 6 });
          }}
          type="button"
        >
          Команды
        </button>
      </div>
      </div>
      {showAttention ? <div className="emu-card-warning compact">Нет активных сотрудников</div> : null}
    </article>
    {quickMenu ? <WorkCommandMenu commands={commands} point={quickMenu} triggerRef={triggerRef} onClose={() => setQuickMenu(null)} /> : null}
    </>
  );
}
