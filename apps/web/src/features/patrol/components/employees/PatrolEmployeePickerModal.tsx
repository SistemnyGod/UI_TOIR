import { useEffect, useMemo, useRef, useState } from "react";
import { Button, ModalShell, PaginationBar, useDialogCloseGuard, type PageSizeOption } from "../../../../shared/ui";
import type { EmployeeDirectoryItem } from "../../../../types";

export function PatrolEmployeePickerModal({
  allEmployees,
  initialSelectedIds,
  isSaving = false,
  onApply,
  onClose,
}: {
  allEmployees: EmployeeDirectoryItem[];
  initialSelectedIds: string[];
  isSaving?: boolean;
  onApply: (ids: string[]) => Promise<boolean> | boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [draftIds, setDraftIds] = useState(() => Array.from(new Set(initialSelectedIds)));
  const [isApplying, setIsApplying] = useState(false);
  const applyingRef = useRef(false);
  const mounted = useRef(true);
  const initialIds = useRef([...draftIds].sort().join("\n"));
  const pending = isApplying || isSaving;
  const { requestClose, discardDialog } = useDialogCloseGuard({ dirty: [...draftIds].sort().join("\n") !== initialIds.current, pending, onClose });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(50);
  const selectedSet = useMemo(() => new Set(draftIds), [draftIds]);
  const visibleEmployees = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return allEmployees
      .filter((employee) => {
        if (!normalizedQuery) return true;
        return [employee.fullName, employee.personnelNo, employee.position, employee.department, employee.employeeGroup]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      });
  }, [allEmployees, query]);
  const safePage = Math.min(page, Math.max(1, Math.ceil(visibleEmployees.length / pageSize)));
  const pageEmployees = visibleEmployees.slice((safePage - 1) * pageSize, safePage * pageSize);

  function toggle(employeeId: string) {
    setDraftIds((current) =>
      current.includes(employeeId) ? current.filter((id) => id !== employeeId) : [...current, employeeId],
    );
  }

  async function applySelection() {
    if (applyingRef.current || isSaving) return;
    applyingRef.current = true;
    setError("");
    setIsApplying(true);
    try {
      const applied = await onApply(draftIds);
      if (!mounted.current) return;
      if (applied) onClose();
      else setError("Не удалось сохранить список. Выбор сохранён в форме — повторите попытку.");
    } catch (error) {
      if (!mounted.current) return;
      setError(error instanceof Error ? error.message : "Не удалось сохранить список сотрудников.");
    } finally {
      applyingRef.current = false;
      if (mounted.current) setIsApplying(false);
    }
  }

  return (
    <><ModalShell
      className="patrol-employee-picker-modal"
      title="Сотрудники для обходов"
      subtitle="Выберите сотрудников из общего справочника. Изменения применятся одной операцией после сохранения."
      onClose={() => { if (!applyingRef.current) requestClose(); }}
      pending={pending}
      actions={(
        <>
          <Button disabled={pending || draftIds.length === 0} onClick={() => setDraftIds([])} variant="ghost">
            Очистить выбор
          </Button>
          <Button disabled={pending} onClick={requestClose} variant="ghost">Отмена</Button>
          <Button disabled={pending} isLoading={pending} onClick={applySelection} variant="primary">
            Сохранить список
          </Button>
        </>
      )}
    >
        <div className="patrol-employee-picker-toolbar">
          <label>
            Поиск
            <input
              autoFocus
              disabled={pending}
              value={query}
              onChange={(event) => { setQuery(event.currentTarget.value); setPage(1); }}
              placeholder="ФИО, табельный номер, должность, подразделение"
            />
          </label>
          <strong>{draftIds.length} выбрано из {allEmployees.length}</strong>
        </div>
        {error ? <p className="employee-form-error" role="alert">{error}</p> : null}
        <PaginationBar page={safePage} pageSize={pageSize} total={visibleEmployees.length} onPageChange={value => { if (!pending) setPage(value); }} onPageSizeChange={value => { if (!pending) { setPageSize(value); setPage(1); } }} />

        <div className="patrol-employee-picker-list">
          {pageEmployees.length > 0 ? pageEmployees.map((employee) => {
            const selected = selectedSet.has(employee.id);
            return (
              <button
                aria-pressed={selected}
                aria-label={`${employee.fullName} — ${selected ? "Выбран" : "Выбрать"}`}
                disabled={pending}
                className={`patrol-employee-picker-row ${selected ? "selected" : ""}`}
                key={employee.id}
                onClick={() => toggle(employee.id)}
                type="button"
              >
                <span className="avatar small">{employee.initials}</span>
                <span>
                  <strong>{employee.fullName}</strong>
                  <small>{employee.position}</small>
                  <em>{employee.department || employee.zone || "Без подразделения"}</em>
                </span>
                <b>{selected ? "Выбран" : "Выбрать"}</b>
              </button>
            );
          }) : <p className="patrol-employee-picker-empty">По запросу сотрудники не найдены.</p>}
        </div>

    </ModalShell>{discardDialog}</>
  );
}

