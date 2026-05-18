import { useEffect, useState } from "react";
import { EmployeeDirectoryPanel } from "../components/employees/EmployeeDirectoryPanel";
import { EmployeeFormModal } from "../components/employees/EmployeeFormModal";
import { EmployeeMetricsBar } from "../components/employees/EmployeeMetricsBar";
import { EmployeeMobileAccessPanel } from "../components/employees/EmployeeMobileAccessPanel";
import { EmployeeProfileDrawer } from "../components/employees/EmployeeProfileDrawer";
import {
  employeesFallback,
  findEmployee,
  getEmployeeMetrics,
  getEmployeeRouteProgress,
} from "../repositories/employeesRepository";
import type { EmployeeDirectoryItem, EmployeeFormPayload, ScreenId } from "../types";

type EmployeeFormState =
  | { mode: "create" }
  | { mode: "edit"; employeeId: string }
  | null;

export function EmployeesScreen({
  employees,
  employeeCreateIntent,
  selectedEmployeeId,
  onCreateEmployee,
  onDeleteEmployee,
  onNavigate,
  onNotify,
  onSelectEmployee,
  onUpdateEmployee,
}: {
  employees: EmployeeDirectoryItem[];
  employeeCreateIntent: number;
  selectedEmployeeId: string;
  onCreateEmployee: (payload: EmployeeFormPayload) => Promise<string> | string;
  onDeleteEmployee: (employeeId: string) => Promise<void> | void;
  onNavigate: (screen: ScreenId) => void;
  onNotify: (message: string) => void;
  onSelectEmployee: (id: string) => void;
  onUpdateEmployee: (employeeId: string, payload: EmployeeFormPayload) => Promise<void> | void;
}) {
  const [formState, setFormState] = useState<EmployeeFormState>(null);
  const employeeDirectory = employees.length > 0 ? employees : employeesFallback;
  const selected = findEmployee(employeeDirectory, selectedEmployeeId);
  const editedEmployee = formState?.mode === "edit" ? findEmployee(employeeDirectory, formState.employeeId) : undefined;
  const metrics = getEmployeeMetrics(employeeDirectory);
  const progress = getEmployeeRouteProgress(selected);

  useEffect(() => {
    if (employeeCreateIntent > 0) {
      setFormState({ mode: "create" });
    }
  }, [employeeCreateIntent]);

  async function submitEmployee(payload: EmployeeFormPayload) {
    if (formState?.mode === "edit") {
      await onUpdateEmployee(formState.employeeId, payload);
      return;
    }

    const employeeId = await onCreateEmployee(payload);
    onSelectEmployee(employeeId);
  }

  async function deleteEmployee(employeeId: string) {
    await onDeleteEmployee(employeeId);
    if (selectedEmployeeId === employeeId) {
      onSelectEmployee("");
    }
  }

  return (
    <div className="screen-stack">
      <EmployeeMetricsBar metrics={metrics} />
      <EmployeeMobileAccessPanel onNavigate={onNavigate} onNotify={onNotify} />

      <div className="two-column wide-left">
        <EmployeeDirectoryPanel
          employees={employeeDirectory}
          onOpenCreate={() => setFormState({ mode: "create" })}
          onSelectEmployee={onSelectEmployee}
          selectedEmployeeId={selected?.id}
        />
        <EmployeeProfileDrawer
          employee={selected}
          onDeleteEmployee={deleteEmployee}
          onEditEmployee={(employee) => setFormState({ mode: "edit", employeeId: employee.id })}
          onNavigate={onNavigate}
          onNotify={onNotify}
          progress={progress}
        />
      </div>
      {formState ? (
        <EmployeeFormModal
          employee={editedEmployee}
          mode={formState.mode}
          onClose={() => setFormState(null)}
          onDelete={deleteEmployee}
          onSubmit={submitEmployee}
        />
      ) : null}
    </div>
  );
}
