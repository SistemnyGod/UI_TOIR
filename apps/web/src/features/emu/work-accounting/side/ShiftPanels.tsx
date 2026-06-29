import { useState } from "react";
import type { EmuDecisionDto, EmuEmployeeShiftDto, EmuEmployeeShiftSummaryDto, EmuUpdateEmployeeShiftDto } from "../../../../api/contracts";
import type { EmuWorkspace } from "../../../../hooks/useEmuWorkspace";
import { ModalFrame } from "../components/ModalFrame";
import { DecisionList } from "./DecisionPanels";
import { addDays, buildShiftInsights, formatDate, formatMinutes, formatShiftSource, formatTime, toDateInput, toLocalIso, toTimeInput } from "../workAccountingUtils";

export function ShiftSummaryPanel({
  canAdjustShift,
  canResolveDecision,
  loading,
  onAdjust,
  onResolveDecision,
  summary,
}: {
  canAdjustShift: boolean;
  canResolveDecision: boolean;
  loading: boolean;
  onAdjust: () => void;
  onResolveDecision: (decision: EmuDecisionDto) => void;
  summary: EmuEmployeeShiftSummaryDto | null;
}) {
  if (loading) {
    return (
      <section className="emu-shift-summary-card">
        <div className="emu-side-heading">
          <h3>Смена</h3>
          <span>Загружаем сводку...</span>
        </div>
      </section>
    );
  }

  if (!summary) {
    return (
      <section className="emu-shift-summary-card">
        <div className="emu-side-heading">
          <h3>Смена</h3>
          <span>Данных по смене пока нет</span>
        </div>
      </section>
    );
  }

  const shiftInsights = buildShiftInsights(summary);
  const percoIntervals = summary.intervals.filter((interval) => interval.type.includes("perco"));

  return (
    <section className="emu-shift-summary-card">
      <div className="emu-side-heading">
        <div>
          <h3>Смена</h3>
          <span>{summary.shift.shiftTypeName} · {formatDate(summary.shift.shiftDate)}</span>
        </div>
        {canAdjustShift ? <button onClick={onAdjust} type="button">Корректировать</button> : null}
      </div>
      <dl className="emu-kv emu-shift-summary-kv">
        <div><dt>План</dt><dd>{formatTime(summary.shift.plannedStartAt)} - {formatTime(summary.shift.plannedEndAt)}</dd></div>
        <div><dt>Факт</dt><dd>{formatTime(summary.shift.actualStartAt)} - {formatTime(summary.shift.actualEndAt)}</dd></div>
        <div><dt>Обед</dt><dd>{summary.shift.lunchTaken ? `${formatTime(summary.shift.lunchStartAt)} - ${formatTime(summary.shift.lunchEndAt)}` : "Не вычитался"}</dd></div>
        <div><dt>Источник</dt><dd>{formatShiftSource(summary.shift.source)}</dd></div>
      </dl>
      <div className="emu-shift-insights">
        <article className={shiftInsights.lateMinutes > 0 ? "tone-warning" : "tone-ok"}>
          <span>Опоздание</span>
          <strong>{formatMinutes(shiftInsights.lateMinutes)}</strong>
          <small>{shiftInsights.lateMinutes > 0 ? "факт позже плана" : "без опоздания"}</small>
        </article>
        <article>
          <span>На заводе</span>
          <strong>{formatMinutes(shiftInsights.presenceMinutes)}</strong>
          <small>{formatTime(summary.shift.actualStartAt)} - {formatTime(summary.shift.actualEndAt)}</small>
        </article>
        <article className={summary.freeMinutes > 0 ? "tone-blue" : ""}>
          <span>Свободно</span>
          <strong>{formatMinutes(summary.freeMinutes)}</strong>
          <small>без работы, пауз и обеда</small>
        </article>
        <article className={summary.overtimeMinutes > 0 ? "tone-warning" : ""}>
          <span>Сверхурочно</span>
          <strong>{formatMinutes(summary.overtimeMinutes)}</strong>
          <small>после окончания смены</small>
        </article>
      </div>
      <div className="emu-shift-totals">
        <span><b>{formatMinutes(summary.workMinutes)}</b> работа</span>
        <span><b>{formatMinutes(summary.pauseMinutes)}</b> пауза</span>
        <span><b>{formatMinutes(summary.freeMinutes)}</b> свободно</span>
        <span><b>{formatMinutes(summary.overtimeMinutes)}</b> сверхурочно</span>
      </div>
      {summary.beforeShiftWorkMinutes > 0 ? <p className="emu-card-warning compact">До начала смены: {formatMinutes(summary.beforeShiftWorkMinutes)}</p> : null}
      <DecisionList
        canResolveDecision={canResolveDecision}
        decisions={summary.decisions.filter((decision) => decision.status === "new")}
        emptyText=""
        onResolve={onResolveDecision}
        title="Требует решения"
      />
      <div className="emu-shift-intervals">
        {summary.intervals.slice(0, 8).map((interval, index) => (
          <div className={`type-${interval.type}`} key={`${interval.type}-${interval.startedAt}-${index}`}>
            <span>{interval.label}</span>
            <strong>{formatTime(interval.startedAt)} - {formatTime(interval.endedAt)}</strong>
            <small>{formatMinutes(interval.minutes)}{interval.workNumber ? ` · ${interval.workNumber}` : ""}{interval.reason ? ` · ${interval.reason}` : ""}</small>
          </div>
        ))}
      </div>
      {percoIntervals.length > 0 ? (
        <div className="emu-shift-perco-block">
          <strong>PERCo-интервалы</strong>
          {percoIntervals.slice(0, 4).map((interval, index) => (
            <span key={`${interval.type}-${interval.startedAt}-${index}`}>
              {interval.label}: {formatTime(interval.startedAt)} - {formatTime(interval.endedAt)} · {formatMinutes(interval.minutes)}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}


export function ShiftAdjustModal({
  onClose,
  onNotify,
  onSaved,
  shiftSummary,
  workspace,
}: {
  onClose: () => void;
  onNotify: (message: string) => void;
  onSaved: (shift: EmuEmployeeShiftDto) => void;
  shiftSummary: EmuEmployeeShiftSummaryDto;
  workspace: EmuWorkspace;
}) {
  const shift = shiftSummary.shift;
  const [shiftType, setShiftType] = useState(shift.shiftType);
  const [actualStartDate, setActualStartDate] = useState(toDateInput(new Date(shift.actualStartAt)));
  const [actualStartTime, setActualStartTime] = useState(toTimeInput(new Date(shift.actualStartAt)));
  const [actualEndDate, setActualEndDate] = useState(toDateInput(new Date(shift.actualEndAt)));
  const [actualEndTime, setActualEndTime] = useState(toTimeInput(new Date(shift.actualEndAt)));
  const [lunchTaken, setLunchTaken] = useState(shift.lunchTaken);
  const [lunchStartTime, setLunchStartTime] = useState(toTimeInput(new Date(shift.lunchStartAt)));
  const [lunchEndTime, setLunchEndTime] = useState(toTimeInput(new Date(shift.lunchEndAt)));
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState(shift.comment);

  async function submit() {
    const lunchDate = shiftType === "night" ? addDays(shift.shiftDate, 1) : shift.shiftDate;
    const payload: EmuUpdateEmployeeShiftDto = {
      actualEndAt: toLocalIso(actualEndDate, actualEndTime),
      actualStartAt: toLocalIso(actualStartDate, actualStartTime),
      comment,
      lunchEndAt: toLocalIso(lunchDate, lunchEndTime),
      lunchOverridden: true,
      lunchStartAt: toLocalIso(lunchDate, lunchStartTime),
      lunchTaken,
      plannedEndAt: shift.plannedEndAt,
      plannedStartAt: shift.plannedStartAt,
      reason,
      rowVersion: shift.rowVersion,
      shiftDate: shift.shiftDate,
      shiftType,
      templateId: shift.templateId,
    };

    try {
      const saved = await workspace.actions.updateEmployeeShift(shift.id, payload);
      onSaved(saved);
      onNotify("Смена сотрудника скорректирована");
      onClose();
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось скорректировать смену");
    }
  }

  return (
    <ModalFrame onClose={onClose} title="Скорректировать смену">
      <div className="emu-form-grid">
        <label>Тип смены<select value={shiftType} onChange={(event) => setShiftType(event.target.value)}>
          <option value="day">Дневная</option>
          <option value="day11">11-часовая</option>
          <option value="night">Ночная</option>
          <option value="individual">Индивидуальная</option>
        </select></label>
        <label>Начало фактически<span className="emu-input-action"><input type="date" value={actualStartDate} onChange={(event) => setActualStartDate(event.target.value)} /><input type="time" value={actualStartTime} onChange={(event) => setActualStartTime(event.target.value)} /></span></label>
        <label>Окончание фактически<span className="emu-input-action"><input type="date" value={actualEndDate} onChange={(event) => setActualEndDate(event.target.value)} /><input type="time" value={actualEndTime} onChange={(event) => setActualEndTime(event.target.value)} /></span></label>
        <label>Обед<span className="emu-input-action"><input disabled={!lunchTaken} type="time" value={lunchStartTime} onChange={(event) => setLunchStartTime(event.target.value)} /><input disabled={!lunchTaken} type="time" value={lunchEndTime} onChange={(event) => setLunchEndTime(event.target.value)} /></span></label>
      </div>
      <label className="emu-checkbox"><input checked={lunchTaken} onChange={(event) => setLunchTaken(event.target.checked)} type="checkbox" /> Обед вычитался из смены</label>
      <label className="emu-textarea-label">Причина корректировки<textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <label className="emu-textarea-label">Комментарий<textarea value={comment} onChange={(event) => setComment(event.target.value)} /></label>
      <div className="emu-modal-actions">
        <button onClick={onClose} type="button">Отмена</button>
        <button className="emu-primary-button" disabled={!reason.trim()} onClick={() => void submit()} type="button">Сохранить смену</button>
      </div>
    </ModalFrame>
  );
}

