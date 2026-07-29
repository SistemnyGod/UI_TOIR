import { AlertCircle, BriefcaseBusiness, Clock3, Plus, Send, Wrench, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ApiError } from "../../../../api/client";
import type { EmuCreateShiftReportDto, EmuShiftReportCategory, EmuShiftType } from "../../../../api/emuShiftReportContracts";
import { ModalShell } from "../../../../shared/ui";
import type { useEmuShiftReportsWorkspace } from "../../../../hooks/useEmuShiftReportsWorkspace";
import {
  categoryLabels,
  createEmptyRows,
  createWorkRow,
  draftPrefix,
  formatDuration,
  getDraftKey,
  getDurationMinutes,
  isWorkRowUsed,
  localDate,
  shiftLabels,
  type WorkRow,
} from "../shiftReportUi";
import { ShiftReportWorkRow } from "./ShiftReportWorkRow";

type Workspace = ReturnType<typeof useEmuShiftReportsWorkspace>;
type Draft = { employeeId: string; reportDate: string; shiftType: EmuShiftType; rows: WorkRow[] };

function ensureFiveRows(rows: WorkRow[]) {
  return rows.length >= 5 ? rows : [...rows, ...Array.from({ length: 5 - rows.length }, createWorkRow)];
}

function readDraft(category: EmuShiftReportCategory): Draft | null {
  const pointer = localStorage.getItem(`${draftPrefix}.last.${category}`);
  if (!pointer) return null;
  try {
    const draft = JSON.parse(localStorage.getItem(pointer) ?? "null") as Draft | null;
    return draft ? { ...draft, rows: ensureFiveRows(draft.rows) } : null;
  } catch {
    localStorage.removeItem(pointer);
    localStorage.removeItem(`${draftPrefix}.last.${category}`);
    return null;
  }
}

