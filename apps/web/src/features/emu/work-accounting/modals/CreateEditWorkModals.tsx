import { useEffect, useMemo, useState } from "react";
import type { EmuUpdateWorkSessionDto, EmuWorkSessionDto } from "../../../../api/contracts";
import type { EmuWorkspace } from "../../../../hooks/useEmuWorkspace";
import { useStoredState } from "../../../../hooks/useStoredState";
import type { EmployeeDirectoryItem } from "../../../../types";
import { EmployeePicker } from "../components/EmployeePicker";
import { ModalFrame } from "../components/ModalFrame";
import { WorkSummary } from "../components/WorkSummary";
import { emuCreateWorkDraftKey, type EmuCreateWorkDraft, type EmuEmployeeOption } from "../types";
import { activeSections, filterEmployees, isEmuCreateWorkDraft, selectedConflicts, toDateInput, toLocalIso, toTimeInput } from "../workAccountingUtils";

export function CreateWorkModal({
  employeeOptions,
  initialEmployeeId,
  initialSectionId,
  onClose,
  onNotify,
  workspace,
}: {
  employeeOptions: EmuEmployeeOption[];
  initialEmployeeId?: string;
  initialSectionId?: string;
  onClose: () => void;
  onNotify: (message: string) => void;
  workspace: EmuWorkspace;
}) {
  const today = new Date();
  const sections = activeSections(workspace);
  const defaultSectionId = sections.some((section) => section.id === initialSectionId) ? initialSectionId! : sections[0]?.id ?? "";
  const emptyDraft: EmuCreateWorkDraft = {
    employeeIds: [],
    sectionId: defaultSectionId,
    taskDescription: "",
    time: toTimeInput(today),
    workDate: toDateInput(today),
  };
  const [storedDraft, setStoredDraft] = useStoredState<EmuCreateWorkDraft>(emuCreateWorkDraftKey, emptyDraft, {
    validate: isEmuCreateWorkDraft,
    version: 1,
  });
  const [workDate, setWorkDate] = useState(storedDraft.workDate || toDateInput(today));
  const [time, setTime] = useState(storedDraft.time || toTimeInput(today));
  const [sectionId, setSectionId] = useState(sections.some((section) => section.id === storedDraft.sectionId) ? storedDraft.sectionId : defaultSectionId);
  const [taskDescription, setTaskDescription] = useState(storedDraft.taskDescription);
  const [employeeIds, setEmployeeIds] = useState<string[]>(initialEmployeeId ? [initialEmployeeId] : storedDraft.employeeIds);
  const [search, setSearch] = useState("");

  const favoriteEmployeeOptions = useMemo(() => {
    const sourceById = new Map(employeeOptions.map((employee) => [employee.id, employee]));
    return workspace.settings.favoriteEmployees
      .filter((employee) => employee.isActive)
      .map((employee) => {
        const source = sourceById.get(employee.employeeId);
        return {
          department: employee.department,
          fullName: employee.fullName,
          id: employee.employeeId,
          personnelNo: employee.personnelNo,
          position: employee.position,
          status: source?.status ?? (employee.status as EmployeeDirectoryItem["status"]),
        };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "ru"));
  }, [employeeOptions, workspace.settings.favoriteEmployees]);
  const filteredEmployees = useMemo(() => filterEmployees(favoriteEmployeeOptions, search), [favoriteEmployeeOptions, search]);
  const sectionTemplates = useMemo(
    () => workspace.settings.workTemplates.filter((template) => template.isActive && (!template.sectionId || template.sectionId === sectionId)).slice(0, 8),
    [sectionId, workspace.settings.workTemplates],
  );
  const recentTasks = useMemo(
    () =>
      Array.from(new Set(workspace.workSessions.rows.filter((work) => work.sectionId === sectionId).map((work) => work.taskDescription).filter(Boolean))).slice(0, 6),
    [sectionId, workspace.workSessions.rows],
  );
  const conflicts = selectedConflicts(employeeIds, workspace.workSessions.rows);
  const hasConflict = conflicts.length > 0;

  useEffect(() => {
    setStoredDraft({
      employeeIds,
      sectionId,
      taskDescription,
      time,
      workDate,
    });
  }, [employeeIds, sectionId, setStoredDraft, taskDescription, time, workDate]);

  function setNow() {
    const now = new Date();
    setWorkDate(toDateInput(now));
    setTime(toTimeInput(now));
  }

  function clearForm() {
    setEmployeeIds([]);
    setSearch("");
    setTaskDescription("");
    setSectionId(defaultSectionId);
    setStoredDraft(emptyDraft);
    setNow();
  }

  async function submit() {
    try {
      await workspace.actions.createWorkSession({
        arrivedAt: toLocalIso(workDate, time),
        employeeIds,
        sectionId,
        taskDescription,
        workDate,
      });
      onNotify("Работа отправлена в работу");
      onClose();
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось создать работу");
    }
  }

  return (
    <ModalFrame
      wide
      onClose={onClose}
      subtitle="Заполните участок, время прихода, выберите сотрудников и опишите задачу."
      title="Отправить в работу / Новая работа"
    >
      <div className="emu-form-grid">
        <label>Дата работ<input type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} /></label>
        <label>Участок<select value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
          {sections.length === 0 ? <option value="">Нет доступных участков</option> : null}
          {sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
        </select></label>
        <label>Время прихода<span className="emu-input-action"><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /><button onClick={setNow} type="button">Сейчас</button></span></label>
      </div>
      <div className="emu-form-grid emu-form-grid-one">
        <label>Поиск в избранных<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Фамилия, должность" /></label>
      </div>
      {sections.length === 0 ? <div className="emu-card-warning">Для учета работ не назначены участки. Создание карточек недоступно, пока администратор не выдаст доступ к участку ЭМУ.</div> : null}
      {hasConflict ? <div className="emu-card-warning">Сотрудник одновременно работает в другой карточке: {conflicts.join(", ")}</div> : null}
      <EmployeePicker
        currentWorkId=""
        employees={filteredEmployees}
        totalCount={favoriteEmployeeOptions.length}
        selectedIds={employeeIds}
        sessions={workspace.workSessions.rows}
        setSelectedIds={setEmployeeIds}
      />
      <div className="emu-template-suggestions">
        {[...sectionTemplates.map((template) => template.description || template.name), ...recentTasks].filter(Boolean).slice(0, 10).map((text) => (
          <button key={text} onClick={() => setTaskDescription(text)} type="button">{text}</button>
        ))}
      </div>
      <label className="emu-textarea-label">Задача / ожидаемый результат<textarea value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} placeholder="Опишите задачу, объем работ и ожидаемый результат..." /></label>
      <div className="emu-modal-actions emu-create-actions">
        <button className="emu-action-clear" onClick={clearForm} type="button"><span>↺</span> Очистить</button>
        <button className="emu-action-cancel" onClick={onClose} type="button"><span>×</span> Отмена</button>
        <button className="emu-primary-button emu-action-submit" disabled={!sectionId || employeeIds.length === 0 || !taskDescription.trim() || hasConflict} onClick={() => void submit()} type="button"><span>↗</span> Отправить в работу</button>
      </div>
    </ModalFrame>
  );
}

