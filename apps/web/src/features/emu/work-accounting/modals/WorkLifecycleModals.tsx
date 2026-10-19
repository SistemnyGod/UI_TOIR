import { useRef, useState } from "react";
import type { EmuCarryOverWorkSessionDto, EmuCompleteWorkSessionDto, EmuPauseWorkSessionDto, EmuResumeWorkSessionDto, EmuWorkSessionDto } from "../../../../api/contracts";
import type { EmuWorkspace } from "../../../../hooks/useEmuWorkspace";
import { ModalFrame } from "../components/ModalFrame";
import { useWorkMutation } from "../useWorkMutation";
import { WorkFormActions } from "../components/WorkFormActions";
import { WorkSummary } from "../components/WorkSummary";
import { activeEmployeeStatus, addDays, employeeStatusLabel, formatEmployeeShortName, toDateInput, toLocalIso, toTimeInput, toggle } from "../workAccountingUtils";

export function PauseWorkModal({ initialEmployeeId = "", onClose, onNotify, workspace, work }: { initialEmployeeId?: string; onClose: () => void; onNotify: (message: string) => void; workspace: EmuWorkspace; work: EmuWorkSessionDto }) {
  const workingEmployees = work.employees.filter((employee) => !employee.finishedAt && activeEmployeeStatus(employee) === "Работает");
  const [employeeIds, setEmployeeIds] = useState(initialEmployeeId ? [initialEmployeeId] : workingEmployees.map((employee) => employee.employeeId));
  const [waitReasonId, setWaitReasonId] = useState(workspace.settings.waitReasons.find(reason => reason.isActive)?.id ?? "");
  const [comment, setComment] = useState("");
  const [markAsOtherWork, setMarkAsOtherWork] = useState(false);
  const mutation = useWorkMutation({ onClose, onNotify, work, values: { employeeIds: [...employeeIds].sort(), waitReasonId, comment, markAsOtherWork } });
  const otherWorkRef = useRef<HTMLInputElement | null>(null);
  const allWorkingEmployeesSelected = workingEmployees.length > 0 && employeeIds.length === workingEmployees.length;

  async function submit() {
    const shouldMarkAsOtherWork = markAsOtherWork || otherWorkRef.current?.checked === true;
    const payload: EmuPauseWorkSessionDto = { comment, employeeIds, markAsOtherWork: shouldMarkAsOtherWork, rowVersion: mutation.rowVersion, waitReasonId };
    await mutation.run(() => workspace.actions.pauseWorkSession(mutation.workId, payload), shouldMarkAsOtherWork ? "Сотрудники отмечены на другой работе" : "Работа поставлена на паузу");
  }

  return (
    <ModalFrame leaveDialog={mutation.leaveDialog} pending={mutation.pending} actions={<WorkFormActions error={mutation.error} pending={mutation.pending} onClose={mutation.close} onSubmit={() => void submit()} label="Пауза" disabled={employeeIds.length === 0 || !waitReasonId} />} className="emu-work-pause-modal" onClose={mutation.close} title="Поставить на паузу" wide>
      <WorkSummary work={work} />
      <section className="emu-pause-people" aria-label="Сотрудники для паузы">
        <div className="emu-pause-section-heading">
          <div>
            <strong>Сотрудники на паузу</strong>
            <span>{employeeIds.length} из {workingEmployees.length} выбрано</span>
          </div>
          <button
            className="emu-compact-action"
            onClick={() => setEmployeeIds(allWorkingEmployeesSelected ? [] : workingEmployees.map((employee) => employee.employeeId))}
            type="button"
          >
            {allWorkingEmployeesSelected ? "Снять всех" : "Выбрать всех"}
          </button>
        </div>
        <div className="emu-check-list compact">
          {workingEmployees.map((employee) => (
            <label key={employee.employeeId}>
              <input checked={employeeIds.includes(employee.employeeId)} onChange={() => setEmployeeIds((value) => toggle(value, employee.employeeId))} type="checkbox" />
              <span>{formatEmployeeShortName(employee.fullNameSnapshot)}</span>
            </label>
          ))}
        </div>
      </section>
      {workingEmployees.length === 0 ? <div className="emu-card-warning">В карточке нет сотрудников со статусом «Работает». Продолжите сотрудника или завершите карточку.</div> : null}
      <section className="emu-pause-reason" aria-label="Причина паузы">
        <label>Причина ожидания<select value={waitReasonId} onChange={(event) => setWaitReasonId(event.target.value)}>{workspace.settings.waitReasons.filter((reason) => reason.isActive).map((reason) => <option key={reason.id} value={reason.id}>{reason.name}</option>)}</select></label>
        <label className="emu-pause-other-toggle">
          <input
            checked={markAsOtherWork}
            onChange={(event) => setMarkAsOtherWork(event.currentTarget.checked)}
            onClick={(event) => setMarkAsOtherWork(event.currentTarget.checked)}
            ref={otherWorkRef}
            type="checkbox"
          />
          <span>
            <strong>На другой работе</strong>
            <small>Отметить выбранных сотрудников как занятых другой задачей.</small>
          </span>
        </label>
      </section>
      <label className="emu-textarea-label">Комментарий к паузе<textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Например: нет кабеля, ожидаем склад" /></label>
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
  const mutation = useWorkMutation({ onClose, onNotify, work, values: { employeeIds: [...employeeIds].sort(), comment, time } });

  async function submit() {
    const payload: EmuResumeWorkSessionDto = {
      comment,
      employeeIds,
      resumedAt: toLocalIso(toDateInput(new Date()), time),
      rowVersion: mutation.rowVersion,
    };
    await mutation.run(() => workspace.actions.resumeWorkSession(mutation.workId, payload), "Работа продолжена");
  }

  return (
    <ModalFrame leaveDialog={mutation.leaveDialog} pending={mutation.pending} actions={<WorkFormActions error={mutation.error} pending={mutation.pending} onClose={mutation.close} onSubmit={() => void submit()} label="Продолжить" disabled={employeeIds.length === 0 || !time} />} onClose={mutation.close} title="Продолжить работу">
      <WorkSummary work={work} />
      <label>Время возврата<span className="emu-input-action"><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /><button className="emu-now-button" onClick={() => setTime(toTimeInput(new Date()))} type="button">Сейчас</button></span></label>
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
    </ModalFrame>
  );
}

export function CompleteWorkModal({ onClose, onNotify, workspace, work }: { onClose: () => void; onNotify: (message: string) => void; workspace: EmuWorkspace; work: EmuWorkSessionDto }) {
  const unfinishedEmployees = work.employees.filter((employee) => !employee.finishedAt);
  const [employeeIds, setEmployeeIds] = useState(unfinishedEmployees.map((employee) => employee.employeeId));
  const [resultStatus, setResultStatus] = useState("Выполнено");
  const [resultComment, setResultComment] = useState("");
  const [notCompletedReasonId, setNotCompletedReasonId] = useState<string>("");
  const [completedDate, setCompletedDate] = useState(toDateInput(new Date()));
  const [completedTime, setCompletedTime] = useState(toTimeInput(new Date()));
  const mutation = useWorkMutation({ onClose, onNotify, work, values: { employeeIds: [...employeeIds].sort(), resultStatus, resultComment, notCompletedReasonId, completedDate, completedTime } });
  const completedAtValue = completedDate && completedTime ? toLocalIso(completedDate, completedTime) : "";
  const selectedEmployees = work.employees.filter((employee) => employeeIds.includes(employee.employeeId) && !employee.finishedAt);
  const latestArrival = selectedEmployees.length
    ? Math.max(...selectedEmployees.map((employee) => new Date(employee.arrivedAt).getTime()))
    : new Date(work.arrivedAt).getTime();
  const completionBeforeArrival = new Date(completedAtValue).getTime() < latestArrival;
  const allEmployeesSelected = unfinishedEmployees.length > 0 && employeeIds.length === unfinishedEmployees.length;

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
      rowVersion: mutation.rowVersion,
    };
    await mutation.run(() => workspace.actions.completeWorkSession(mutation.workId, payload), "Работа завершена");
  }

  const reasonRequired = resultStatus === "Не выполнено";

  return (
    <ModalFrame leaveDialog={mutation.leaveDialog} pending={mutation.pending} actions={<WorkFormActions error={mutation.error} pending={mutation.pending} onClose={mutation.close} onSubmit={() => void submit()} label="Завершить работу" disabled={employeeIds.length === 0 || !resultComment.trim() || (reasonRequired && !notCompletedReasonId) || completionBeforeArrival || !completedAtValue} />} className="emu-work-complete-modal" onClose={mutation.close} title="Завершить работу" wide>
      <WorkSummary work={work} />
      <section className="emu-complete-people" aria-label="Сотрудники для завершения">
        <div className="emu-complete-section-heading">
          <div>
            <strong>Сотрудники</strong>
            <span>{employeeIds.length} из {unfinishedEmployees.length} выбрано</span>
          </div>
          <button
            className="emu-compact-action"
            onClick={() => setEmployeeIds(allEmployeesSelected ? [] : unfinishedEmployees.map((employee) => employee.employeeId))}
            type="button"
          >
            {allEmployeesSelected ? "Снять всех" : "Выбрать всех"}
          </button>
        </div>
        <div className="emu-check-list compact">
          {unfinishedEmployees.map((employee) => (
            <label key={employee.employeeId}>
              <input checked={employeeIds.includes(employee.employeeId)} onChange={() => setEmployeeIds((value) => toggle(value, employee.employeeId))} type="checkbox" />
              <span>{formatEmployeeShortName(employee.fullNameSnapshot)}</span>
            </label>
          ))}
        </div>
      </section>
      {unfinishedEmployees.length === 0 ? <div className="emu-card-warning">В карточке нет незавершенных сотрудников.</div> : null}
      <div className="emu-form-grid emu-complete-form-grid">
        <label>Итоговый статус<select value={resultStatus} onChange={(event) => setResultStatus(event.target.value)}><option>Выполнено</option><option>Частично выполнено</option><option>Не выполнено</option></select></label>
        <label>Причина невыполнения<select disabled={!reasonRequired} value={notCompletedReasonId} onChange={(event) => setNotCompletedReasonId(event.target.value)}><option value="">Не требуется</option>{workspace.settings.notCompletedReasons.filter((reason) => reason.isActive).map((reason) => <option key={reason.id} value={reason.id}>{reason.name}</option>)}</select></label>
        <label className="emu-complete-time-field">Время окончания<span className="emu-input-action"><input aria-label="Дата окончания" type="date" value={completedDate} onChange={(event) => setCompletedDate(event.target.value)} /><input aria-label="Время окончания" type="time" value={completedTime} onChange={(event) => setCompletedTime(event.target.value)} /><button className="emu-now-button" onClick={setCompletedNow} type="button">Сейчас</button></span></label>
      </div>
      <label className="emu-textarea-label">Результат и описание выполненной работы<textarea value={resultComment} onChange={(event) => setResultComment(event.target.value)} placeholder="Опишите выполненные действия, результат и важные детали" /></label>
      {completionBeforeArrival ? <div className="emu-card-warning">Время окончания не может быть раньше времени прихода выбранных сотрудников.</div> : null}
    </ModalFrame>
  );
}

