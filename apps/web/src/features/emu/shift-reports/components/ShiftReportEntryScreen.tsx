import { BriefcaseBusiness, Clock3 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../../../../api/client';
import type { EmuCreateShiftReportDto, EmuShiftReportCategory, EmuShiftType } from '../../../../api/emuShiftReportContracts';
import type { useEmuShiftReportsWorkspace } from '../../../../hooks/useEmuShiftReportsWorkspace';
import { ModalShell } from '../../../../shared/ui';
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
  type WorkRow,
} from '../shiftReportUi';
import { ShiftReportForm } from './ShiftReportForm';

type Workspace = ReturnType<typeof useEmuShiftReportsWorkspace>;
type Draft = { employeeId: string; reportDate: string; shiftType: EmuShiftType; rows: WorkRow[] };
type DraftStatus = 'idle' | 'saving' | 'saved' | 'restored' | 'error';
type StoredDraft = Draft & { version: 1 };

function ensureFiveRows(rows: WorkRow[]) {
  return rows.length >= 5 ? rows : [...rows, ...Array.from({ length: 5 - rows.length }, createWorkRow)];
}

function readDraft(category: EmuShiftReportCategory): Draft | null {
  try {
    const pointer = localStorage.getItem(`${draftPrefix}.last.${category}`);
    if (!pointer) return null;
    const draft = JSON.parse(localStorage.getItem(pointer) ?? 'null') as Draft | null;
    if (!draft || !Array.isArray(draft.rows)) return null;
    return { ...draft, rows: ensureFiveRows(draft.rows) };
  } catch {
    return null;
  }
}

function writeDraft(category: EmuShiftReportCategory, employeeId: string, reportDate: string, shiftType: EmuShiftType, rows: WorkRow[]) {
  try {
    const key = getDraftKey(category, employeeId, reportDate, shiftType);
    const value: StoredDraft = { version: 1, employeeId, reportDate, shiftType, rows };
    localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem(`${draftPrefix}.last.${category}`, key);
    return true;
  } catch {
    return false;
  }
}

function removeDraft(category: EmuShiftReportCategory) {
  try {
    const pointer = localStorage.getItem(`${draftPrefix}.last.${category}`);
    if (pointer) localStorage.removeItem(pointer);
    localStorage.removeItem(`${draftPrefix}.last.${category}`);
  } catch {
    // Storage can be unavailable in private browsing; the form remains usable.
  }
}