export function ShiftReportEntryScreen({
  workspace,
  onNotify,
}: {
  workspace: Workspace;
  onNotify: (message: string) => void;
}) {
  const [category, setCategory] = useState<EmuShiftReportCategory>("mechanic");
  const [hydratedCategory, setHydratedCategory] = useState<EmuShiftReportCategory | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [reportDate, setReportDate] = useState(localDate());
  const [shiftType, setShiftType] = useState<EmuShiftType>("day");
  const [rows, setRows] = useState<WorkRow[]>(createEmptyRows);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [nightWarning, setNightWarning] = useState("");
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const options = workspace.options;
  const employees = useMemo(
    () => options?.employees.filter((item) => item.workerCategory === category) ?? [],
    [category, options],
  );
  const usedRows = rows.filter(isWorkRowUsed);
  const totalMinutes = usedRows.reduce((sum, item) => sum + getDurationMinutes(item), 0);
  const hasDraftData = Boolean(employeeId || rows.some(isWorkRowUsed));

  useEffect(() => {
    setHydratedCategory(null);
    const draft = readDraft(category);
    setEmployeeId(draft?.employeeId ?? "");
    setReportDate(draft?.reportDate ?? localDate());
    setShiftType(draft?.shiftType ?? "day");
    setRows(draft?.rows ?? createEmptyRows());
    setErrors({});
    setNightWarning("");
    setSuccessMessage("");
    setHydratedCategory(category);
  }, [category]);

  useEffect(() => {
    if (hydratedCategory !== category || (!employeeId && !rows.some(isWorkRowUsed))) return;
    const timer = window.setTimeout(() => {
      const key = getDraftKey(category, employeeId, reportDate, shiftType);
      localStorage.setItem(key, JSON.stringify({ employeeId, reportDate, shiftType, rows }));
      localStorage.setItem(`${draftPrefix}.last.${category}`, key);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [category, employeeId, hydratedCategory, reportDate, rows, shiftType]);

  function updateRow(id: string, patch: Partial<WorkRow>) {
    setRows((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
    setSuccessMessage("");
  }

  function switchCategory(value: EmuShiftReportCategory) {
    if (value === category) return;
    if (hasDraftData) {
      const key = getDraftKey(category, employeeId, reportDate, shiftType);
      localStorage.setItem(key, JSON.stringify({ employeeId, reportDate, shiftType, rows }));
      localStorage.setItem(`${draftPrefix}.last.${category}`, key);
    }
    setCategory(value);
  }

  function removeRow(index: number) {
    setRows((current) => index < 5
      ? current.map((item, rowIndex) => rowIndex === index ? createWorkRow() : item)
      : current.filter((_, rowIndex) => rowIndex !== index));
  }

  function chooseShift(value: EmuShiftType) {
    setShiftType(value);
    setNightWarning("");
    setSuccessMessage("");
    if (value !== "night") return;
    const night = options?.shifts.find((item) => item.shiftType === "night");
    if (!night) {
      setNightWarning("Шаблон ночной смены недоступен — проверьте дату вручную.");
      return;
    }
    if (night.crossesMidnight) {
      const [hour, minute] = night.endTime.split(":").map(Number);
      const now = new Date();
      if (now.getHours() * 60 + now.getMinutes() < hour * 60 + minute) {
        now.setDate(now.getDate() - 1);
        setReportDate(localDate(now));
      }
    }
  }

  function clearDraft() {
    const pointer = localStorage.getItem(`${draftPrefix}.last.${category}`);
    if (pointer) localStorage.removeItem(pointer);
    localStorage.removeItem(`${draftPrefix}.last.${category}`);
    setEmployeeId("");
    setReportDate(localDate());
    setShiftType("day");
    setRows(createEmptyRows());
    setErrors({});
    setNightWarning("");
    setShowClearDialog(false);
  }

  function focusFirstError(id: string) {
    window.requestAnimationFrame(() => document.getElementById(id)?.focus());
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const next: Record<string, string> = {};
    let firstFocusId = "";
    if (!employeeId) {
      next.employeeId = "Выберите сотрудника.";
      firstFocusId = "employeeId";
    }
    if (!reportDate) {
      next.reportDate = "Укажите дату отчёта.";
      firstFocusId ||= "reportDate";
    }
    if (!usedRows.length) {
      next.lines = "Добавьте хотя бы одну выполненную работу.";
      firstFocusId ||= "description-0";
    }
    usedRows.forEach((item) => {
      if (item.description.trim().length < 3) {
        next[`description-${item.id}`] = "Укажите название работы (минимум 3 символа).";
        firstFocusId ||= `description-${item.id}`;
      }
      const value = getDurationMinutes(item);
      if (value < 1 || value > 1440 || Number(item.minutes || 0) > 59) {
        next[`duration-${item.id}`] = "Укажите корректное время до 24 часов.";
        firstFocusId ||= `duration-${item.id}`;
      }
    });
    setErrors(next);
    setSuccessMessage("");
    if (firstFocusId) {
      if (firstFocusId === "description-0") firstFocusId = `description-${rows[0].id}`;
      focusFirstError(firstFocusId);
      return;
    }

    const payload: EmuCreateShiftReportDto = {
      employeeId,
      reportDate,
      shiftType,
      workerCategory: category,
      lines: usedRows.map((item) => ({
        workDescription: item.description.trim(),
        durationMinutes: getDurationMinutes(item),
        sectionId: item.sectionId || null,
        note: item.note.trim() || null,
      })),
    };
    setSubmitting(true);
    try {
      await workspace.create(payload);
      clearDraft();
      setSuccessMessage("Сменный отчёт отправлен и добавлен в историю.");
      onNotify("Сменный отчёт отправлен");
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        setErrors({ form: "Отчёт этого сотрудника за выбранную дату и смену уже существует." });
      } else {
        setErrors({ form: reason instanceof Error ? reason.message : "Не удалось отправить отчёт." });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="emu-shift-report-page">
      <header className="emu-shift-header">
        <div>
          <span>ЭМУ · сменный журнал</span>
          <h1>Сменный отчёт</h1>
          <p>Зафиксируйте выполненные за смену работы. Черновик сохраняется автоматически.</p>
        </div>
        <div className="emu-shift-kpis" aria-label="Сводка отчёта">
          <div><BriefcaseBusiness aria-hidden="true" size={18} /><b>{usedRows.length}</b><span>Работ</span></div>
          <div><Clock3 aria-hidden="true" size={18} /><b>{formatDuration(totalMinutes)}</b><span>Общее время</span></div>
        </div>
      </header>

      <form onSubmit={submit} className="emu-shift-card emu-shift-form" noValidate>
        <div className="emu-shift-tabs" role="tablist" aria-label="Категория сотрудников">
          {(["mechanic", "electrician"] as const).map((value) => (
            <button
              id={`shift-report-tab-${value}`}
              key={value}
              type="button"
              role="tab"
              aria-selected={category === value}
              aria-controls="shift-report-form-panel"
              tabIndex={category === value ? 0 : -1}
              className={category === value ? "active" : ""}
              onClick={() => switchCategory(value)}
            >
              {value === "mechanic" ? <Wrench aria-hidden="true" size={17} /> : <Zap aria-hidden="true" size={17} />}
              {categoryLabels[value]}
            </button>
          ))}
        </div>

        <div
          id="shift-report-form-panel"
          className="emu-shift-panel"
          role="tabpanel"
          aria-labelledby={`shift-report-tab-${category}`}
        >
          <div className="emu-shift-fields">
            <label>
              Сотрудник *
              <select
                id="employeeId"
                value={employeeId}
                onChange={(event) => { setEmployeeId(event.target.value); setSuccessMessage(""); }}
                aria-invalid={Boolean(errors.employeeId)}
                aria-describedby={errors.employeeId ? "employee-error" : employees.length ? undefined : "employee-empty-hint"}
              >
                <option value="">Выберите сотрудника</option>
                {employees.map((item) => <option key={item.id} value={item.id}>{item.fullName} · {item.position}</option>)}
              </select>
              {errors.employeeId ? <small id="employee-error">{errors.employeeId}</small> : null}
              {!employees.length ? <small id="employee-empty-hint" className="warning">Для этой профессии нет доступных сотрудников.</small> : null}
            </label>
            <label>
              Дата отчёта *
              <input
                id="reportDate"
                type="date"
                value={reportDate}
                onChange={(event) => { setReportDate(event.target.value); setSuccessMessage(""); }}
                aria-invalid={Boolean(errors.reportDate)}
                aria-describedby={errors.reportDate ? "report-date-error" : undefined}
              />
              {errors.reportDate ? <small id="report-date-error">{errors.reportDate}</small> : null}
            </label>
            <fieldset>
              <legend>Смена *</legend>
              <div className="emu-shift-segment" aria-label="Смена">
                {(["day", "night"] as const).map((value) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={shiftType === value}
                    className={shiftType === value ? "active" : ""}
                    onClick={() => chooseShift(value)}
                  >
                    {shiftLabels[value]}
                  </button>
                ))}
              </div>
              {nightWarning ? <small className="warning">{nightWarning}</small> : null}
            </fieldset>
          </div>

          {!options?.sections.length ? (
            <p className="emu-inline-notice">
              <AlertCircle aria-hidden="true" size={17} />
              Справочник участков пуст. Отчёт можно отправить без указания участка.
            </p>
          ) : null}

          <div className="emu-shift-table-wrap">
            <table className="emu-shift-table">
              <thead><tr><th>№</th><th>Выполненная работа *</th><th>Время *</th><th>Участок</th><th>Неисправность / примечание</th><th><span className="sr-only">Действия</span></th></tr></thead>
              <tbody>
                {rows.map((item, index) => (
                  <ShiftReportWorkRow
                    key={item.id}
                    index={index}
                    row={item}
                    sections={options?.sections ?? []}
                    errors={errors}
                    onChange={(patch) => updateRow(item.id, patch)}
                    onRemove={() => removeRow(index)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="emu-form-messages" aria-live="polite">
            {errors.lines ? <p className="emu-form-error">{errors.lines}</p> : null}
            {errors.form ? <p className="emu-form-error">{errors.form}</p> : null}
            {successMessage ? <p className="emu-form-success">{successMessage}</p> : null}
          </div>

          <footer className="emu-shift-actions">
            <button
              type="button"
              className="secondary add-row"
              disabled={rows.length >= 50 || submitting}
              onClick={() => setRows((current) => [...current, createWorkRow()])}
            >
              <Plus aria-hidden="true" size={18} />Добавить строку
            </button>
            <span className="emu-row-limit">{rows.length} из 50 строк</span>
            <button type="button" className="secondary" disabled={submitting || !hasDraftData} onClick={() => setShowClearDialog(true)}>Очистить</button>
            <button type="submit" className="primary" disabled={submitting || !employees.length}>
              <Send aria-hidden="true" size={18} />
              {submitting ? "Отправляем…" : "Отправить отчёт"}
            </button>
          </footer>
        </div>
      </form>

      {showClearDialog ? (
        <ModalShell
          className="emu-shift-confirm-dialog"
          title="Очистить черновик?"
          subtitle="Все заполненные строки текущей вкладки будут удалены."
          onClose={() => setShowClearDialog(false)}
          actions={(
            <>
              <button type="button" className="button ghost" onClick={() => setShowClearDialog(false)}>Отмена</button>
              <button type="button" className="button danger" onClick={clearDraft}>Очистить</button>
            </>
          )}
        >
          <p>Черновик {categoryLabels[category].toLowerCase()} нельзя будет восстановить после очистки.</p>
        </ModalShell>
      ) : null}
    </main>
  );
}
