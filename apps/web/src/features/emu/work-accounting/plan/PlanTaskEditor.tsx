import { useState } from "react";
import type { EmuPlanTaskDto } from "../../../../api/contracts";
import type { EmuWorkspace } from "../../../../hooks/useEmuWorkspace";
import type { EmuEmployeeOption } from "../types";
import { EmployeePicker } from "../components/EmployeePicker";
import { ModalFrame } from "../components/ModalFrame";
import { WorkFormActions } from "../components/WorkFormActions";
import { activeSections, filterEmployees } from "../workAccountingUtils";
import { useWorkMutation } from "../useWorkMutation";

export function PlanTaskEditor({ task, initialDate, defaultSectionId, employees, workspace, onClose, onNotify, onSaved }: {
  task?: EmuPlanTaskDto;
  initialDate: string;
  defaultSectionId: string;
  employees: EmuEmployeeOption[];
  workspace: EmuWorkspace;
  onClose: () => void;
  onNotify: (message: string) => void;
  onSaved: (task: EmuPlanTaskDto) => void;
}) {
  const [opened] = useState(task);
  const [title, setTitle] = useState(opened?.title ?? "");
  const [description, setDescription] = useState(opened?.description ?? "");
  const [plannedDate, setPlannedDate] = useState(opened?.plannedDate ?? initialDate);
  const [sectionId, setSectionId] = useState(opened?.sectionId ?? defaultSectionId);
  const [priority, setPriority] = useState(opened?.priority || "Обычный");
  const [employeeIds, setEmployeeIds] = useState(opened?.employeeIds ?? []);
  const [search, setSearch] = useState("");
  const mutation = useWorkMutation({ onClose, onNotify, work: opened,
    values: { title, description, plannedDate, sectionId, priority, employeeIds: [...employeeIds].sort() } });
  const sections = activeSections(workspace);
  const missingIds = employeeIds.filter(id => !employees.some(employee => employee.id === id));
  function save() {
    if (!title.trim() || !plannedDate || !employeeIds.length) return;
    const payload = { title: title.trim(), description, plannedDate, sectionId: sectionId || null, priority,
      employeeIds, isRecurring: opened?.isRecurring ?? false, recurrenceRule: opened?.recurrenceRule ?? "",
      rowVersion: opened ? mutation.rowVersion : undefined };
    void mutation.run(() => opened ? workspace.actions.updatePlanTask(mutation.workId, payload) : workspace.actions.createPlanTask(payload),
      opened ? "Задача плана обновлена" : "Задача добавлена в недельный план", onSaved);
  }
  return <ModalFrame title={opened ? "Изменить плановую задачу" : "Новая плановая задача"} className="emu-plan-editor" wide
    subtitle={opened ? "Редактируется открытая версия задачи. Ошибка сохранения не удаляет ваш ввод." : "Укажите задачу, дату и сотрудников"}
    pending={mutation.pending} onClose={mutation.close} leaveDialog={mutation.leaveDialog}
    actions={<WorkFormActions error={mutation.error} pending={mutation.pending} onClose={mutation.close} onSubmit={save}
      disabled={!title.trim() || !plannedDate || !employeeIds.length} label={opened ? "Сохранить задачу" : "Добавить задачу"} />}>
    <label className="emu-textarea-label">Название задачи<input value={title} onChange={event => setTitle(event.target.value)} placeholder="Новая плановая задача" /></label>
    <div className="emu-form-grid">
      <label>Плановая дата<input type="date" value={plannedDate} onChange={event => setPlannedDate(event.target.value)} /></label>
      <label>Участок<select value={sectionId} onChange={event => setSectionId(event.target.value)}>
        {!sectionId ? <option value="">Нет активного участка</option> : null}
        {sectionId && !sections.some(section => section.id === sectionId) ? <option value={sectionId}>{opened?.sectionName || "Прежний участок"} (недоступен)</option> : null}
        {sections.map(section => <option key={section.id} value={section.id}>{section.name}</option>)}
      </select></label>
      <label>Приоритет<select value={priority} onChange={event => setPriority(event.target.value)}>{["Низкий", "Обычный", "Высокий", "Срочно"].map(value => <option key={value}>{value}</option>)}</select></label>
    </div>
    <label className="emu-textarea-label">Описание<textarea rows={4} value={description} onChange={event => setDescription(event.target.value)} placeholder="Что нужно сделать, критерий выполнения" /></label>
    <label className="emu-textarea-label">Поиск сотрудников<input value={search} onChange={event => setSearch(event.target.value)} placeholder="ФИО, должность, подразделение" /></label>
    <EmployeePicker currentWorkId="" employees={filterEmployees(employees, search)} allEmployees={employees} selectedIds={employeeIds} setSelectedIds={setEmployeeIds} sessions={[]} />
    {missingIds.length ? <div className="emu-plan-missing"><p>В задаче сохранены сотрудники, отсутствующие в текущем справочнике. Их привязки сохраняются до явного удаления.</p>{missingIds.map(id => <button type="button" key={id} onClick={() => setEmployeeIds(current => current.filter(value => value !== id))}>Убрать недоступного сотрудника {id}</button>)}</div> : null}
  </ModalFrame>;
}
