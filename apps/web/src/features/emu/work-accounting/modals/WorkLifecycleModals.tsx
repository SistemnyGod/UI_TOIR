import { useRef, useState } from "react";
import type { EmuCarryOverWorkSessionDto, EmuCompleteWorkSessionDto, EmuPauseWorkSessionDto, EmuResumeWorkSessionDto, EmuWorkSessionDto } from "../../../../api/contracts";
import type { EmuWorkspace } from "../../../../hooks/useEmuWorkspace";
import { ModalFrame } from "../components/ModalFrame";
import { WorkSummary } from "../components/WorkSummary";
import { activeEmployeeStatus, addDays, employeeStatusLabel, toDateInput, toLocalIso, toTimeInput, toggle } from "../workAccountingUtils";

export function PauseWorkModal({ initialEmployeeId = "", onClose, onNotify, workspace, work }: { initialEmployeeId?: string; onClose: () => void; onNotify: (message: string) => void; workspace: EmuWorkspace; work: EmuWorkSessionDto }) {
  const workingEmployees = work.employees.filter((employee) => !employee.finishedAt && activeEmployeeStatus(employee) === "Работает");
  const [employeeIds, setEmployeeIds] = useState(initialEmployeeId ? [initialEmployeeId] : workingEmployees.map((employee) => employee.employeeId));
  const [waitReasonId, setWaitReasonId] = useState(workspace.settings.waitReasons[0]?.id ?? "");
  const [comment, setComment] = useState("");
  const [markAsOtherWork, setMarkAsOtherWork] = useState(false);
  const otherWorkRef = useRef<HTMLInputElement | null>(null);

  async function submit() {
    const shouldMarkAsOtherWork = markAsOtherWork || otherWorkRef.current?.checked === true;
    const payload: EmuPauseWorkSessionDto = { comment, employeeIds, markAsOtherWork: shouldMarkAsOtherWork, rowVersion: work.rowVersion, waitReasonId };
    try {
      await workspace.actions.pauseWorkSession(work.id, payload);
      onNotify(shouldMarkAsOtherWork ? "Сотрудники отмечены на другой работе" : "Работа поставлена на паузу");
      onClose();
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось поставить на паузу");
    }
  }

  return (
    <ModalFrame onClose={onClose} title="Поставить на паузу">
      <WorkSummary work={work} />
      <div className="emu-check-list">
        {workingEmployees.map((employee) => (
          <label key={employee.employeeId}>
            <input checked={employeeIds.includes(employee.employeeId)} onChange={() => setEmployeeIds((value) => toggle(value, employee.employeeId))} type="checkbox" />
            {employee.fullNameSnapshot}
          </label>
        ))}
      </div>
      {workingEmployees.length === 0 ? <div className="emu-card-warning">В карточке нет сотрудников со статусом «Работает». Продолжите сотрудника или завершите карточку.</div> : null}
      <label>Причина ожидания<select value={waitReasonId} onChange={(event) => setWaitReasonId(event.target.value)}>{workspace.settings.waitReasons.filter((reason) => reason.isActive).map((reason) => <option key={reason.id} value={reason.id}>{reason.name}</option>)}</select></label>
      <label className="emu-checkbox">
        <input
          checked={markAsOtherWork}
          onChange={(event) => setMarkAsOtherWork(event.currentTarget.checked)}
          onClick={(event) => setMarkAsOtherWork(event.currentTarget.checked)}
          ref={otherWorkRef}
          type="checkbox"
        />{" "}
        На другой работе
      </label>
      <label className="emu-textarea-label">Комментарий<textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Например: нет кабеля, ожидаем склад" /></label>
      <div className="emu-modal-actions">
        <button onClick={onClose} type="button">Отмена</button>
        <button className="emu-primary-button" disabled={employeeIds.length === 0 || !waitReasonId} onClick={() => void submit()} type="button">Пауза</button>
      </div>
    </ModalFrame>
  );
}

