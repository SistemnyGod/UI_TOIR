import type { EmuWorkSessionDto } from "../../../../api/contracts";
import { formatEmployeeShortName, formatMinutes } from "../workAccountingUtils";

export function WorkSummary({ work }: { work: EmuWorkSessionDto }) {
  const taskLines = work.taskDescription.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const taskTitle = taskLines[0] || "Задача не указана";
  const taskDescription = taskLines.slice(1).join(" ");
  const activeEmployees = work.employees.filter((employee) => !employee.finishedAt);
  const employees = activeEmployees.length > 0 ? activeEmployees : work.employees;

  return (
    <div className="emu-work-summary" aria-label="Сводка карточки работы">
      <div className="emu-work-summary-field">
        <span>Участок</span>
        <strong>{work.sectionName}</strong>
      </div>
      <div className="emu-work-summary-task">
        <div className="emu-work-summary-field">
          <span>Название задачи</span>
          <strong>{taskTitle}</strong>
        </div>
        <div className="emu-work-summary-description">
          <span>Описание</span>
          <p>{taskDescription || "Дополнительное описание не указано."}</p>
        </div>
      </div>
      <div className="emu-work-summary-people">
        <div className="emu-work-summary-field">
          <span>Сотрудники</span>
          <small>{employees.length} в карточке</small>
        </div>
        <div className="emu-work-summary-employee-list">
          {employees.map((employee) => {
            const workMinutes = employee.personalWorkMinutes ?? employee.workMinutes;
            const pauseMinutes = employee.personalPauseMinutes ?? employee.waitingMinutes + employee.otherWorkMinutes;
            return (
              <div className="emu-work-summary-employee" key={employee.id}>
                <strong title={employee.fullNameSnapshot}>{formatEmployeeShortName(employee.fullNameSnapshot)}</strong>
                <small>
                  работа {formatMinutes(workMinutes)}
                  {pauseMinutes > 0 ? ` · пауза ${formatMinutes(pauseMinutes)}` : ""}
                </small>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
