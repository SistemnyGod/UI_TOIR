import type { EmuWorkSessionDto } from "../../../../api/contracts";
import type { EmuWorkspace } from "../../../../hooks/useEmuWorkspace";
import { calculateLiveWorkSessionMinutes } from "../../../../domain/emuWorkTime";
import { ModalFrame } from "../components/ModalFrame";
import { WorkSummary } from "../components/WorkSummary";
import { activeEmployeeStatus, employeeStatusLabel, formatDateTime, formatMinutes, formatTime } from "../workAccountingUtils";

export function WorkDetailsModal({ now, onClose, workspace, work }: { now: Date; onClose: () => void; workspace: EmuWorkspace; work: EmuWorkSessionDto }) {
  const events = workspace.auditEvents.filter((event) => event.workSessionId === work.id);
  const liveMinutes = calculateLiveWorkSessionMinutes(work, now);
  return (
    <ModalFrame onClose={onClose} title="Карточка работы">
      <WorkSummary work={work} />
      <dl className="emu-kv">
        <div><dt>Дата</dt><dd>{work.workDate}</dd></div>
        <div><dt>Время прихода</dt><dd>{formatTime(work.arrivedAt)}</dd></div>
        <div><dt>Статус</dt><dd>{work.status}</dd></div>
        <div><dt>Результат</dt><dd>{work.resultStatus || "Не заполнен"}</dd></div>
      </dl>
      {work.resultComment ? <p className="emu-result-text">{work.resultComment}</p> : null}
      <div className="emu-detail-grid">
        {work.employees.map((employee) => {
          const employeeMinutes = liveMinutes.employeesById.get(employee.employeeId) ?? employee;
          const pauseMinutes = "personalPauseMinutes" in employeeMinutes
            ? employeeMinutes.personalPauseMinutes ?? employeeMinutes.waitingMinutes + employeeMinutes.otherWorkMinutes
            : employeeMinutes.waitingMinutes + employeeMinutes.otherWorkMinutes;
          return (
            <div key={employee.id}>
              <strong>{employee.fullNameSnapshot}</strong>
              <span>{employeeStatusLabel(activeEmployeeStatus(employee))}</span>
              <small>работа {formatMinutes(employeeMinutes.workMinutes)} · пауза {formatMinutes(pauseMinutes)}</small>
            </div>
          );
        })}
      </div>
      <h4 className="emu-subtitle">История изменений</h4>
      <div className="emu-timeline">
        {events.length ? (
          events.map((event) => (
            <div key={event.id}>
              <strong>{event.eventType}</strong>
              <span>{formatDateTime(event.createdAt)} · {event.actor}</span>
              <p>{event.comment || `${event.fromStatus} → ${event.toStatus}`}</p>
            </div>
          ))
        ) : (
          <p>История изменений появится после действий с карточкой.</p>
        )}
      </div>
    </ModalFrame>
  );
}

