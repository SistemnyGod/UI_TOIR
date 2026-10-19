import type { EmuWorkSessionDto } from "../../../../api/contracts";
import { calculateLiveWorkSessionMinutes } from "../../../../domain/emuWorkTime";
import { formatEmployeeShortName, formatMinutes } from "../workAccountingUtils";

export function WorkSummary({ work, showEmployees = true, now }: { work: EmuWorkSessionDto; showEmployees?: boolean; now?: Date }) {
  const taskLines = work.taskDescription.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const taskTitle = taskLines[0] || "Задача не указана";
  const taskDescription = taskLines.slice(1).join("\n");
  const live = now ? calculateLiveWorkSessionMinutes(work, now) : undefined;
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
      {showEmployees ? <div className="emu-work-summary-people">
        <div className="emu-work-summary-field">
          <span>Сотрудники</span>
          <small>{employees.length} в карточке</small>
        </div>
        <div className="emu-work-summary-employee-list">
          {employees.map((employee) => {
            const minutes = live?.employeesById.get(employee.employeeId);
            const workMinutes = minutes?.personalWorkMinutes ?? employee.personalWorkMinutes ?? employee.workMinutes;
            const pauseMinutes = minutes?.personalPauseMinutes ?? employee.personalPauseMinutes ?? employee.waitingMinutes + employee.otherWorkMinutes;
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
      </div> : null}
    </div>
  );
}
