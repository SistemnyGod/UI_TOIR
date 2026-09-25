import { useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { ModalShell } from "../../../shared/ui/ModalShell";
import { formatRuDate } from "./documentDraft";

export function JournalPeriodPicker({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [single, setSingle] = useState(true);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const label = !from && !to ? "За всё время" : from === to ? formatRuDate(from) : `${from ? formatRuDate(from) : "Начало"} — ${to ? formatRuDate(to) : "Сегодня"}`;
  function apply(a: string, b: string) { onChange(a, b); setOpen(false); }
  function today() {
    const now = new Date();
    const value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    apply(value, value);
  }
  return <div className="ppe-period-field"><span>Период выдачи</span>
    <button ref={trigger} className="button secondary" type="button" aria-label={`Период выдачи: ${label}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setStart(from); setEnd(to); setSingle(from === to); setOpen(true); }}><span>{label}</span><CalendarDays size={18} aria-hidden="true" /></button>
    {open ? <ModalShell title="Период выдачи" className="ppe-period-modal" restoreFocusRef={trigger} onClose={() => setOpen(false)} actions={<><button className="button secondary" type="button" onClick={() => setOpen(false)}>Отмена</button><button className="button primary" type="button" disabled={!start || (!single && (!end || end < start))} onClick={() => apply(start, single ? start : end)}>Применить</button></>}>
      <div className="ppe-period-options"><button className="button secondary" type="button" onClick={today}>Сегодня</button><button className="button secondary" type="button" onClick={() => apply("", "")}>За всё время</button></div>
      <div className="ppe-period-options" role="group" aria-label="Тип периода"><button className={`button ${single ? "primary" : "secondary"}`} type="button" aria-pressed={single} onClick={() => setSingle(true)}>Один день</button><button className={`button ${single ? "secondary" : "primary"}`} type="button" aria-pressed={!single} onClick={() => setSingle(false)}>Диапазон</button></div>
      <div className="ppe-period-dates"><label>{single ? "Дата" : "С даты"}<input type="date" value={start} onChange={event => setStart(event.target.value)} /></label>{!single ? <label>По дату включительно<input type="date" min={start || undefined} value={end} onChange={event => setEnd(event.target.value)} /></label> : null}</div>
      {!single && end && start && end < start ? <p role="alert">Дата окончания должна быть не раньше начала.</p> : null}
    </ModalShell> : null}
  </div>;
}
