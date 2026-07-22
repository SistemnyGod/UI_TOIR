import { useState } from "react";
import type { EmuWorkSessionEmployeeDto, EmuWorkSessionDto } from "../../../../api/contracts";
import type { EmuWorkspace } from "../../../../hooks/useEmuWorkspace";
import { EmployeePicker } from "../components/EmployeePicker";
import { ModalFrame } from "../components/ModalFrame";
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
  const [date, setDate] = useState(toDateInput(new Date()));
  const [time, setTime] = useState(toTimeInput(new Date()));
  const [comment, setComment] = useState("");
  const activeEmployeeIds = new Set(work.employees.filter((employee) => !employee.finishedAt).map((employee) => employee.employeeId));
  const filteredEmployees = filterEmployees(employeeOptions.filter((employee) => !activeEmployeeIds.has(employee.id)), search);

  async function submit() {
    const employeeId = employeeIds[0];
    if (!employeeId) return;
    try {
      await workspace.actions.addWorkSessionEmployee(work.id, {
        comment,
        employeeId,
        rowVersion: work.rowVersion,
        startedAt: toLocalIso(date, time),
      });
      onNotify("Сотрудник добавлен в работу");
      onClose();
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось добавить сотрудника");
    }
  }

  return (
    <ModalFrame onClose={onClose} title="Добавить сотрудника в работу">
      <WorkSummary work={work} />
      <div className="emu-form-grid">
        <label>Дата начала<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label>Время начала<span className="emu-input-action"><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /><button className="emu-now-button" onClick={() => setTime(toTimeInput(new Date()))} type="button">Сейчас</button></span></label>
      </div>
      <label>Поиск сотрудника<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ФИО, табельный, должность" /></label>
      <EmployeePicker
        currentWorkId={work.id}
        employees={filteredEmployees}
        selectedIds={employeeIds}
        sessions={workspace.workSessions.rows}
        setSelectedIds={(updater) => setEmployeeIds((value) => updater(value).slice(-1))}
      />
      <label className="emu-textarea-label">Комментарий<textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Почему сотрудник добавлен позже" /></label>
      <div className="emu-modal-actions">
        <button onClick={onClose} type="button">Отмена</button>
        <button className="emu-primary-button" disabled={!employeeIds[0] || !comment.trim()} onClick={() => void submit()} type="button">Добавить</button>
      </div>
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

  async function submit() {
    try {
      await workspace.actions.finishWorkSessionEmployee(work.id, employee.employeeId, {
        comment,
        finishedAt: toLocalIso(date, time),
        participationStatus,
        rowVersion: work.rowVersion,
      });
      onNotify("Участие сотрудника завершено");
      onClose();
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось завершить участие сотрудника");
    }
  }

  return (
    <ModalFrame onClose={onClose} title="Завершить участие сотрудника">
      <WorkSummary work={work} />
      <div className="emu-card-warning compact">{employee.fullNameSnapshot}</div>
      <div className="emu-form-grid">
        <label>Статус<select value={participationStatus} onChange={(event) => setParticipationStatus(event.target.value)}><option>Завершил</option><option>Частично выполнено</option></select></label>
        <label>Дата<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label>Время<span className="emu-input-action"><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /><button className="emu-now-button" onClick={() => setTime(toTimeInput(new Date()))} type="button">Сейчас</button></span></label>
      </div>
      <label className="emu-textarea-label">Причина / комментарий<textarea value={comment} onChange={(event) => setComment(event.target.value)} /></label>
      <div className="emu-modal-actions">
        <button onClick={onClose} type="button">Отмена</button>
        <button className="emu-primary-button" disabled={!comment.trim()} onClick={() => void submit()} type="button">Завершить участие</button>
      </div>
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

  async function submit() {
    try {
      await workspace.actions.markWorkSessionEmployeeMistaken(work.id, employee.employeeId, {
        comment,
        rowVersion: work.rowVersion,
      });
      onNotify("Сотрудник отмечен как добавленный ошибочно");
      onClose();
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось отметить сотрудника");
    }
  }

  return (
    <ModalFrame onClose={onClose} title="Ошибочно добавленный сотрудник">
      <WorkSummary work={work} />
      <div className="emu-card-warning compact">{employee.fullNameSnapshot} будет исключен из расчета трудозатрат, запись останется в аудите.</div>
      <label className="emu-textarea-label">Причина<textarea value={comment} onChange={(event) => setComment(event.target.value)} /></label>
      <div className="emu-modal-actions">
        <button onClick={onClose} type="button">Отмена</button>
        <button className="emu-danger-button" disabled={!comment.trim()} onClick={() => void submit()} type="button">Отметить ошибочно</button>
      </div>
    </ModalFrame>
  );
}

