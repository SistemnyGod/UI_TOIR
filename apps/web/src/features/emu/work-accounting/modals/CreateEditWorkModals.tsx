import { useEffect, useMemo, useState } from "react";
import type { EmuUpdateWorkSessionDto, EmuWorkSessionDto } from "../../../../api/contracts";
import type { EmuWorkspace } from "../../../../hooks/useEmuWorkspace";
import { useStoredState } from "../../../../hooks/useStoredState";
import { writeStoredState } from "../../../../repositories/browserStorageRepository";
import { useWorkMutation } from "../useWorkMutation";
import { WorkFormActions } from "../components/WorkFormActions";
import { EmployeePicker } from "../components/EmployeePicker";
import { ModalFrame } from "../components/ModalFrame";
import { Button } from "../../../../shared/ui";
import { WorkSummary } from "../components/WorkSummary";
import { buildCreateWorkEmployeeOptions, buildCreateWorkTemplates } from "../createWorkOptions";
import { emuCreateWorkDraftKey, type EmuCreateWorkDraft, type EmuEmployeeOption } from "../types";
import { activeSections, filterEmployees, isEmuCreateWorkDraft, selectedConflicts, toDateInput, toLocalIso, toTimeInput } from "../workAccountingUtils";

export function CreateWorkModal({
  employeeOptions,
  initialEmployeeId,
  initialSectionId,
  onClose,
  onNotify,
  workspace,
  draftStorageKey = emuCreateWorkDraftKey,
}: {
  employeeOptions: EmuEmployeeOption[];
  initialEmployeeId?: string;
  initialSectionId?: string;
  onClose: () => void;
  onNotify: (message: string) => void;
  workspace: EmuWorkspace;
  draftStorageKey?: string;
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
  const [storedDraft, setStoredDraft] = useStoredState<EmuCreateWorkDraft>(draftStorageKey, emptyDraft, {
    validate: isEmuCreateWorkDraft,
    version: 1,
  });
  const [workDate, setWorkDate] = useState(storedDraft.workDate || toDateInput(today));
  const [time, setTime] = useState(storedDraft.time || toTimeInput(today));
  const [sectionId, setSectionId] = useState(sections.some((section) => section.id === storedDraft.sectionId) ? storedDraft.sectionId : defaultSectionId);
  const [taskDescription, setTaskDescription] = useState(storedDraft.taskDescription);
  const [employeeIds, setEmployeeIds] = useState<string[]>(initialEmployeeId ? [initialEmployeeId] : storedDraft.employeeIds);
  const [search, setSearch] = useState("");
  const [showAllEmployees, setShowAllEmployees] = useState(false);
  const mutation = useWorkMutation({ onClose, onNotify, values: { workDate, time, sectionId, taskDescription, employeeIds: [...employeeIds].sort() }, leaveMessage: "Работа ещё не создана на сервере. При закрытии локальный черновик останется в браузере, если сохранение доступно.", leaveLabel: "Закрыть форму" });

  const { employees: availableEmployeeOptions, favoriteIds: favoriteEmployeeIds } = useMemo(
    () => buildCreateWorkEmployeeOptions(employeeOptions, workspace.settings.favoriteEmployees),
    [employeeOptions, workspace.settings.favoriteEmployees],
  );
  const filteredEmployees = useMemo(() => filterEmployees(availableEmployeeOptions, search), [availableEmployeeOptions, search]);
  const quickEmployees = useMemo(
    () =>
      showAllEmployees
        ? filteredEmployees
        : filteredEmployees.filter((employee) => favoriteEmployeeIds.has(employee.id) || employeeIds.includes(employee.id)),
    [employeeIds, favoriteEmployeeIds, filteredEmployees, showAllEmployees],
  );
  const sectionTemplates = useMemo(
    () => buildCreateWorkTemplates(workspace.settings.workTemplates, sectionId),
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
    await mutation.run(() => workspace.actions.createWorkSession({
        arrivedAt: toLocalIso(workDate, time),
        employeeIds,
        sectionId,
        taskDescription,
        workDate,
      }), "Работа создана и отправлена в работу", () => {
        // Persist before unmounting; an effect cannot clear storage after close.
        writeStoredState(draftStorageKey, { ...emptyDraft, employeeIds: [], taskDescription: "" }, 1);
      });
  }

  const missingRequirements = [
    !sectionId ? "участок" : "",
    employeeIds.length === 0 ? "сотрудника" : "",
    !taskDescription.trim() ? "задачу" : "",
    !workDate ? "дату" : "",
    !time ? "время" : "",
  ].filter(Boolean);

  return (
    <ModalFrame leaveDialog={mutation.leaveDialog}
      className="emu-create-work-modal"
      wide
      onClose={mutation.close}
      pending={mutation.pending}
      actions={<div className="emu-modal-actions emu-create-actions">
        {mutation.error ? <p className="emu-work-form-error" role="alert">{mutation.error}</p> : null}
        <div className="emu-create-actions-secondary"><Button disabled={mutation.pending} onClick={clearForm} variant="ghost">Очистить</Button><Button disabled={mutation.pending} onClick={mutation.close} variant="ghost">Отмена</Button></div>
        <div className="emu-create-actions-primary">{missingRequirements.length > 0 && !hasConflict ? <span>Заполните: {missingRequirements.join(", ")}</span> : null}<Button className="emu-action-submit" disabled={mutation.pending || missingRequirements.length > 0 || hasConflict} isLoading={mutation.pending} onClick={() => void submit()} variant="primary">Создать работу</Button></div>
      </div>}
      subtitle="Заполните участок, время прихода, выберите сотрудников и опишите задачу."
      title="Создать работу"
    >
      <div className="emu-create-work-body">
        <section className="emu-create-work-section emu-create-work-basics" aria-label="Параметры работы">
          <div className="emu-create-work-section-heading">
            <span>1</span>
            <div><strong>Параметры работы</strong><small>Когда и на каком участке</small></div>
          </div>
          <div className="emu-form-grid">
            <label>Дата работ<input type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} /></label>
            <label>Участок<select value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
              {sections.length === 0 ? <option value="">Нет доступных участков</option> : null}
              {sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
            </select></label>
            <label>Время прихода<span className="emu-input-action"><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /><button className="emu-now-button" onClick={setNow} type="button">Сейчас</button></span></label>
          </div>
        </section>
        {sections.length === 0 ? <div className="emu-card-warning">Для учета работ не назначены участки. Создание карточек недоступно, пока администратор не выдаст доступ к участку ЭМУ.</div> : null}
        {hasConflict ? <div className="emu-card-warning">Сотрудник одновременно работает в другой карточке: {conflicts.join(", ")}</div> : null}
        <section className="emu-create-work-section" aria-label="Выбор сотрудников">
          <div className="emu-create-work-section-heading">
            <span>2</span>
            <div><strong>Сотрудники</strong><small>Быстрый выбор: избранные · доступно {favoriteEmployeeIds.size} из {availableEmployeeOptions.length}</small></div>
          </div>
          <label className="emu-create-work-search">Поиск сотрудника<input value={search} onChange={(event) => {
              const value = event.target.value;
              setSearch(value);
              if (value.trim()) setShowAllEmployees(true);
            }} placeholder="Фамилия, должность, подразделение или табельный номер" /></label>
          <EmployeePicker
            allEmployees={availableEmployeeOptions}
            currentWorkId=""
            employees={quickEmployees}
            favoriteCount={favoriteEmployeeIds.size}
            favoriteIds={favoriteEmployeeIds}
            onToggleShowAll={() => setShowAllEmployees((value) => !value)}
            showAll={showAllEmployees}
            totalCount={availableEmployeeOptions.length}
            selectedIds={employeeIds}
            sessions={workspace.workSessions.rows}
            setSelectedIds={setEmployeeIds}
          />
        </section>
        <section className="emu-create-work-section" aria-label="Описание задачи">
          <div className="emu-create-work-section-heading">
            <span>3</span>
            <div><strong>Задача</strong><small>Выберите шаблон или опишите работу вручную</small></div>
          </div>
          <div className="emu-quick-task-block">
            <strong>Быстрые задачи</strong>
            <div className="emu-template-suggestions">
              {sectionTemplates.map((template) => (
                <button key={template.id} onClick={() => setTaskDescription(template.description || template.name)} type="button">
                  <span>{template.name}</span>
                  {template.sectionId && template.sectionId !== sectionId ? <small>{template.sectionName}</small> : null}
                </button>
              ))}
              {recentTasks.filter((text) => !sectionTemplates.some((template) => (template.description || template.name) === text)).slice(0, 4).map((text) => (
                <button key={text} onClick={() => setTaskDescription(text)} type="button"><span>{text}</span><small>Недавняя</small></button>
              ))}
            </div>
          </div>
          <label className="emu-textarea-label">Задача / ожидаемый результат<textarea value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} placeholder="Опишите задачу, объем работ и ожидаемый результат..." /></label>
        </section>
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
  const [showAllEmployees, setShowAllEmployees] = useState(false);
  const [comment, setComment] = useState("");
  const mutation = useWorkMutation({ onClose, onNotify, work, values: { workDate, time, sectionId, taskDescription, employeeIds: [...employeeIds].sort(), comment } });
  const filteredEmployees = filterEmployees(employeeOptions, search);
  const favoriteEmployeeIds = useMemo(
    () => new Set(workspace.settings.favoriteEmployees.filter((employee) => employee.isActive).map((employee) => employee.employeeId)),
    [workspace.settings.favoriteEmployees],
  );
  const quickEmployees = useMemo(
    () =>
      showAllEmployees
        ? filteredEmployees
        : filteredEmployees.filter((employee) => favoriteEmployeeIds.has(employee.id) || employeeIds.includes(employee.id)),
    [employeeIds, favoriteEmployeeIds, filteredEmployees, showAllEmployees],
  );
  const conflicts = selectedConflicts(employeeIds, workspace.workSessions.rows, work.id);
  const hasConflict = conflicts.length > 0;
  const needsCorrectionComment = (workDate !== work.workDate || time !== toTimeInput(arrived)) && !comment.trim();

  async function submit() {
    const payload: EmuUpdateWorkSessionDto = {
      arrivedAt: toLocalIso(workDate, time),
      comment,
      employeeIds,
      rowVersion: mutation.rowVersion,
      sectionId,
      taskDescription,
      workDate,
    };

    await mutation.run(() => workspace.actions.updateWorkSession(mutation.workId, payload), "Карточка изменена");
  }

  return (
    <ModalFrame leaveDialog={mutation.leaveDialog} className="emu-edit-work-modal" onClose={mutation.close} pending={mutation.pending} title="Изменить карточку работы" wide actions={<WorkFormActions error={mutation.error} pending={mutation.pending} onClose={mutation.close} onSubmit={() => void submit()} disabled={!workDate || !time || !sectionId || employeeIds.length === 0 || !taskDescription.trim() || hasConflict || needsCorrectionComment} label="Сохранить" />}>
      <WorkSummary work={work} />
      <div className="emu-form-grid">
        <label>Дата работ<input type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} /></label>
        <label>Участок<select value={sectionId} onChange={(event) => setSectionId(event.target.value)}>{activeSections(workspace).map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select></label>
        <label>Время прихода<span className="emu-input-action"><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /><button className="emu-now-button" onClick={() => setTime(toTimeInput(new Date()))} type="button">Сейчас</button></span></label>
      </div>
      <label>Поиск сотрудника<input value={search} onChange={(event) => {
          const value = event.target.value;
          setSearch(value);
          if (value.trim()) setShowAllEmployees(true);
        }} placeholder="ФИО, должность, участок" /></label>
      {hasConflict ? <div className="emu-card-warning">Сотрудник одновременно работает в другой карточке: {conflicts.join(", ")}</div> : null}
      <EmployeePicker
        allEmployees={employeeOptions}
        currentWorkId={work.id}
        employees={quickEmployees}
        favoriteCount={favoriteEmployeeIds.size}
        favoriteIds={favoriteEmployeeIds}
        onToggleShowAll={() => setShowAllEmployees((value) => !value)}
        showAll={showAllEmployees}
        selectedIds={employeeIds}
        sessions={workspace.workSessions.rows}
        setSelectedIds={setEmployeeIds}
      />
      <label className="emu-textarea-label">Задача<textarea value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} /></label>
      <label className="emu-textarea-label">Комментарий к изменению<textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Например: скорректировано время прихода оператором" /></label>
      {needsCorrectionComment ? <div className="emu-card-warning">Для ручной корректировки даты или времени нужен комментарий.</div> : null}
    </ModalFrame>
  );
}
