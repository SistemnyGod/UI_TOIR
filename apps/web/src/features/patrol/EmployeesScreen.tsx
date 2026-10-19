import { useEffect, useMemo, useRef, useState } from "react";
import { EmployeeDirectoryPanel } from "./components/employees/EmployeeDirectoryPanel";
import { EmployeeFormModal } from "./components/employees/EmployeeFormModal";
import { EmployeeMobileAccessPanel } from "./components/employees/EmployeeMobileAccessPanel";
import { EmployeeProfileDrawer } from "./components/employees/EmployeeProfileDrawer";
import { employeesFallback, findEmployee } from "../../repositories/employeesRepository";
import { createApiAssignmentsRepository } from "../../repositories/assignmentsRepository";
import { Button, PageHeader } from "../../shared/ui";
import { PatrolEmployeePickerModal } from "./components/employees/PatrolEmployeePickerModal";
export { PatrolEmployeePickerModal } from "./components/employees/PatrolEmployeePickerModal";
import {
  loadAssignmentFavoriteEmployeeIds,
  saveAssignmentFavoriteEmployeeIds,
  subscribeAssignmentFavoriteEmployeeIds,
} from "./assignments/assignmentStorage";
import type { DataSourceMode, EmployeeDirectoryItem, EmployeeFormPayload, ScreenId } from "../../types";
import "./employees/employeesWorkspace.css";

type EmployeeFormState =
  | { mode: "create" }
  | { mode: "edit"; employeeId: string }
  | null;

