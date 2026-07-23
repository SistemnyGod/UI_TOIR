import { useEffect, useMemo, useRef, useState } from "react";
import { EmployeeDirectoryPanel } from "./components/employees/EmployeeDirectoryPanel";
import { EmployeeFormModal } from "./components/employees/EmployeeFormModal";
import { EmployeeMobileAccessPanel } from "./components/employees/EmployeeMobileAccessPanel";
import { EmployeeProfileDrawer } from "./components/employees/EmployeeProfileDrawer";
import { employeesFallback, findEmployee } from "../../repositories/employeesRepository";
import { createApiAssignmentsRepository } from "../../repositories/assignmentsRepository";
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
      <EmployeeMobileAccessPanel onNavigate={onNavigate} onNotify={onNotify} />

      <div className="two-column wide-left employees-workspace">
        <EmployeeDirectoryPanel
          employees={employeeDirectory}
          canManage={canManage}
          allEmployeesCount={allEmployees.length}
          isSaving={isPatrolListSaving}
          onOpenAddFromAccounting={() => setPickerOpen(true)}
          onOpenCreate={() => {
            if (!canManage) {
              onNotify("Недостаточно прав для управления сотрудниками.");
              return;
            }
            setFormState({ mode: "create" });
          }}
          onSelectEmployee={onSelectEmployee}
          selectedEmployeeId={selected?.id}
        />
        <EmployeeProfileDrawer
          employee={selected}
          canManage={canManage}
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
          employee={editedEmployee}
          mode={formState.mode}
          onClose={() => setFormState(null)}
          onDelete={deactivateEmployee}
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

export function PatrolEmployeePickerModal({
  allEmployees,
  initialSelectedIds,
  isSaving = false,
  onApply,
  onClose,
}: {
  allEmployees: EmployeeDirectoryItem[];
  initialSelectedIds: string[];
  isSaving?: boolean;
  onApply: (ids: string[]) => Promise<boolean> | boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [draftIds, setDraftIds] = useState(() => Array.from(new Set(initialSelectedIds)));
  const [isApplying, setIsApplying] = useState(false);
  const selectedSet = useMemo(() => new Set(draftIds), [draftIds]);
  const visibleEmployees = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return allEmployees
      .filter((employee) => {
        if (!normalizedQuery) return true;
        return [employee.fullName, employee.personnelNo, employee.position, employee.department, employee.employeeGroup]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .slice(0, 120);
  }, [allEmployees, query]);

  function toggle(employeeId: string) {
    setDraftIds((current) =>
      current.includes(employeeId) ? current.filter((id) => id !== employeeId) : [...current, employeeId],
    );
  }

  async function applySelection() {
    if (isApplying || isSaving) return;
    setIsApplying(true);
    try {
      const applied = await onApply(draftIds);
      if (applied) onClose();
    } finally {
      setIsApplying(false);
    }
  }

  const pending = isApplying || isSaving;

  return (
    <div className="modal-backdrop" onMouseDown={pending ? undefined : onClose}>
      <section
        aria-labelledby="patrol-employee-picker-title"
        aria-modal="true"
        className="modal-window patrol-employee-picker-modal"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !pending) onClose();
        }}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="modal-head">
          <div>
            <h2 id="patrol-employee-picker-title">Сотрудники для обходов</h2>
            <p>Выберите сотрудников из общего справочника. Изменения применятся одной операцией после сохранения.</p>
          </div>
          <button aria-label="Закрыть" className="icon-button" disabled={pending} onClick={onClose} type="button">×</button>
        </header>

        <div className="patrol-employee-picker-toolbar">
          <label>
            Поиск
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="ФИО, табельный номер, должность, подразделение"
            />
          </label>
          <strong>{draftIds.length} выбрано из {allEmployees.length}</strong>
        </div>

        <div className="patrol-employee-picker-list">
          {visibleEmployees.length > 0 ? visibleEmployees.map((employee) => {
            const selected = selectedSet.has(employee.id);
            return (
              <button
                aria-pressed={selected}
                className={`patrol-employee-picker-row ${selected ? "selected" : ""}`}
                key={employee.id}
                onClick={() => toggle(employee.id)}
                type="button"
              >
                <span className="avatar small">{employee.initials}</span>
                <span>
                  <strong>{employee.fullName}</strong>
                  <small>{employee.position}</small>
                  <em>{employee.department || employee.zone || "Без подразделения"}</em>
                </span>
                <b>{selected ? "Выбран" : "Выбрать"}</b>
              </button>
            );
          }) : <p className="patrol-employee-picker-empty">По запросу сотрудники не найдены.</p>}
        </div>

        <footer className="modal-actions">
          <button className="button ghost" disabled={pending || draftIds.length === 0} onClick={() => setDraftIds([])} type="button">
            Очистить выбор
          </button>
          <button className="button ghost" disabled={pending} onClick={onClose} type="button">Отмена</button>
          <button className="button primary" disabled={pending} onClick={applySelection} type="button">
            {pending ? "Сохранение..." : "Сохранить список"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right, "ru"),
  );
}