export function CarryOverWorkModal({ onClose, onNotify, workspace, work }: { onClose: () => void; onNotify: (message: string) => void; workspace: EmuWorkspace; work: EmuWorkSessionDto }) {
  const [toDate, setToDate] = useState(addDays(work.workDate, 1));
  const [comment, setComment] = useState("");
  const mutation = useWorkMutation({ onClose, onNotify, work, values: { toDate, comment } });
  const isInvalidDate = toDate <= work.workDate;

  async function submit() {
    const payload: EmuCarryOverWorkSessionDto = {
      comment,
      rowVersion: mutation.rowVersion,
      toDate,
    };

    await mutation.run(() => workspace.actions.carryOverWorkSession(mutation.workId, payload), "Работа перенесена без изменения номера карточки");
  }

  return (
    <ModalFrame leaveDialog={mutation.leaveDialog} pending={mutation.pending} actions={<WorkFormActions error={mutation.error} pending={mutation.pending} onClose={mutation.close} onSubmit={() => void submit()} label="Перенести" disabled={!comment.trim() || isInvalidDate} />} onClose={mutation.close} title="Перенести работу">
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
    </ModalFrame>
  );
}

export function DeleteWorkModal({ onClose, onNotify, workspace, work }: { onClose: () => void; onNotify: (message: string) => void; workspace: EmuWorkspace; work: EmuWorkSessionDto }) {
  const [reason, setReason] = useState("");
  const mutation = useWorkMutation({ onClose, onNotify, work, values: { reason } });
  async function submit() {
    await mutation.run(() => workspace.actions.deleteWorkSession(mutation.workId, { reason, rowVersion: mutation.rowVersion }), "Работа удалена и сохранена в истории");
  }

  return (
    <ModalFrame leaveDialog={mutation.leaveDialog} pending={mutation.pending} actions={<WorkFormActions error={mutation.error} pending={mutation.pending} onClose={mutation.close} onSubmit={() => void submit()} label="Удалить" disabled={!reason.trim()} danger />} onClose={mutation.close} title="Удалить работу">
      <WorkSummary work={work} />
      <label className="emu-textarea-label">Причина удаления<textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    </ModalFrame>
  );
}