export function ResumeWorkModal({ initialEmployeeId = "", onClose, onNotify, workspace, work }: { initialEmployeeId?: string; onClose: () => void; onNotify: (message: string) => void; workspace: EmuWorkspace; work: EmuWorkSessionDto }) {
  const pausedEmployees = work.employees.filter((employee) => {
    const status = activeEmployeeStatus(employee);
    return !employee.finishedAt && status !== "Работает" && status !== "Добавлен ошибочно";
  });
  const [employeeIds, setEmployeeIds] = useState(initialEmployeeId ? [initialEmployeeId] : pausedEmployees.map((employee) => employee.employeeId));
  const [comment, setComment] = useState("");
  const [time, setTime] = useState(toTimeInput(new Date()));

  async function submit() {
    const payload: EmuResumeWorkSessionDto = {
      comment,
      employeeIds,
      resumedAt: toLocalIso(toDateInput(new Date()), time),
      rowVersion: work.rowVersion,
    };
    try {
      await workspace.actions.resumeWorkSession(work.id, payload);
      onNotify("Работа продолжена");
      onClose();
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось продолжить работу");
    }
  }

  return (
    <ModalFrame onClose={onClose} title="Продолжить работу">
      <WorkSummary work={work} />
      <label>Время возврата<span className="emu-input-action"><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /><button onClick={() => setTime(toTimeInput(new Date()))} type="button">Сейчас</button></span></label>
      <div className="emu-check-list">
        {pausedEmployees.map((employee) => (
          <label key={employee.employeeId}>
            <input checked={employeeIds.includes(employee.employeeId)} onChange={() => setEmployeeIds((value) => toggle(value, employee.employeeId))} type="checkbox" />
            {employee.fullNameSnapshot} · {employeeStatusLabel(activeEmployeeStatus(employee))}
          </label>
        ))}
      </div>
      {pausedEmployees.length === 0 ? <div className="emu-card-warning">В карточке нет сотрудников на паузе или на другой работе.</div> : null}
      <label className="emu-textarea-label">Комментарий<textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Причина ожидания устранена" /></label>
      <div className="emu-modal-actions">
        <button onClick={onClose} type="button">Отмена</button>
        <button className="emu-primary-button" disabled={employeeIds.length === 0} onClick={() => void submit()} type="button">Продолжить</button>
      </div>
    </ModalFrame>
  );
}

export function CompleteWorkModal({ onClose, onNotify, workspace, work }: { onClose: () => void; onNotify: (message: string) => void; workspace: EmuWorkspace; work: EmuWorkSessionDto }) {
  const [employeeIds, setEmployeeIds] = useState(work.employees.filter((employee) => !employee.finishedAt).map((employee) => employee.employeeId));
  const [resultStatus, setResultStatus] = useState("Выполнено");
  const [resultComment, setResultComment] = useState("");
  const [notCompletedReasonId, setNotCompletedReasonId] = useState<string>("");
  const [completedDate, setCompletedDate] = useState(toDateInput(new Date()));
  const [completedTime, setCompletedTime] = useState(toTimeInput(new Date()));
  const completedAtValue = toLocalIso(completedDate, completedTime);
  const selectedEmployees = work.employees.filter((employee) => employeeIds.includes(employee.employeeId) && !employee.finishedAt);
  const earliestArrival = selectedEmployees.length
    ? Math.min(...selectedEmployees.map((employee) => new Date(employee.arrivedAt).getTime()))
    : new Date(work.arrivedAt).getTime();
  const completionBeforeArrival = new Date(completedAtValue).getTime() < earliestArrival;

  function setCompletedNow() {
    const now = new Date();
    setCompletedDate(toDateInput(now));
    setCompletedTime(toTimeInput(now));
  }

  async function submit() {
    const payload: EmuCompleteWorkSessionDto = {
      completedAt: completedAtValue,
      employeeIds,
      notCompletedReasonId: resultStatus === "Не выполнено" ? notCompletedReasonId : null,
      resultComment,
      resultStatus,
      rowVersion: work.rowVersion,
    };
    try {
      await workspace.actions.completeWorkSession(work.id, payload);
      onNotify("Работа завершена");
      onClose();
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось завершить работу");
    }
  }

  const reasonRequired = resultStatus === "Не выполнено";

  return (
    <ModalFrame className="emu-work-complete-modal" onClose={onClose} title="Завершить работу">
      <WorkSummary work={work} />
      <div className="emu-check-list">
        {work.employees.filter((employee) => !employee.finishedAt).map((employee) => (
          <label key={employee.employeeId}>
            <input checked={employeeIds.includes(employee.employeeId)} onChange={() => setEmployeeIds((value) => toggle(value, employee.employeeId))} type="checkbox" />
            {employee.fullNameSnapshot}
          </label>
        ))}
      </div>
      {work.employees.every((employee) => employee.finishedAt) ? <div className="emu-card-warning">В карточке нет незавершенных сотрудников.</div> : null}
      <div className="emu-form-grid emu-complete-form-grid">
        <label>Итоговый статус<select value={resultStatus} onChange={(event) => setResultStatus(event.target.value)}><option>Выполнено</option><option>Частично выполнено</option><option>Не выполнено</option></select></label>
        <label>Причина невыполнения<select disabled={!reasonRequired} value={notCompletedReasonId} onChange={(event) => setNotCompletedReasonId(event.target.value)}><option value="">Не требуется</option>{workspace.settings.notCompletedReasons.filter((reason) => reason.isActive).map((reason) => <option key={reason.id} value={reason.id}>{reason.name}</option>)}</select></label>
        <label className="emu-complete-time-field">Время окончания<span className="emu-input-action"><input type="date" value={completedDate} onChange={(event) => setCompletedDate(event.target.value)} /><input type="time" value={completedTime} onChange={(event) => setCompletedTime(event.target.value)} /><button onClick={setCompletedNow} type="button">Сейчас</button></span></label>
      </div>
      <label className="emu-textarea-label">Результат работы<textarea value={resultComment} onChange={(event) => setResultComment(event.target.value)} placeholder="Опишите выполненные действия и важные детали" /></label>
      {completionBeforeArrival ? <div className="emu-card-warning">Время окончания не может быть раньше времени прихода выбранных сотрудников.</div> : null}
      <div className="emu-modal-actions">
        <button onClick={onClose} type="button">Отмена</button>
        <button className="emu-primary-button" disabled={employeeIds.length === 0 || !resultComment.trim() || (reasonRequired && !notCompletedReasonId) || completionBeforeArrival} onClick={() => void submit()} type="button">Завершить работу</button>
      </div>
    </ModalFrame>
  );
}

