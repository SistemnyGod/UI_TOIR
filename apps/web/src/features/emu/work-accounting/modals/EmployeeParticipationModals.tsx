import { useState } from "react";
import type { EmuWorkSessionEmployeeDto, EmuWorkSessionDto } from "../../../../api/contracts";
import type { EmuWorkspace } from "../../../../hooks/useEmuWorkspace";
import { EmployeePicker } from "../components/EmployeePicker";
import { ModalFrame } from "../components/ModalFrame";
import { useWorkMutation } from "../useWorkMutation";
import { WorkFormActions } from "../components/WorkFormActions";
import { WorkSummary } from "../components/WorkSummary";
import type { EmuEmployeeOption } from "../types";
import { filterEmployees, toDateInput, toLocalIso, toTimeInput } from "../workAccountingUtils";

export function AddEmployeeToWorkModal({
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
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [showAllEmployees, setShowAllEmployees] = useState(!workspace.settings.favoriteEmployees.some(employee => employee.isActive));
  const [date, setDate] = useState(toDateInput(new Date()));
  const [time, setTime] = useState(toTimeInput(new Date()));
  const [comment, setComment] = useState("");
  const mutation = useWorkMutation({ onClose, onNotify, work, values: { employeeIds: [...employeeIds].sort(), date, time, comment } });
  const activeEmployeeIds = new Set(work.employees.filter((employee) => !employee.finishedAt).map((employee) => employee.employeeId));
  const availableEmployees = employeeOptions.filter((employee) => !activeEmployeeIds.has(employee.id));
  const filteredEmployees = filterEmployees(availableEmployees, search);
  const favoriteIds = new Set(workspace.settings.favoriteEmployees.filter(employee => employee.isActive).map(employee => employee.employeeId));
  const visibleEmployees = showAllEmployees ? filteredEmployees : filteredEmployees.filter(employee => favoriteIds.has(employee.id) || employeeIds.includes(employee.id));
  function setNow() { const now = new Date(); setDate(toDateInput(now)); setTime(toTimeInput(now)); }

  async function submit() {
    const employeeId = employeeIds[0];
    if (!employeeId) return;
    await mutation.run(() => workspace.actions.addWorkSessionEmployee(mutation.workId, {
        comment,
        employeeId,
        rowVersion: mutation.rowVersion,
        startedAt: toLocalIso(date, time),
      }), "Сотрудник добавлен в работу");
  }

  return (
    <ModalFrame leaveDialog={mutation.leaveDialog} pending={mutation.pending} actions={<WorkFormActions error={mutation.error} pending={mutation.pending} onClose={mutation.close} onSubmit={() => void submit()} label="Добавить" disabled={!date || !time || !employeeIds[0] || !comment.trim()} />} onClose={mutation.close} title="Добавить сотрудника в работу">
      <WorkSummary work={work} />
      <div className="emu-form-grid">
        <label>Дата начала<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label>Время начала<span className="emu-input-action"><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /><button className="emu-now-button" onClick={setNow} type="button">Сейчас</button></span></label>
      </div>
      <label>Поиск сотрудника<input value={search} onChange={(event) => { setSearch(event.target.value); if (event.target.value.trim()) setShowAllEmployees(true); }} placeholder="ФИО, табельный, должность" /></label>
      <EmployeePicker
        allEmployees={availableEmployees}
        favoriteIds={favoriteIds}
        favoriteCount={availableEmployees.filter(employee => favoriteIds.has(employee.id)).length}
        showAll={showAllEmployees}
        totalCount={availableEmployees.length}
        onToggleShowAll={() => setShowAllEmployees(value => !value)}
        currentWorkId={work.id}
        employees={visibleEmployees}
        selectedIds={employeeIds}
        sessions={workspace.workSessions.rows}
        setSelectedIds={(updater) => setEmployeeIds((value) => updater(value).slice(-1))}
      />
      <label className="emu-textarea-label">Комментарий<textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Почему сотрудник добавлен позже" /></label>
    </ModalFrame>
  );
}

export function FinishEmployeeParticipationModal({
  employee,
  onClose,
  onNotify,
  workspace,
  work,
}: {
  employee: EmuWorkSessionEmployeeDto;
  onClose: () => void;
  onNotify: (message: string) => void;
  workspace: EmuWorkspace;
  work: EmuWorkSessionDto;
}) {
  const [date, setDate] = useState(toDateInput(new Date()));
  const [time, setTime] = useState(toTimeInput(new Date()));
  const [participationStatus, setParticipationStatus] = useState("Завершил");
  const [comment, setComment] = useState("");
  const mutation = useWorkMutation({ onClose, onNotify, work, values: { date, time, participationStatus, comment } });
  function setNow() { const now = new Date(); setDate(toDateInput(now)); setTime(toTimeInput(now)); }

  async function submit() {
    await mutation.run(() => workspace.actions.finishWorkSessionEmployee(mutation.workId, employee.employeeId, {
        comment,
        finishedAt: toLocalIso(date, time),
        participationStatus,
        rowVersion: mutation.rowVersion,
      }), "Участие сотрудника завершено");
  }

  return (
    <ModalFrame leaveDialog={mutation.leaveDialog} pending={mutation.pending} actions={<WorkFormActions error={mutation.error} pending={mutation.pending} onClose={mutation.close} onSubmit={() => void submit()} label="Завершить участие" disabled={!date || !time || !comment.trim()} />} onClose={mutation.close} title="Завершить участие сотрудника">
      <WorkSummary work={work} />
      <div className="emu-card-warning compact">{employee.fullNameSnapshot}</div>
      <div className="emu-form-grid">
        <label>Статус<select value={participationStatus} onChange={(event) => setParticipationStatus(event.target.value)}><option>Завершил</option><option>Частично выполнено</option></select></label>
        <label>Дата<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label>Время<span className="emu-input-action"><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /><button className="emu-now-button" onClick={setNow} type="button">Сейчас</button></span></label>
      </div>
      <label className="emu-textarea-label">Причина / комментарий<textarea value={comment} onChange={(event) => setComment(event.target.value)} /></label>
    </ModalFrame>
  );
}

export function MarkMistakenEmployeeModal({
  employee,
  onClose,
  onNotify,
  workspace,
  work,
}: {
  employee: EmuWorkSessionEmployeeDto;
  onClose: () => void;
  onNotify: (message: string) => void;
  workspace: EmuWorkspace;
  work: EmuWorkSessionDto;
}) {
  const [comment, setComment] = useState("");
  const mutation = useWorkMutation({ onClose, onNotify, work, values: { comment } });

  async function submit() {
    await mutation.run(() => workspace.actions.markWorkSessionEmployeeMistaken(mutation.workId, employee.employeeId, {
        comment,
        rowVersion: mutation.rowVersion,
      }), "Сотрудник отмечен как добавленный ошибочно");
  }

  return (
    <ModalFrame leaveDialog={mutation.leaveDialog} pending={mutation.pending} actions={<WorkFormActions error={mutation.error} pending={mutation.pending} onClose={mutation.close} onSubmit={() => void submit()} label="Отметить ошибочно" disabled={!comment.trim()} danger />} onClose={mutation.close} title="Ошибочно добавленный сотрудник">
      <WorkSummary work={work} />
      <div className="emu-card-warning compact">{employee.fullNameSnapshot} будет исключен из расчета трудозатрат, запись останется в аудите.</div>
      <label className="emu-textarea-label">Причина<textarea value={comment} onChange={(event) => setComment(event.target.value)} /></label>
    </ModalFrame>
  );
}
