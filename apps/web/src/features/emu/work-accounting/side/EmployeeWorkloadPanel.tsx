import { useState } from "react";
import { filterEmuEmployeeWorkload, type EmuEmployeeWorkload, type EmuEmployeeWorkloadStatus } from "../../../../domain/emuWorkBoard";
import { employeeWorkloadLabel, formatEmployeeShortName } from "../workAccountingUtils";

export function EmployeeWorkloadPanel({
  canCreate,
  employees,
  onCreateForEmployee,
  onSelectEmployee,
  onSelectWork,
}: {
  canCreate: boolean;
  employees: EmuEmployeeWorkload[];
  onCreateForEmployee: (employeeId: string) => void;
  onSelectEmployee: (employeeId: string) => void;
  onSelectWork: (workId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<EmuEmployeeWorkloadStatus | "all">("all");
  const rows = filterEmuEmployeeWorkload(employees, query, status);
  const counts = employees.reduce<Record<EmuEmployeeWorkloadStatus | "all", number>>(
    (acc, employee) => {
      acc.all += 1;
      acc[employee.status] += 1;
      return acc;
    },
    { all: 0, conflict: 0, free: 0, waiting: 0, working: 0 },
  );

  return (
    <div className="emu-workload-panel">
      <div className="emu-side-heading">
        <div>
          <h3>Занятость сотрудников</h3>
          <span>{counts.free} свободны · {counts.working + counts.waiting} заняты</span>
        </div>
      </div>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по ФИО, табельному, должности" />
      <div className="emu-workload-filters">
        {(["all", "free", "working", "waiting", "conflict"] as const).map((item) => (
          <button className={status === item ? "active" : ""} key={item} onClick={() => setStatus(item)} type="button">
            {employeeWorkloadLabel(item)} <span>{counts[item]}</span>
          </button>
        ))}
      </div>
      <div className="emu-workload-list">
        {rows.map((employee) => (
          <button className={`status-${employee.status}`} key={employee.employeeId} onClick={() => {
            if (employee.status === "free" && canCreate) {
              onCreateForEmployee(employee.employeeId);
              return;
            }
            if (employee.workSessionIds.length === 1) {
              onSelectWork(employee.workSessionIds[0]);
              return;
            }
            onSelectEmployee(employee.employeeId);
            }} type="button">
            <strong>{formatEmployeeShortName(employee.fullName)}</strong>
            <span>{employee.position || employee.department}</span>
            {employee.status !== "free" ? <em>{employeeWorkloadLabel(employee.status)}</em> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

