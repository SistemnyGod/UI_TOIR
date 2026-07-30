import { BriefcaseBusiness, Clock3 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../../../api/client';
import type { EmuCreateShiftReportDto, EmuShiftReportCategory, EmuShiftReportEmployeeOptionDto, EmuShiftType } from '../../../../api/emuShiftReportContracts';
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
import { ShiftReportReminder } from './ShiftReportReminder';


type Workspace = ReturnType<typeof useEmuShiftReportsWorkspace>;
type Draft = { employeeId: string; reportDate: string; shiftType: EmuShiftType; rows: WorkRow[] };
type DraftSnapshot = Draft & { category: EmuShiftReportCategory };
type DraftStatus = 'idle' | 'saving' | 'saved' | 'restored' | 'error';
type StoredDraft = Draft & { version: 1 };

function ensureFiveRows(rows: WorkRow[]) {
  return rows.length >= 5 ? rows : [...rows, ...Array.from({ length: 5 - rows.length }, createWorkRow)];
}

function isDraftRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeWorkRow(value: unknown): WorkRow | null {
  if (!isDraftRecord(value)) return null;
  const row = value as Record<string, unknown>;
  const fallback = createWorkRow();
  return {
    id: typeof row.id === 'string' && row.id ? row.id : fallback.id,
    description: typeof row.description === 'string' ? row.description : '',
    hours: typeof row.hours === 'string' ? row.hours : '',
    minutes: typeof row.minutes === 'string' ? row.minutes : '',
    sectionId: typeof row.sectionId === 'string' ? row.sectionId : '',
    note: typeof row.note === 'string' ? row.note : '',
  };
}

function parseDraft(raw: string | null): Draft | null {
  try {
    const stored = JSON.parse(raw ?? 'null') as unknown;
    if (!isDraftRecord(stored) || stored.version !== 1 || !Array.isArray(stored.rows)) return null;
    const rows = stored.rows.map(normalizeWorkRow).filter((row): row is WorkRow => row !== null);
    if (stored.rows.length > 0 && rows.length === 0) return null;
    return {
      employeeId: typeof stored.employeeId === 'string' ? stored.employeeId : '',
      reportDate: typeof stored.reportDate === 'string' && stored.reportDate ? stored.reportDate : localDate(),
      shiftType: stored.shiftType === 'night' ? 'night' : 'day',
      rows: ensureFiveRows(rows),
    };
  } catch {
    return null;
  }
}

function readDraft(category: EmuShiftReportCategory): Draft | null {
  try {
    if (typeof window === 'undefined') return null;
    const pointer = window.localStorage.getItem(`${draftPrefix}.last.${category}`);
    const candidates = [
      pointer?.startsWith(`${draftPrefix}.${category}.`) ? window.localStorage.getItem(pointer) : null,
      window.localStorage.getItem(`${draftPrefix}.recovery.${category}`),
    ];
    for (const raw of candidates) {
      const draft = parseDraft(raw);
      if (draft) return draft;
    }
    return null;
  } catch {
    return null;
  }
}

function writeDraft(category: EmuShiftReportCategory, employeeId: string, reportDate: string, shiftType: EmuShiftType, rows: WorkRow[]) {
  try {
    if (typeof window === 'undefined') return false;
    const key = getDraftKey(category, employeeId, reportDate, shiftType);
    const value: StoredDraft & { savedAt: string } = {
      version: 1,
      employeeId,
      reportDate,
      shiftType,
      rows: rows.map(normalizeWorkRow).filter((row): row is WorkRow => row !== null),
      savedAt: new Date().toISOString(),
    };
    const serialized = JSON.stringify(value);
    window.localStorage.setItem(key, serialized);
    window.localStorage.setItem(`${draftPrefix}.recovery.${category}`, serialized);
    window.localStorage.setItem(`${draftPrefix}.last.${category}`, key);
    return true;
  } catch {
    return false;
  }
}

function removeDraft(category: EmuShiftReportCategory) {
  try {
    if (typeof window === 'undefined') return;
    const pointer = window.localStorage.getItem(`${draftPrefix}.last.${category}`);
    if (pointer?.startsWith(`${draftPrefix}.${category}.`)) window.localStorage.removeItem(pointer);
    window.localStorage.removeItem(`${draftPrefix}.recovery.${category}`);
    window.localStorage.removeItem(`${draftPrefix}.last.${category}`);
  } catch {
    // Storage can be unavailable in private browsing; the form remains usable.
  }
}export function ShiftReportEntryScreen({ workspace, onNotify, canManageFavorites }: { workspace: Workspace; onNotify: (message: string) => void; canManageFavorites: boolean }) {
  const submitLockRef = useRef(false);
  const draftTimerRef = useRef<number | null>(null);
  const latestDraftRef = useRef<DraftSnapshot | null>(null);
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
  const [showDirectoryDialog, setShowDirectoryDialog] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [draftStatus, setDraftStatus] = useState<DraftStatus>('idle');
  const [draftSavedAt, setDraftSavedAt] = useState('');

  const options = workspace.options;
  const employees = options?.employees ?? [];
  const usedRows = rows.filter(isWorkRowUsed);
  const totalMinutes = usedRows.reduce((sum, item) => sum + getDurationMinutes(item), 0);
  const hasDraftData = Boolean(employeeId || rows.some(isWorkRowUsed) || reportDate !== localDate() || shiftType !== 'day');

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
    if (hydratedCategory !== category) return;

    const snapshot: DraftSnapshot | null = hasDraftData
      ? {
          category,
          employeeId,
          reportDate,
          shiftType,
          rows: rows.map((row) => ({ ...row })),
        }
      : null;
    latestDraftRef.current = snapshot;

    if (draftTimerRef.current !== null) {
      window.clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
    if (!snapshot) {
      removeDraft(category);
      setDraftStatus('idle');
      setDraftSavedAt('');
      return;
    }

    setDraftStatus('saving');
    const timer = window.setTimeout(() => {
      draftTimerRef.current = null;
      const current = latestDraftRef.current;
      if (!current) return;
      const saved = writeDraft(current.category, current.employeeId, current.reportDate, current.shiftType, current.rows);
      setDraftStatus(saved ? 'saved' : 'error');
      if (saved) setDraftSavedAt(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
    }, 250);
    draftTimerRef.current = timer;

    return () => {
      window.clearTimeout(timer);
      if (draftTimerRef.current === timer) draftTimerRef.current = null;
    };
  }, [category, employeeId, hydratedCategory, reportDate, rows, shiftType, hasDraftData]);

  useEffect(() => {
    const flushDraft = () => {
      if (draftTimerRef.current !== null) {
        window.clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
      const snapshot = latestDraftRef.current;
      if (snapshot) {
        writeDraft(snapshot.category, snapshot.employeeId, snapshot.reportDate, snapshot.shiftType, snapshot.rows);
      }
    };

    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') flushDraft();
    };
    window.addEventListener('beforeunload', flushDraft);
    window.addEventListener('pagehide', flushDraft);
    document.addEventListener('visibilitychange', flushWhenHidden);
    return () => {
      window.removeEventListener('beforeunload', flushDraft);
      window.removeEventListener('pagehide', flushDraft);
      document.removeEventListener('visibilitychange', flushWhenHidden);
      flushDraft();
    };
  }, []);
  useEffect(() => {
    if (!hasDraftData || !navigator.storage?.persist) return;
    void navigator.storage.persist().catch(() => false);
  }, [hasDraftData]);
  function openDirectory() {
    setShowDirectoryDialog(true);
    void workspace.loadFavorites();
  }

  function selectDirectoryEmployee(employee: EmuShiftReportEmployeeOptionDto) {
    setEmployeeId(employee.id);
    setSuccessMessage('');
    setShowDirectoryDialog(false);
  }
  function updateRow(id: string, patch: Partial<WorkRow>) {
    setRows((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
    setSuccessMessage('');
  }

  function switchCategory(value: EmuShiftReportCategory) {
    if (value === category) return;
    if (draftTimerRef.current !== null) {
      window.clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
    if (hasDraftData) {
      const snapshot: DraftSnapshot = {
        category,
        employeeId,
        reportDate,
        shiftType,
        rows: rows.map((row) => ({ ...row })),
      };
      latestDraftRef.current = snapshot;
      const saved = writeDraft(snapshot.category, snapshot.employeeId, snapshot.reportDate, snapshot.shiftType, snapshot.rows);
      setDraftStatus(saved ? 'saved' : 'error');
    } else {
      latestDraftRef.current = null;
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
    if (draftTimerRef.current !== null) {
      window.clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
    latestDraftRef.current = null;
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
    <main className='emu-shift-report-page emu-entry-page'>
      <header className='emu-shift-header'>
        <div>
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
        favoriteEmployees={workspace.favoriteEmployees}
        favoriteLoading={workspace.favoritesLoading}
        favoriteError={workspace.favoritesError}
        canManageFavorites={canManageFavorites}
        directoryOpen={showDirectoryDialog}
        onOpenDirectory={openDirectory}
        onCloseDirectory={() => setShowDirectoryDialog(false)}
        onAddFavoriteEmployee={(id) => workspace.addFavoriteEmployee({ employeeId: id })}
        onRemoveFavoriteEmployee={(id) => workspace.removeFavoriteEmployee(id)}
        onSetEmployeeCategory={(id, workerCategory) => workspace.setEmployeeCategory(id, { workerCategory })}
        onSelectDirectoryEmployee={selectDirectoryEmployee}
        onManageFavorites={openDirectory}
        onRetryFavorites={() => void workspace.loadFavorites()}
        nightWarning={nightWarning}
        successMessage={successMessage}
        submitting={submitting}
        hasDraftData={hasDraftData}
        reminder={<ShiftReportReminder />}
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
