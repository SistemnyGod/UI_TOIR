import { useState } from "react";
import type { EmuDecisionDto, EmuResolveDecisionDto } from "../../../../api/contracts";
import type { EmuWorkspace } from "../../../../hooks/useEmuWorkspace";
import { ModalFrame } from "../components/ModalFrame";
import { decisionTypeLabel, formatDate, formatMinutes, formatTime } from "../workAccountingUtils";

export function DecisionList({
  canResolveDecision,
  decisions,
  emptyText,
  onResolve,
  title,
}: {
  canResolveDecision: boolean;
  decisions: EmuDecisionDto[];
  emptyText: string;
  onResolve: (decision: EmuDecisionDto) => void;
  title: string;
}) {
  if (decisions.length === 0 && !emptyText) return null;

  return (
    <section className="emu-decision-list">
      <div className="emu-side-heading">
        <div>
          <h3>{title}</h3>
          <span>{decisions.length} открытых</span>
        </div>
      </div>
      {decisions.length ? (
        decisions.map((decision) => (
          <article className={`emu-decision-card severity-${decision.severity}`} key={decision.id}>
            <div>
              <strong>{decision.employeeName || "Сотрудник не указан"}</strong>
              <span>{decision.workNumber || "Карточка не указана"} · {decision.sectionName || "Участок не указан"}</span>
            </div>
            <p>{decisionTypeLabel(decision)}{decision.decisionType === "lunch_overlap" ? ` · ${formatMinutes(decision.overlapMinutes)}` : ""}</p>
            <small>
              Смена {formatDate(decision.shiftDate)}
              {decision.lunchStartAt && decision.lunchEndAt ? ` · обед ${formatTime(decision.lunchStartAt)}-${formatTime(decision.lunchEndAt)}` : ""}
            </small>
            <em>{decision.severity === "danger" ? "Просрочено" : "Нужно решение"}</em>
            {canResolveDecision ? <button onClick={() => onResolve(decision)} type="button">Закрыть</button> : null}
          </article>
        ))
      ) : (
        <p>{emptyText}</p>
      )}
    </section>
  );
}

