import { useEffect, useMemo, useState } from "react";
import { EmployeeDirectoryPanel } from "./components/employees/EmployeeDirectoryPanel";
import { EmployeeFormModal } from "./components/employees/EmployeeFormModal";
import { EmployeeMobileAccessPanel } from "./components/employees/EmployeeMobileAccessPanel";
import { EmployeeProfileDrawer } from "./components/employees/EmployeeProfileDrawer";
import {
  employeesFallback,
  findEmployee,
} from "../../repositories/employeesRepository";
import { createApiAssignmentsRepository } from "../../repositories/assignmentsRepository";
import {
  loadAssignmentFavoriteEmployeeIds,
  saveAssignmentFavoriteEmployeeIds,
  subscribeAssignmentFavoriteEmployeeIds,
} from "./assignments/assignmentStorage";
import type { DataSourceMode, EmployeeDirectoryItem, EmployeeFormPayload, ScreenId } from "../../types";

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
  const [patrolEmployeeIds, setPatrolEmployeeIds] = useState<string[]>(() => loadAssignmentFavoriteEmployeeIds());
  const allEmployees = employees.length > 0 ? employees : employeesFallback;
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
    [allEmployees],
  );

  useEffect(() => {
    return subscribeAssignmentFavoriteEmployeeIds(setPatrolEmployeeIds);
  }, []);

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
        onNotify(error instanceof Error ? error.message : "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0441\u043f\u0438\u0441\u043e\u043a \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u043e\u0432 \u043e\u0431\u0445\u043e\u0434\u0430.");
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
    if (employeeCreateIntent > 0) {
      if (!canManage) {
        onNotify("Недостаточно прав для управления сотрудниками.");
        return;
      }

      setFormState({ mode: "create" });
    }
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
    updatePatrolEmployeeIds([...patrolEmployeeIds, employeeId]);
    onSelectEmployee(employeeId);
  }

  async function deleteEmployee(employeeId: string) {
    if (!canManage) {
      onNotify("Недостаточно прав для управления сотрудниками.");
      return;
    }

    updatePatrolEmployeeIds(patrolEmployeeIds.filter((id) => id !== employeeId));
    if (selectedEmployeeId === employeeId) {
      onSelectEmployee("");
    }
    onNotify("Сотрудник убран из списка Обхода. В общем справочнике он остается.");
  }

  function updatePatrolEmployeeIds(nextIds: string[]) {
    const uniqueIds = Array.from(new Set(nextIds));
    setPatrolEmployeeIds(uniqueIds);
    saveAssignmentFavoriteEmployeeIds(uniqueIds);
    if (dataSourceMode === "api") {
      void apiAssignments.updateSettings({ favoriteEmployeeIds: uniqueIds }).catch((error: unknown) => {
        onNotify(error instanceof Error ? error.message : "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0441\u043f\u0438\u0441\u043e\u043a \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u043e\u0432 \u043e\u0431\u0445\u043e\u0434\u0430.");
      });
    }
  }

  return (
    <div className="screen-stack employees-screen">
      <EmployeeMobileAccessPanel onNavigate={onNavigate} onNotify={onNotify} />

      <div className="two-column wide-left employees-workspace">
        <EmployeeDirectoryPanel
          employees={employeeDirectory}
          canManage={canManage}
          allEmployeesCount={allEmployees.length}
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
          onDeleteEmployee={deleteEmployee}
          onEditEmployee={(employee) => {
            if (!canManage) {
              onNotify("Недостаточно прав для управления сотрудниками.");
              return;
            }

            setFormState({ mode: "edit", employeeId: employee.id });
          }}
          onNavigate={onNavigate}
        />
      </div>
      {formState ? (
        <EmployeeFormModal
          employee={editedEmployee}
          mode={formState.mode}
          onClose={() => setFormState(null)}
          onDelete={deleteEmployee}
          onSubmit={submitEmployee}
          referenceOptions={referenceOptions}
        />
      ) : null}
      {pickerOpen ? (
        <PatrolEmployeePickerModal
          allEmployees={allEmployees}
          selectedIds={patrolEmployeeIds}
          onChange={updatePatrolEmployeeIds}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </div>
  );
}

function PatrolEmployeePickerModal({
  allEmployees,
  selectedIds,
  onChange,
  onClose,
}: {
  allEmployees: EmployeeDirectoryItem[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
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
    if (selectedSet.has(employeeId)) {
      onChange(selectedIds.filter((id) => id !== employeeId));
      return;
    }

    onChange([...selectedIds, employeeId]);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal-window patrol-employee-picker-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <header className="modal-head">
          <div>
            <h2>Добавить сотрудников в Обход</h2>
            <p>Выберите сотрудников из общего справочника бухгалтерии. Здесь хранится только список для обхода территории.</p>
          </div>
          <button className="icon-button" onClick={onClose} type="button">×</button>
        </header>
        <div className="patrol-employee-picker-toolbar">
          <label>
            Поиск
            <input autoFocus value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="ФИО, табельный номер, должность, подразделение" />
          </label>
          <strong>{selectedIds.length} добавлено из {allEmployees.length}</strong>
        </div>
        <div className="patrol-employee-picker-list">
          {visibleEmployees.map((employee) => {
            const selected = selectedSet.has(employee.id);
            return (
              <button className={`patrol-employee-picker-row ${selected ? "selected" : ""}`} key={employee.id} onClick={() => toggle(employee.id)} type="button">
                <span className="avatar small">{employee.initials}</span>
                <span>
                  <strong>{employee.fullName}</strong>
                  <small>{employee.position}</small>
                  <em>{employee.department || employee.zone || "Без подразделения"}</em>
                </span>
                <b>{selected ? "Добавлен" : "Добавить"}</b>
              </button>
            );
          })}
        </div>
        <footer className="modal-actions">
          <button className="button ghost" onClick={() => onChange([])} type="button">Очистить список</button>
          <button className="button primary" onClick={onClose} type="button">Готово</button>
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