export function EditWorkModal({
  employeeOptions,
  onClose,
  onNotify,
  workspace,
  work,
}: {
  employeeOptions: EmuEmployeeOption[];
  onClose: () => void;
  onNotify: (message: string) => void;
  workspace: EmuWorkspace;
  work: EmuWorkSessionDto;
}) {
  const arrived = new Date(work.arrivedAt);
  const [workDate, setWorkDate] = useState(work.workDate);
  const [time, setTime] = useState(toTimeInput(arrived));
  const [sectionId, setSectionId] = useState(work.sectionId);
  const [taskDescription, setTaskDescription] = useState(work.taskDescription);
  const [employeeIds, setEmployeeIds] = useState(work.employees.map((employee) => employee.employeeId));
  const [search, setSearch] = useState("");
  const [comment, setComment] = useState("");
  const filteredEmployees = filterEmployees(employeeOptions, search);
  const conflicts = selectedConflicts(employeeIds, workspace.workSessions.rows, work.id);
  const hasConflict = conflicts.length > 0;
  const needsCorrectionComment = (workDate !== work.workDate || time !== toTimeInput(arrived)) && !comment.trim();

  async function submit() {
    const payload: EmuUpdateWorkSessionDto = {
      arrivedAt: toLocalIso(workDate, time),
      comment,
      employeeIds,
      rowVersion: work.rowVersion,
      sectionId,
      taskDescription,
      workDate,
    };

    try {
      await workspace.actions.updateWorkSession(work.id, payload);
      onNotify("Карточка изменена");
      onClose();
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось изменить карточку");
    }
  }

  return (
    <ModalFrame onClose={onClose} title="Изменить карточку работы">
      <WorkSummary work={work} />
      <div className="emu-form-grid">
        <label>Дата работ<input type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} /></label>
        <label>Участок<select value={sectionId} onChange={(event) => setSectionId(event.target.value)}>{activeSections(workspace).map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select></label>
        <label>Время прихода<span className="emu-input-action"><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /><button onClick={() => setTime(toTimeInput(new Date()))} type="button">Сейчас</button></span></label>
      </div>
      <label>Поиск сотрудника<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ФИО, должность, участок" /></label>
      {hasConflict ? <div className="emu-card-warning">Сотрудник одновременно работает в другой карточке: {conflicts.join(", ")}</div> : null}
      <EmployeePicker
        currentWorkId={work.id}
        employees={filteredEmployees}
        selectedIds={employeeIds}
        sessions={workspace.workSessions.rows}
        setSelectedIds={setEmployeeIds}
      />
      <label className="emu-textarea-label">Задача<textarea value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} /></label>
      <label className="emu-textarea-label">Комментарий к изменению<textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Например: скорректировано время прихода оператором" /></label>
      {needsCorrectionComment ? <div className="emu-card-warning">Для ручной корректировки даты или времени нужен комментарий.</div> : null}
      <div className="emu-modal-actions">
        <button onClick={onClose} type="button">Отмена</button>
        <button className="emu-primary-button" disabled={!sectionId || employeeIds.length === 0 || !taskDescription.trim() || hasConflict || needsCorrectionComment} onClick={() => void submit()} type="button">Сохранить</button>
      </div>
    </ModalFrame>
  );
}