export function EmployeesScreen({
  employees,
  canManage = true,
  canAssign = true,
  canManageAccounts = false,
  dataSourceMode,
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
  canManage?: boolean;
  canAssign?: boolean;
  canManageAccounts?: boolean;
  dataSourceMode: DataSourceMode;
  employeeCreateIntent: number;
  selectedEmployeeId: string;
  onCreateEmployee: (payload: EmployeeFormPayload) => Promise<string> | string;
  onDeleteEmployee: (employeeId: string) => Promise<void> | void;
  onNavigate: (screen: ScreenId) => void;
  onNotify: (message: string) => void;
  onSelectEmployee: (id: string) => void;
  onUpdateEmployee: (employeeId: string, payload: EmployeeFormPayload) => Promise<void> | void;
}) {
  const apiAssignments = useMemo(() => createApiAssignmentsRepository(), []);
  const [formState, setFormState] = useState<EmployeeFormState>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isPatrolListSaving, setIsPatrolListSaving] = useState(false);
  const patrolListSavingRef = useRef(false);
  const [patrolEmployeeIds, setPatrolEmployeeIds] = useState<string[]>(() => loadAssignmentFavoriteEmployeeIds());
  const allEmployees = dataSourceMode === "api" ? employees : employees.length > 0 ? employees : employeesFallback;
  const patrolEmployeeSet = useMemo(() => new Set(patrolEmployeeIds), [patrolEmployeeIds]);
  const employeeDirectory = useMemo(
    () => allEmployees.filter((employee) => patrolEmployeeSet.has(employee.id)),
    [allEmployees, patrolEmployeeSet],
  );
  const selected = findEmployee(employeeDirectory, selectedEmployeeId);
  const editedEmployee = formState?.mode === "edit" ? findEmployee(allEmployees, formState.employeeId) : undefined;
  const referenceOptions = useMemo(
    () => ({
      departments: uniqueValues(allEmployees.map((employee) => employee.department)),
      groups: uniqueValues(["Атом", "Атом Экология", ...employeeDirectory.map((employee) => employee.employeeGroup)]),
      positions: uniqueValues(allEmployees.map((employee) => employee.position)),
    }),
    [allEmployees, employeeDirectory],
  );

  useEffect(() => subscribeAssignmentFavoriteEmployeeIds(setPatrolEmployeeIds), []);

  useEffect(() => {
    if (dataSourceMode !== "api") return;

    const controller = new AbortController();
    void apiAssignments
      .getSettings({ signal: controller.signal })
      .then((settings) => {
        if (controller.signal.aborted) return;
        const serverEmployeeIds = settings.favoriteEmployeeIds ?? [];
        setPatrolEmployeeIds(serverEmployeeIds);
        saveAssignmentFavoriteEmployeeIds(serverEmployeeIds);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        onNotify(error instanceof Error ? error.message : "Не удалось загрузить список сотрудников обхода.");
      });

    return () => controller.abort();
  }, [apiAssignments, dataSourceMode, onNotify]);

  useEffect(() => {
    if (selectedEmployeeId && !patrolEmployeeSet.has(selectedEmployeeId)) {
      onSelectEmployee(employeeDirectory[0]?.id ?? "");
      return;
    }

    if (!selectedEmployeeId && employeeDirectory[0]) {
      onSelectEmployee(employeeDirectory[0].id);
    }
  }, [employeeDirectory, onSelectEmployee, patrolEmployeeSet, selectedEmployeeId]);

  useEffect(() => {
    if (employeeCreateIntent <= 0) return;
    if (!canManage) {
      onNotify("Недостаточно прав для управления сотрудниками.");
      return;
    }

    setFormState({ mode: "create" });
  }, [canManage, employeeCreateIntent, onNotify]);

  async function submitEmployee(payload: EmployeeFormPayload) {
    if (!canManage) {
      onNotify("Недостаточно прав для управления сотрудниками.");
      return;
    }

    if (formState?.mode === "edit") {
      await onUpdateEmployee(formState.employeeId, payload);
      return;
    }

    const employeeId = await onCreateEmployee(payload);
    const added = await updatePatrolEmployeeIds([...patrolEmployeeIds, employeeId]);
    if (added) onSelectEmployee(employeeId);
  }

  async function removeEmployeeFromPatrol(employeeId: string) {
    if (!canManage) {
      onNotify("Недостаточно прав для управления сотрудниками.");
      return;
    }

    const removed = await updatePatrolEmployeeIds(patrolEmployeeIds.filter((id) => id !== employeeId));
    if (!removed) return;
    if (selectedEmployeeId === employeeId) onSelectEmployee("");
    onNotify("Сотрудник убран из списка обхода. В общем справочнике он остаётся.");
  }

  async function deactivateEmployee(employeeId: string) {
    if (!canManage) {
      onNotify("Недостаточно прав для управления сотрудниками.");
      return;
    }

    await onDeleteEmployee(employeeId);
    await updatePatrolEmployeeIds(patrolEmployeeIds.filter((id) => id !== employeeId));
    if (selectedEmployeeId === employeeId) onSelectEmployee("");
  }

  async function updatePatrolEmployeeIds(nextIds: string[]) {
    if (patrolListSavingRef.current) return false;
    patrolListSavingRef.current = true;
    const uniqueIds = Array.from(new Set(nextIds.filter(Boolean)));
    setIsPatrolListSaving(true);
    try {
      if (dataSourceMode === "api") {
        await apiAssignments.updateSettings({ favoriteEmployeeIds: uniqueIds });
      }
      setPatrolEmployeeIds(uniqueIds);
      saveAssignmentFavoriteEmployeeIds(uniqueIds);
      return true;
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось сохранить список сотрудников обхода.");
      return false;
    } finally {
      patrolListSavingRef.current = false;
      setIsPatrolListSaving(false);
    }
  }

  return (
    <div className="screen-stack employees-screen employees-workspace-screen">
      <PageHeader title="Сотрудники" description="Рабочий список обходчиков, профили и мобильный доступ." actions={<>
        <EmployeeMobileAccessPanel canManageAccounts={canManageAccounts} onNavigate={onNavigate} />
        <Button disabled={!canManage || isPatrolListSaving} onClick={() => setFormState({ mode: "create" })} variant="primary">Создать сотрудника</Button>
      </>} />

      <div className="two-column wide-left employees-workspace">
        <EmployeeDirectoryPanel
          employees={employeeDirectory}
          canManage={canManage}
          allEmployeesCount={allEmployees.length}
          isSaving={isPatrolListSaving}
          showCreateAction={false}
          onOpenAddFromAccounting={() => setPickerOpen(true)}
          onOpenCreate={() => {
            if (!canManage) {
              onNotify("Недостаточно прав для управления сотрудниками.");
              return;
            }
            setFormState({ mode: "create" });
          }}
          onSelectEmployee={id => {
            onSelectEmployee(id);
            if (window.matchMedia("(max-width: 720px)").matches) requestAnimationFrame(() => document.querySelector(".employee-profile-drawer")?.scrollIntoView({ behavior: "smooth", block: "start" }));
          }}
          selectedEmployeeId={selected?.id}
        />
        <EmployeeProfileDrawer
          key={selected?.id ?? "empty"}
          employee={selected}
          canManage={canManage}
          canAssign={canAssign}
          isSaving={isPatrolListSaving}
          onDeactivateEmployee={deactivateEmployee}
          onEditEmployee={(employee) => {
            if (!canManage) {
              onNotify("Недостаточно прав для управления сотрудниками.");
              return;
            }
            setFormState({ mode: "edit", employeeId: employee.id });
          }}
          onNavigate={onNavigate}
          onRemoveFromPatrol={removeEmployeeFromPatrol}
        />
      </div>

      {formState ? (
        <EmployeeFormModal
          key={formState.mode === "edit" ? formState.employeeId : "create"}
          employee={editedEmployee}
          mode={formState.mode}
          onClose={() => setFormState(null)}
          onSubmit={submitEmployee}
          referenceOptions={referenceOptions}
        />
      ) : null}

      {pickerOpen ? (
        <PatrolEmployeePickerModal
          allEmployees={allEmployees}
          initialSelectedIds={patrolEmployeeIds}
          isSaving={isPatrolListSaving}
          onApply={updatePatrolEmployeeIds}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </div>
  );
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right, "ru"),
  );
}
