import { useEffect, useId, useRef, useState } from "react";
import { Button, ModalShell, useDialogCloseGuard } from "../../../shared/ui";
import type { CancelAssignmentPayload } from "../../../types";
import "./assignmentCommandDialogs.css";

const reasons: Array<{ value: CancelAssignmentPayload["reasonCode"]; label: string }> = [
  { value: "urgent_work", label: "Ушел на другую срочную работу" },
  { value: "ppr", label: "ППР" },
  { value: "employee_absent", label: "Сотрудник отсутствует" },
  { value: "route_unavailable", label: "Маршрут временно недоступен" },
  { value: "duplicate", label: "Заявка создана повторно" },
  { value: "created_by_error", label: "Ошибка при создании" },
  { value: "other", label: "Прочее" },
];

/** Shared by assignment commands and the schedule; no changes to cancellation DTOs. */
export function AssignmentCancellationDialog({ summary, errors, onClose, onSubmit, saving = false, className = "" }: {
  summary: { employee: string; route: string; plannedAt: string; status: string };
  errors: Record<string, string>;
  onClose: () => void;
  onSubmit: (payload: CancelAssignmentPayload) => void | Promise<void>;
  saving?: boolean;
  className?: string;
}) {
  const [reasonCode, setReasonCode] = useState<CancelAssignmentPayload["reasonCode"]>("urgent_work");
  const [reasonText, setReasonText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const formId = useId();
  const busy = saving || pending;
  const requiresText = reasonCode === "other";
  const { requestClose, discardDialog } = useDialogCloseGuard({ dirty: reasonCode !== "urgent_work" || Boolean(reasonText), pending: busy, onClose });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function submit() {
    if (saving || inFlight.current || (requiresText && !reasonText.trim())) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    try { await onSubmit({ reasonCode, reasonText: reasonText.trim() || undefined }); }
    catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : "Не удалось отменить заявку. Повторите попытку."); }
    finally { inFlight.current = false; if (mounted.current) setPending(false); }
  }

  return <><ModalShell title="Отмена заявки на обход" subtitle="Заявка останется в истории с причиной и временем отмены."
    className={`assign-am-cancel-modal ${className}`} pending={busy} onClose={() => { if (!inFlight.current) requestClose(); }}
    actions={<>
      <Button disabled={busy} onClick={requestClose} variant="ghost">Не отменять</Button>
      <Button disabled={busy || (requiresText && !reasonText.trim())} form={formId} type="submit" variant="danger">{busy ? "Сохранение..." : "Отменить заявку"}</Button>
    </>}>
    <div className="patrol-cancel-modal-summary">
      <div><span>Сотрудник</span><strong>{summary.employee || "Не указан"}</strong></div>
      <div><span>Маршрут</span><strong>{summary.route || "Не указан"}</strong></div>
      <div><span>Плановый старт</span><strong>{summary.plannedAt || "Не указан"}</strong></div>
      <div><span>Текущий статус</span><strong>{summary.status}</strong></div>
    </div>
    <form id={formId} onSubmit={event => { event.preventDefault(); void submit(); }}>
      <label className="assign-am-field patrol-cancel-modal-field"><span>Причина отмены</span>
        <select aria-label="Причина отмены" disabled={busy} onChange={event => setReasonCode(event.currentTarget.value as CancelAssignmentPayload["reasonCode"])} value={reasonCode}>
          {reasons.map(reason => <option key={reason.value} value={reason.value}>{reason.label}</option>)}
        </select>
        {errors.reasonCode ? <small className="field-error">{errors.reasonCode}</small> : null}
      </label>
      <label className="assign-am-field patrol-cancel-modal-field"><span>{requiresText ? "Комментарий (обязательно)" : "Комментарий"}</span>
        <textarea disabled={busy} onChange={event => setReasonText(event.currentTarget.value)} placeholder="При необходимости добавьте пояснение" rows={3} value={reasonText} />
        {errors.reasonText ? <small className="field-error">{errors.reasonText}</small> : null}
      </label>
    </form>
    <div className="patrol-cancel-modal-warning" role="status">Сотрудник будет уведомлен об отмене автоматически.</div>
    {error || errors.form ? <p className="field-error assign-am-modal-error" role="alert">{error || errors.form}</p> : null}
  </ModalShell>{discardDialog}</>;
}
