import type { EmuAuditEventDto, EmuWorkSessionDto } from "../../../api/contracts";
import { normalizeEmuText } from "../../../domain/emuWorkBoard";
import { EmuHistoryStatusPill } from "./EmuHistoryStatusPill";
import {
  auditEventClass,
  auditEventLabel,
  formatDate,
  formatDateTime,
  formatMinutes,
  formatScopedEmployees,
  formatStatusChange,
  formatTime,
  initials,
  operationalStatus,
} from "./emuHistoryUtils";

interface HistoryEmployeeOption {
  fullName: string;
  id: string;
}

export function EmuHistoryRightPanel({
  events,
  selectedEmployee,
  selectedSection,
  work,
}: {
  events: EmuAuditEventDto[];
  selectedEmployee?: HistoryEmployeeOption;
  selectedSection?: { id: string; name: string };
  work: EmuWorkSessionDto;
}) {
  const employeeRows = selectedEmployee ? work.employees.filter((employee) => employee.employeeId === selectedEmployee.id) : work.employees;

  return (
    <>
      <div className="emu-history-detail-title">
        <span>{initials(normalizeEmuText(work.sectionName))}</span>
        <div>
          <h3>{work.taskDescription}</h3>
          <p>{work.workNumber} · {normalizeEmuText(work.sectionName)}</p>
        </div>
      </div>
      <div className="emu-history-detail-status">
        <EmuHistoryStatusPill value={operationalStatus(work)} />
        <EmuHistoryStatusPill value={normalizeEmuText(work.resultStatus || "В работе")} />
      </div>
      <dl className="emu-history-detail-kv">
        <div><dt>Сотрудник</dt><dd>{selectedEmployee?.fullName ?? formatScopedEmployees(work, "")}</dd></div>
        <div><dt>Участок</dt><dd>{selectedSection?.name ?? normalizeEmuText(work.sectionName)}</dd></div>
        <div><dt>Дата</dt><dd>{formatDate(work.workDate)}</dd></div>
        <div><dt>Начало</dt><dd>{formatDateTime(work.arrivedAt)}</dd></div>
        <div><dt>Окончание</dt><dd>{work.completedAt ? formatDateTime(work.completedAt) : "не завершено"}</dd></div>
        <div><dt>Работа</dt><dd>{formatMinutes(work.workMinutes)}</dd></div>
        <div><dt>Паузы</dt><dd>{formatMinutes(work.waitingMinutes + work.otherWorkMinutes)}</dd></div>
      </dl>
      <section className="emu-history-employee-detail-list">
        <h4>Сотрудники в работе</h4>
        {employeeRows.map((employee) => (
          <article key={employee.id}>
            <strong>{employee.fullNameSnapshot}</strong>
            <EmuHistoryStatusPill value={normalizeEmuText(employee.participationStatus || employee.status)} />
            <span>работа {formatMinutes(employee.workMinutes)} · пауза {formatMinutes(employee.waitingMinutes + employee.otherWorkMinutes)}</span>
          </article>
        ))}
      </section>
      <section className="emu-history-detail-timeline">
        <h4>Временная шкала</h4>
        <div>
          <i />
          <p><strong>{formatTime(work.arrivedAt)}</strong><span>Начало работы</span></p>
        </div>
        <div>
          <i />
          <p><strong>{work.completedAt ? formatTime(work.completedAt) : "-"}</strong><span>Окончание работы</span></p>
        </div>
        <div>
          <i className="pause" />
          <p><strong>{formatMinutes(work.waitingMinutes + work.otherWorkMinutes)}</strong><span>Время пауз</span></p>
        </div>
      </section>
      <section className="emu-history-audit-list">
        <h4>Комментарии и корректировки</h4>
        {events.length ? events.slice(0, 6).map((event) => (
          <article className={auditEventClass(event.eventType)} key={event.id}>
            <strong>{auditEventLabel(event.eventType)}</strong>
            <span>{formatDateTime(event.createdAt)} · {event.actor}</span>
            <p>{event.comment || formatStatusChange(event)}</p>
          </article>
        )) : <p>Событий по карточке пока нет.</p>}
      </section>
    </>
  );
}
