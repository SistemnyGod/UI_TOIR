import { useId, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import type { InventoryEmployeeDto } from "../../../api/contracts";
import "../styles/ppe-employee-combobox.css";

export function EmployeeCombobox({ employees, value, disabled, onChange }: { employees: InventoryEmployeeDto[]; value: string; disabled: boolean; onChange: (id: string) => void }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const selected = employees.find(employee => employee.id === value);
  const matches = employees.filter(employee => `${employee.fullName} ${employee.personnelNo} ${employee.position} ${employee.department}`.toLocaleLowerCase("ru-RU").includes(query.trim().toLocaleLowerCase("ru-RU")));
  const current = Math.min(active, matches.length - 1);
  function show() { setQuery(""); setActive(0); setOpen(true); }
  function choose(employee: InventoryEmployeeDto) { onChange(employee.id); setOpen(false); }
  function move(next: number) {
    const index = Math.max(0, Math.min(next, matches.length - 1)); setActive(index);
    document.getElementById(`${id}-option-${index}`)?.scrollIntoView({ block: "nearest" });
  }
  return <div className="ppe-span-all ppe-employee-combobox" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <label htmlFor={id}>Сотрудник</label>
    <div className="ppe-employee-combobox-control">
      <input ref={input} id={id} role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open && current >= 0 ? `${id}-option-${current}` : undefined} disabled={disabled} placeholder="ФИО или табельный номер — найти и выбрать" value={open ? query : selected ? `${selected.fullName} · ${selected.personnelNo || "—"}` : ""} onClick={() => { if (!open) show(); }} onChange={event => { setQuery(event.target.value); setActive(0); setOpen(true); }} onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); if (!open) show(); else move(current + (event.key === "ArrowDown" ? 1 : -1)); }
        if (event.key === "Enter" && open) { event.preventDefault(); if (matches[current]) choose(matches[current]); }
      }} />
      <button type="button" disabled={disabled} aria-label="Показать сотрудников" aria-expanded={open} onClick={() => { input.current?.focus(); if (open) setOpen(false); else show(); }}><ChevronDown size={18} aria-hidden="true" /></button>
    </div>
    {open ? <div className="ppe-employee-combobox-popup"><div id={`${id}-list`} role="listbox" aria-label="Сотрудники">{matches.map((employee, index) => <div id={`${id}-option-${index}`} key={employee.id} role="option" aria-selected={employee.id === value} className={`ppe-employee-combobox-option ${index === current ? "is-active" : ""}`} onPointerDown={event => event.preventDefault()} onClick={() => choose(employee)} onMouseEnter={() => setActive(index)}><span><strong>{employee.fullName}</strong><small>{[employee.personnelNo && `Таб. № ${employee.personnelNo}`, employee.position, employee.department].filter(Boolean).join(" · ")}</small></span>{employee.id === value ? <Check size={18} aria-hidden="true" /> : null}</div>)}</div>{!matches.length ? <p role="status">Сотрудники не найдены. Измените запрос.</p> : null}</div> : null}
  </div>;
}
