import type { EmuWorkSessionEmployeeDto } from "../../../../api/contracts";
import { Button } from "../../../../shared/ui";
import { activeEmployeeStatus } from "../workAccountingUtils";

export type WorkEmployeeAction = "pause" | "resume" | "finishEmployee" | "mistakenEmployee";
export type WorkEmployeePermissions = { canPause: boolean; canComplete: boolean; canUpdate: boolean };

export function WorkEmployeeActions({ employee, permissions, onAction }: {
  employee: EmuWorkSessionEmployeeDto;
  permissions: WorkEmployeePermissions;
  onAction: (action: WorkEmployeeAction, employeeId: string) => void;
}) {
  const status = activeEmployeeStatus(employee);
  const working = status === "Работает";
  const paused = status === "В ожидании" || status === "На паузе" || status === "На другой работе";
  if (employee.finishedAt || (!working && !paused)) return null;
  if (!permissions.canPause && !permissions.canComplete && !permissions.canUpdate) return null;
  function action(kind: WorkEmployeeAction, label: string, danger = false) {
    return <Button aria-label={`${label} — ${employee.fullNameSnapshot}`} onClick={() => onAction(kind, employee.employeeId)} size="sm" variant={danger ? "danger" : "ghost"}>{label}</Button>;
  }
  return <div className="emu-work-employee-actions" role="group" aria-label={`Действия: ${employee.fullNameSnapshot}`}>
    {permissions.canPause && working ? action("pause", "Пауза") : null}
    {permissions.canPause && paused ? action("resume", "Продолжить") : null}
    {permissions.canComplete ? action("finishEmployee", "Завершить участие") : null}
    {permissions.canUpdate ? action("mistakenEmployee", "Добавлен ошибочно", true) : null}
  </div>;
}