export function ResolveDecisionModal({
  decision,
  onClose,
  onNotify,
  workspace,
}: {
  decision: EmuDecisionDto;
  onClose: () => void;
  onNotify: (message: string) => void;
  workspace: EmuWorkspace;
}) {
  type DecisionResolution = EmuResolveDecisionDto["resolution"];
  const defaultResolution: DecisionResolution =
    decision.decisionType === "employee_conflict"
      ? "fixed_manually"
      : decision.decisionType === "perco_exit_during_work" || decision.decisionType === "perco_missing_presence_for_work" || decision.decisionType === "perco_absent_after_shift"
        ? "handled_manually"
        : decision.decisionType === "perco_lunch_exit_during_work"
          ? "exclude_lunch"
          : "worked_through_lunch";
  const [resolution, setResolution] = useState<DecisionResolution>(
    defaultResolution,
  );
  const [comment, setComment] = useState("");
  const isEmployeeConflict = decision.decisionType === "employee_conflict";
  const isPercoExit = decision.decisionType === "perco_exit_during_work";
  const isPercoMissingPresence = decision.decisionType === "perco_missing_presence_for_work";
  const isPercoLunchExit = decision.decisionType === "perco_lunch_exit_during_work";
  const isPercoAbsentAfterShift = decision.decisionType === "perco_absent_after_shift";
  const isPercoIssue = isPercoExit || isPercoMissingPresence || isPercoAbsentAfterShift;

  async function submit() {
    if (!comment.trim()) {
      onNotify("Укажите комментарий к решению");
      return;
    }

    try {
      await workspace.actions.resolveDecision(decision.id, {
        comment,
        resolution,
        rowVersion: decision.rowVersion,
      });
      onNotify("Спорная ситуация закрыта");
      onClose();
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось закрыть спорную ситуацию");
    }
  }

  return (
    <ModalFrame onClose={onClose} title="Закрыть спорную ситуацию">
      <div className="emu-decision-modal-summary">
        <strong>{decision.employeeName}</strong>
        <span>{decision.workNumber || "Карточка не указана"} · {decision.sectionName || "Участок не указан"}</span>
        {isEmployeeConflict ? (
          <p>Сотрудник одновременно числится работающим в нескольких активных карточках. Проверьте карточки и закройте решение с комментарием.</p>
        ) : isPercoExit ? (
          <p>PERCo зафиксировал выход сотрудника во время активной работы. Проверьте карточку, поставьте сотрудника на паузу или закройте ситуацию как ложное событие.</p>
        ) : isPercoMissingPresence ? (
          <p>По PERCo нет подтвержденного присутствия сотрудника на момент начала участия в работе. Проверьте ручное добавление и закройте ситуацию с комментарием.</p>
        ) : isPercoAbsentAfterShift ? (
          <p>Смена сотрудника закончилась, карточка остается активной, а PERCo не подтверждает присутствие после окончания смены. Проверьте перенос, паузу или завершение участия.</p>
        ) : isPercoLunchExit ? (
          <p>
            PERCo зафиксировал выход сотрудника в обед, но карточка продолжает считать рабочее время.
            {decision.lunchStartAt && decision.lunchEndAt ? ` Обед: ${formatTime(decision.lunchStartAt)}-${formatTime(decision.lunchEndAt)}.` : ""}
          </p>
        ) : (
          <p>
            Работа пересекла обед на {formatMinutes(decision.overlapMinutes)}.
            {decision.lunchStartAt && decision.lunchEndAt ? ` Обед: ${formatTime(decision.lunchStartAt)}-${formatTime(decision.lunchEndAt)}.` : ""}
          </p>
        )}
      </div>
      <div className="emu-decision-options">
        {isEmployeeConflict ? (
          <>
            <label>
              <input
                checked={resolution === "fixed_manually"}
                name="decision-resolution"
                onChange={() => setResolution("fixed_manually")}
                type="radio"
              />
              <span>Исправлено вручную</span>
              <small>Оператор проверил карточки и устранил некорректное пересечение.</small>
            </label>
            <label>
              <input
                checked={resolution === "confirmed_parallel_work"}
                name="decision-resolution"
                onChange={() => setResolution("confirmed_parallel_work")}
                type="radio"
              />
              <span>Подтвердить параллельную работу</span>
              <small>Оставить как исключение с audit-комментарием.</small>
            </label>
          </>
        ) : isPercoIssue ? (
          <>
            <label>
              <input
                checked={resolution === "handled_manually"}
                name="decision-resolution"
                onChange={() => setResolution("handled_manually")}
                type="radio"
              />
              <span>Обработано вручную</span>
              <small>Оператор проверил PERCo, скорректировал карточку или внес нужное пояснение.</small>
            </label>
            <label>
              <input
                checked={resolution === "false_alarm"}
                name="decision-resolution"
                onChange={() => setResolution("false_alarm")}
                type="radio"
              />
              <span>Ложное событие</span>
              <small>Событие PERCo не относится к этой работе или не требует изменения учета.</small>
            </label>
          </>
        ) : (
          <>
            <label>
              <input
                checked={resolution === "worked_through_lunch"}
                name="decision-resolution"
                onChange={() => setResolution("worked_through_lunch")}
                type="radio"
              />
              <span>Работал в обед</span>
              <small>Время работы остается как есть.</small>
            </label>
            <label>
              <input
                checked={resolution === "exclude_lunch"}
                name="decision-resolution"
                onChange={() => setResolution("exclude_lunch")}
                type="radio"
              />
              <span>Исключить обед</span>
              <small>Обед вычитается из сменной сводки, интервалы работы не переписываются.</small>
            </label>
          </>
        )}
      </div>
      <label className="emu-textarea-label">
        Комментарий
        <textarea
          maxLength={500}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Укажите причину решения"
          value={comment}
        />
      </label>
      <div className="emu-modal-actions">
        <button className="emu-secondary-button" onClick={onClose} type="button">Отмена</button>
        <button className="emu-primary-button" onClick={submit} type="button">Закрыть решение</button>
      </div>
    </ModalFrame>
  );
}

