import { useEffect, useId, useRef, useState } from "react";
import { Button, ModalShell, useDialogCloseGuard } from "../../../shared/ui";
import { defaultAssignmentShiftSettings } from "./assignmentStorage";
import { formatShiftRange } from "./assignmentDateUtils";
import type { ShiftTimeSettings } from "./assignmentTypes";

export function ShiftSettingsModal({ onClose, onSave, value }: {
  onClose: () => void;
  onSave: (settings: ShiftTimeSettings) => void | boolean | Promise<void | boolean>;
  value: ShiftTimeSettings;
}) {
  const [draft, setDraft] = useState(() => ({ ...value }));
  const initial = useRef(JSON.stringify(draft));
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const mounted = useRef(true), inFlight = useRef(false);
  const formId = useId();
  const { requestClose, discardDialog } = useDialogCloseGuard({ dirty: JSON.stringify(draft) !== initial.current, pending, onClose });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const update = (key: keyof ShiftTimeSettings, time: string) => { setDraft(current => ({ ...current, [key]: time })); setError(""); };
  async function save() {
    if (inFlight.current) return;
    if (!Object.values(draft).every(time => /^([01]\d|2[0-3]):[0-5]\d$/.test(time))) { setError("Укажите корректное время начала и окончания обеих смен."); return; }
    inFlight.current = true; setPending(true); setError("");
    try { const result = await onSave(draft); if (mounted.current) { if (result === false) setError("Не удалось сохранить смены. Повторите попытку."); else onClose(); } }
    catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : "Не удалось сохранить смены."); }
    finally { inFlight.current = false; if (mounted.current) setPending(false); }
  }
  return <><ModalShell title="Настройка смен" subtitle="Время применяется ко всем сотрудникам в списке назначений." className="assign-am-shift-modal" pending={pending}
    onClose={() => { if (!inFlight.current) requestClose(); }} actions={<>
      <Button disabled={pending} onClick={() => setDraft({ ...defaultAssignmentShiftSettings })} variant="ghost">По умолчанию</Button>
      <Button disabled={pending} onClick={requestClose} variant="ghost">Отмена</Button>
      <Button disabled={pending} form={formId} type="submit" variant="primary">{pending ? "Сохранение…" : "Сохранить"}</Button>
    </>}>
    <form id={formId} onSubmit={event => { event.preventDefault(); void save(); }}>
      <div className="assign-am-shift-modal-grid">{(["day", "night"] as const).map(period => <fieldset disabled={pending} key={period}>
        <legend>{period === "day" ? "Дневная смена" : "Ночная смена"}</legend>
        {(["Start", "End"] as const).map(edge => { const key = `${period}${edge}` as keyof ShiftTimeSettings; return <label key={key}>
          <span>{edge === "Start" ? "Начало" : "Окончание"}</span>
          <input aria-label={`${edge === "Start" ? "Начало" : "Окончание"} ${period === "day" ? "дневной" : "ночной"} смены`} type="time" value={draft[key]} onChange={event => update(key, event.currentTarget.value)} required />
        </label>; })}
      </fieldset>)}</div>
    </form>
    <p>День {formatShiftRange(draft.dayStart, draft.dayEnd)} · Ночь {formatShiftRange(draft.nightStart, draft.nightEnd)}</p>
    {error ? <p role="alert" className="field-error">{error}</p> : null}
  </ModalShell>{discardDialog}</>;
}