export function ShiftReportEntryScreen({ workspace, onNotify }: { workspace: Workspace; onNotify: (message: string) => void }) {
  const submitLockRef = useRef(false);
  const [category, setCategory] = useState<EmuShiftReportCategory>('mechanic');
  const [hydratedCategory, setHydratedCategory] = useState<EmuShiftReportCategory | null>(null);
  const [employeeId, setEmployeeId] = useState('');
  const [reportDate, setReportDate] = useState(localDate());
  const [shiftType, setShiftType] = useState<EmuShiftType>('day');
  const [rows, setRows] = useState<WorkRow[]>(createEmptyRows);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [nightWarning, setNightWarning] = useState('');
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [draftStatus, setDraftStatus] = useState<DraftStatus>('idle');
  const [draftSavedAt, setDraftSavedAt] = useState('');

  const options = workspace.options;
  const employees = useMemo(() => options?.employees.filter((item) => item.workerCategory === category) ?? [], [category, options]);
  const usedRows = rows.filter(isWorkRowUsed);
  const totalMinutes = usedRows.reduce((sum, item) => sum + getDurationMinutes(item), 0);
  const hasDraftData = Boolean(employeeId || rows.some(isWorkRowUsed));

  useEffect(() => {
    setHydratedCategory(null);
    const draft = readDraft(category);
    setEmployeeId(draft?.employeeId ?? '');
    setReportDate(draft?.reportDate ?? localDate());
    setShiftType(draft?.shiftType ?? 'day');
    setRows(draft?.rows ?? createEmptyRows());
    setErrors({});
    setNightWarning('');
    setSuccessMessage('');
    setDraftStatus(draft ? 'restored' : 'idle');
    setDraftSavedAt('');
    setHydratedCategory(category);
  }, [category]);

  useEffect(() => {
    if (hydratedCategory !== category || (!employeeId && !rows.some(isWorkRowUsed))) return;
    setDraftStatus('saving');
    const timer = window.setTimeout(() => {
      const saved = writeDraft(category, employeeId, reportDate, shiftType, rows);
      setDraftStatus(saved ? 'saved' : 'error');
      if (saved) setDraftSavedAt(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [category, employeeId, hydratedCategory, reportDate, rows, shiftType]);

  useEffect(() => {
    if (hydratedCategory !== category || (!employeeId && !rows.some(isWorkRowUsed))) return;
    const flushDraft = () => {
      writeDraft(category, employeeId, reportDate, shiftType, rows);
    };
    window.addEventListener('beforeunload', flushDraft);
    window.addEventListener('pagehide', flushDraft);
    return () => {
      window.removeEventListener('beforeunload', flushDraft);
      window.removeEventListener('pagehide', flushDraft);
    };
  }, [category, employeeId, hydratedCategory, reportDate, rows, shiftType]);

  function updateRow(id: string, patch: Partial<WorkRow>) {
    setRows((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
    setSuccessMessage('');
  }

  function switchCategory(value: EmuShiftReportCategory) {
    if (value === category) return;
    if (hasDraftData) {
      const saved = writeDraft(category, employeeId, reportDate, shiftType, rows);
      setDraftStatus(saved ? 'saved' : 'error');
    }
    setCategory(value);
  }

  function removeRow(index: number) {
    setRows((current) => index < 5 ? current.map((item, rowIndex) => rowIndex === index ? createWorkRow() : item) : current.filter((_, rowIndex) => rowIndex !== index));
  }

  function chooseShift(value: EmuShiftType) {
    setShiftType(value);
    setNightWarning('');
    setSuccessMessage('');
    if (value !== 'night') return;
    const night = options?.shifts.find((item) => item.shiftType === 'night');
    if (!night) {
      setNightWarning('Шаблон ночной смены недоступен — проверьте дату вручную.');
      return;
    }
    if (night.crossesMidnight) {
      const [hour, minute] = night.endTime.split(':').map(Number);
      const now = new Date();
      if (now.getHours() * 60 + now.getMinutes() < hour * 60 + minute) {
        now.setDate(now.getDate() - 1);
        setReportDate(localDate(now));
      }
    }
  }

  function clearDraft() {
    removeDraft(category);
    setEmployeeId('');
    setReportDate(localDate());
    setShiftType('day');
    setRows(createEmptyRows());
    setErrors({});
    setNightWarning('');
    setDraftStatus('idle');
    setDraftSavedAt('');
    setShowClearDialog(false);
  }

  function focusFirstError(id: string) {
    window.requestAnimationFrame(() => document.getElementById(id)?.focus());
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || submitLockRef.current) return;
    const next: Record<string, string> = {};
    let firstFocusId = '';
    if (!employeeId) {
      next.employeeId = 'Выберите сотрудника.';
      firstFocusId = 'employeeId';
    }
    if (!reportDate) {
      next.reportDate = 'Укажите дату отчёта.';
      firstFocusId ||= 'reportDate';
    }
    if (!usedRows.length) {
      next.lines = 'Добавьте хотя бы одну выполненную работу.';
      firstFocusId ||= 'description-0';
    }
    usedRows.forEach((item) => {
      if (item.description.trim().length < 3) {
        next[`description-${item.id}`] = 'Укажите название работы (минимум 3 символа).';
        firstFocusId ||= `description-${item.id}`;
      }
      const value = getDurationMinutes(item);
      if (value < 1 || value > 1440 || Number(item.minutes || 0) > 59) {
        next[`duration-${item.id}`] = 'Укажите корректное время до 24 часов.';
        firstFocusId ||= `duration-${item.id}`;
      }
    });
    setErrors(next);
    setSuccessMessage('');
    if (firstFocusId) {
      if (firstFocusId === 'description-0') firstFocusId = `description-${rows[0].id}`;
      focusFirstError(firstFocusId);
      return;
    }

    const payload: EmuCreateShiftReportDto = {
      employeeId,
      reportDate,
      shiftType,
      workerCategory: category,
      lines: usedRows.map((item) => ({ workDescription: item.description.trim(), durationMinutes: getDurationMinutes(item), sectionId: item.sectionId || null, note: item.note.trim() || null })),
    };
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      await workspace.create(payload);
      clearDraft();
      setSuccessMessage('Сменный отчёт отправлен и добавлен в историю.');
      onNotify('Сменный отчёт отправлен');
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) setErrors({ form: 'Отчёт этого сотрудника за выбранную дату и смену уже существует.' });
      else setErrors({ form: reason instanceof Error ? reason.message : 'Не удалось отправить отчёт.' });
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <main className='emu-shift-report-page'>
      <header className='emu-shift-header'>
        <div>
          <span>ЭМУ · сменный журнал</span>
          <h1>Сменный отчёт</h1>
          <p>Зафиксируйте выполненные за смену работы. Черновик сохраняется автоматически.</p>
          <div className={`emu-draft-status is-${draftStatus}`} role='status' aria-live='polite'>
            <span className='emu-draft-status-dot' aria-hidden='true' />
            {draftStatus === 'saving' ? 'Сохраняем черновик…' : null}
            {draftStatus === 'saved' ? `Черновик сохранён${draftSavedAt ? ` в ${draftSavedAt}` : ''}` : null}
            {draftStatus === 'restored' ? 'Черновик восстановлен после обновления' : null}
            {draftStatus === 'error' ? 'Черновик не сохранён — проверьте настройки браузера' : null}
            {draftStatus === 'idle' ? 'Изменения сохраняются локально' : null}
          </div>
        </div>
        <div className='emu-shift-kpis' aria-label='Сводка отчёта'>
          <div><BriefcaseBusiness aria-hidden='true' size={18} /><b>{usedRows.length}</b><span>Работ</span></div>
          <div><Clock3 aria-hidden='true' size={18} /><b>{formatDuration(totalMinutes)}</b><span>Общее время</span></div>
        </div>
      </header>

      <ShiftReportForm
        category={category}
        employeeId={employeeId}
        reportDate={reportDate}
        shiftType={shiftType}
        rows={rows}
        errors={errors}
        employees={employees}
        sections={options?.sections ?? []}
        nightWarning={nightWarning}
        successMessage={successMessage}
        submitting={submitting}
        hasDraftData={hasDraftData}
        onSubmit={submit}
        onSwitchCategory={switchCategory}
        onEmployeeChange={(value) => { setEmployeeId(value); setSuccessMessage(''); }}
        onDateChange={(value) => { setReportDate(value); setSuccessMessage(''); }}
        onChooseShift={chooseShift}
        onUpdateRow={updateRow}
        onRemoveRow={removeRow}
        onAddRow={() => setRows((current) => [...current, createWorkRow()])}
        onRequestClear={() => setShowClearDialog(true)}
      />

      {showClearDialog ? <ModalShell className='emu-shift-confirm-dialog' title='Очистить черновик?' subtitle='Все заполненные строки текущей вкладки будут удалены.' onClose={() => setShowClearDialog(false)} actions={<><button type='button' className='button ghost' onClick={() => setShowClearDialog(false)}>Отмена</button><button type='button' className='button danger' onClick={clearDraft}>Очистить</button></>}><p>Черновик {categoryLabels[category].toLowerCase()} нельзя будет восстановить после очистки.</p></ModalShell> : null}
    </main>
  );
}
