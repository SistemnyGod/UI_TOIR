import { useState } from "react";
import { createPortal } from "react-dom";
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
  work: EmuWorkSessionDto;
}) {
  const cardState = resolveWorkCardState(work);
  const liveMinutes = calculateLiveWorkSessionMinutes(work, now);
  const hasPaused = work.employees.some((employee) => !employee.finishedAt && activeEmployeeStatus(employee) !== "Работает");
  const hasWorking = hasWorkingEmployees(work);
  const showAttention = cardState === "attention" && !hasWorking;
  const isCompleted = Boolean(work.completedAt);
  const createdByLabel = work.createdByName?.trim() || (work.createdByUserId ? "пользователь" : "");
  const [quickMenu, setQuickMenu] = useState<{ x: number; y: number } | null>(null);

  function openQuickMenu(event: { clientX: number; clientY: number; preventDefault?: () => void }) {
    event.preventDefault?.();
    setQuickMenu({ x: Math.min(event.clientX, window.innerWidth - 220), y: Math.min(event.clientY, window.innerHeight - 260) });
  }

  function runQuickAction(action: () => void) {
    setQuickMenu(null);
    action();
  }

  return (
    <>
    <article className={`emu-work-card status-${cardState} density-${density} ${work.isCarriedOver ? "is-warning" : ""}`} onClick={onSelect} onContextMenu={openQuickMenu}>
      <div className="emu-work-card-top">
        <span className={`emu-status-pill status-${cardState}`}>{workStateLabel(cardState)}</span>
        <small>{formatTime(work.arrivedAt)}</small>
      </div>
      {requiresDecision ? <span className="emu-decision-badge">Требует решения</span> : null}
      {work.source === "mobile" ? <span className="emu-decision-badge">Мобильное приложение</span> : null}
      <h4>{work.sectionName || "Прочее"}</h4>
      <p>{work.taskDescription || "Задача не указана"}</p>
      <div className="emu-work-meta">
        <span>{work.workNumber}</span>
        {createdByLabel ? <span>Автор: {createdByLabel}</span> : null}
        <span>👤 сотрудников: {work.employees.length}</span>
        <span>◷ работа {formatMinutes(liveMinutes.workMinutes)} · пауза {formatMinutes(liveMinutes.waitingMinutes + liveMinutes.otherWorkMinutes)}</span>
      </div>
      <div className={`emu-employee-chips density-${density}`}>
        {work.employees.map((employee) => {
          const employeeMinutes = liveMinutes.employeesById.get(employee.employeeId);
          const status = activeEmployeeStatus(employee);
          return (
            <span className={`emu-employee-status ${statusClass(status as EmployeeWorkState)}`} key={employee.employeeId}>
              {formatEmployeeShortName(employee.fullNameSnapshot)}: {employeeStatusLabel(status)} · {formatMinutes(employeeMinutes?.personalWorkMinutes ?? employee.workMinutes)}/{formatMinutes(employeeMinutes?.personalPauseMinutes ?? employee.waitingMinutes + employee.otherWorkMinutes)}
            </span>
          );
        })}
      </div>
      {showAttention ? <div className="emu-card-warning compact">В карточке нет активных сотрудников. Продолжите работу, завершите или удалите карточку.</div> : null}
      <div className="emu-card-actions">
        <button className="emu-command-button" onClick={(event) => openQuickMenu(event)} type="button">Команды</button>
      </div>
    </article>
    {quickMenu
      ? createPortal(
          <div className="emu-quick-menu-layer" onClick={() => setQuickMenu(null)} role="presentation">
            <div className="emu-quick-menu" onClick={(event) => event.stopPropagation()} style={{ left: quickMenu.x, top: quickMenu.y }}>
              <strong>Быстрые команды</strong>
              <button onClick={() => runQuickAction(onDetails)} type="button">Просмотр</button>
              {canUpdate ? <button onClick={() => runQuickAction(onEdit)} type="button">Изменить</button> : null}
              {!isCompleted && hasPaused && canPause ? <button onClick={() => runQuickAction(onResume)} type="button">Продолжить</button> : null}
              {!isCompleted && hasWorking && canPause ? <button onClick={() => runQuickAction(onPause)} type="button">Пауза</button> : null}
              {!isCompleted && canUpdate ? <button onClick={() => runQuickAction(onCarryOver)} type="button">Перенести</button> : null}
              {!isCompleted && canComplete ? <button onClick={() => runQuickAction(onComplete)} type="button">Завершить</button> : null}
              {canDelete ? <button className="danger" onClick={() => runQuickAction(onDelete)} type="button">Удалить</button> : null}
            </div>
          </div>,
          document.body,
        )
      : null}
    </>
  );
}