export function CarryOverWorkModal({ onClose, onNotify, workspace, work }: { onClose: () => void; onNotify: (message: string) => void; workspace: EmuWorkspace; work: EmuWorkSessionDto }) {
  const [toDate, setToDate] = useState(addDays(work.workDate, 1));
  const [comment, setComment] = useState("");
  const isInvalidDate = toDate <= work.workDate;

  async function submit() {
    const payload: EmuCarryOverWorkSessionDto = {
      comment,
      rowVersion: work.rowVersion,
      toDate,
    };

    try {
      await workspace.actions.carryOverWorkSession(work.id, payload);
      onNotify("Работа перенесена без изменения номера карточки");
      onClose();
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось перенести работу");
    }
  }

  return (
    <ModalFrame onClose={onClose} title="Перенести работу">
      <WorkSummary work={work} />
      <div className="emu-card-warning">
        Карточка останется активной с тем же номером {work.workNumber}. В блоке «Перенесенные» она будет видна как незавершенная работа новой смены.
      </div>
      <div className="emu-form-grid">
        <label>Текущая дата<input readOnly value={work.workDate} /></label>
        <label>Новая дата<input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
      </div>
      <label className="emu-textarea-label">Причина переноса<textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Например: не успели закончить до конца смены, перенос на следующую смену" /></label>
      {isInvalidDate ? <div className="emu-card-warning">Новая дата должна быть позже текущей даты работы.</div> : null}
      <div className="emu-modal-actions">
        <button onClick={onClose} type="button">Отмена</button>
        <button className="emu-primary-button" disabled={!comment.trim() || isInvalidDate} onClick={() => void submit()} type="button">Перенести</button>
      </div>
    </ModalFrame>
  );
}

export function DeleteWorkModal({ onClose, onNotify, workspace, work }: { onClose: () => void; onNotify: (message: string) => void; workspace: EmuWorkspace; work: EmuWorkSessionDto }) {
  const [reason, setReason] = useState("");
  async function submit() {
    try {
      await workspace.actions.deleteWorkSession(work.id, { reason, rowVersion: work.rowVersion });
      onNotify("Работа удалена и сохранена в истории");
      onClose();
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось удалить работу");
    }
  }

  return (
    <ModalFrame onClose={onClose} title="Удалить работу">
      <WorkSummary work={work} />
      <label className="emu-textarea-label">Причина удаления<textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <div className="emu-modal-actions">
        <button onClick={onClose} type="button">Отмена</button>
        <button className="emu-danger-button" disabled={!reason.trim()} onClick={() => void submit()} type="button">Удалить</button>
      </div>
    </ModalFrame>
  );
}
