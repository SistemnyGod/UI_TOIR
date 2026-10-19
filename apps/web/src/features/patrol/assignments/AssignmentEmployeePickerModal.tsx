import { useEffect, useMemo, useRef, useState } from "react";
import { Button, ModalShell, PaginationBar, useDialogCloseGuard, type PageSizeOption } from "../../../shared/ui";
import type { Employee } from "../../../types";

export function AssignmentEmployeePickerModal({ employees, favoriteEmployeeIds, onChange, onClose }: {
  employees: Employee[];
  favoriteEmployeeIds: string[];
  onChange: (ids: string[]) => void | boolean | Promise<void | boolean>;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [draftIds, setDraftIds] = useState(() => [...new Set(favoriteEmployeeIds)]);
  const initial = useRef([...draftIds].sort().join("\n"));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(50);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true), inFlight = useRef(false);
  const favoriteSet = useMemo(() => new Set(draftIds), [draftIds]);
  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => employees.filter(employee => !query || [employee.name, employee.role, employee.zone].join(" ").toLowerCase().includes(query)), [employees, query]);
  const safePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const { requestClose, discardDialog } = useDialogCloseGuard({ dirty: [...draftIds].sort().join("\n") !== initial.current, pending, onClose });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function save() {
    if (inFlight.current) return;
    inFlight.current = true; setPending(true); setError("");
    try {
      const result = await onChange(draftIds);
      if (!mounted.current) return;
      if (result === false) setError("Не удалось сохранить список. Выбор остаётся в форме — повторите попытку.");
      else onClose();
    } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : "Не удалось сохранить список сотрудников."); }
    finally { inFlight.current = false; if (mounted.current) setPending(false); }
  }

  return <><ModalShell title="Избранные сотрудники для назначений" subtitle="Выбор применяется одной операцией после сохранения. Общий справочник не меняется."
    className="assign-am-employee-picker" pending={pending} onClose={() => { if (!inFlight.current) requestClose(); }}
    actions={<>
      <Button disabled={pending || !draftIds.length} onClick={() => setDraftIds([])} variant="ghost">Очистить список</Button>
      <Button disabled={pending} onClick={requestClose} variant="ghost">Отмена</Button>
      <Button disabled={pending} onClick={() => void save()} variant="primary">{pending ? "Сохранение…" : "Сохранить список"}</Button>
    </>}>
    <div className="assign-am-picker-toolbar"><label><span>Поиск сотрудника</span>
      <input aria-label="Поиск сотрудников в избранном" disabled={pending} value={search} onChange={event => { setSearch(event.currentTarget.value); setPage(1); }} placeholder="ФИО, должность, подразделение" />
    </label><strong aria-live="polite">Найдено {filtered.length} из {employees.length} · добавлено {draftIds.length}</strong></div>
    {error ? <p className="field-error" role="alert">{error}</p> : null}
    <PaginationBar page={safePage} pageSize={pageSize} total={filtered.length} onPageChange={value => { if (!pending) setPage(value); }} onPageSizeChange={value => { if (!pending) { setPageSize(value); setPage(1); } }} />
    <div className="assign-am-picker-list">{visible.map(employee => {
      const selected = favoriteSet.has(employee.id);
      return <button disabled={pending} aria-label={`${employee.name}. ${employee.role}. ${employee.zone}. ${selected ? "Добавлен" : "Добавить"}`} aria-pressed={selected}
        className={`assign-am-picker-employee ${selected ? "selected" : ""}`} key={employee.id} type="button"
        onClick={() => setDraftIds(ids => selected ? ids.filter(id => id !== employee.id) : [...ids, employee.id])}>
        <span className="assign-am-avatar" aria-hidden="true">{employee.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("")}</span>
        <span><strong>{employee.name}</strong><small>{employee.role}</small><em>{employee.zone}</em></span><b>{selected ? "Добавлен" : "Добавить"}</b>
      </button>;
    })}</div>
    {!visible.length ? <div className="assign-am-picker-empty" role="status"><strong>{employees.length ? "Сотрудники не найдены" : "Сотрудников нет"}</strong>
      {query ? <Button onClick={() => setSearch("")} variant="ghost">Очистить поиск</Button> : null}</div> : null}
  </ModalShell>{discardDialog}</>;
}
