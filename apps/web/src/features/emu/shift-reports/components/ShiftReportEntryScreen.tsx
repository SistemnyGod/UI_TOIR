import { Bell, BriefcaseBusiness, Clock3 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../../../api/client';
import type { EmuCreateShiftReportDto, EmuShiftReportCategory, EmuShiftReportEmployeeOptionDto, EmuShiftType } from '../../../../api/emuShiftReportContracts';
import type { useEmuShiftReportsWorkspace } from '../../../../hooks/useEmuShiftReportsWorkspace';
import { Button, ModalShell, PageHeader } from '../../../../shared/ui';
import { createClientUuid } from '../../../../shared/clientUuid';
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

function draftOwnerPrefix(userId: string) {
  return `${draftPrefix}.user.${userId}`;
}

function readDraft(category: EmuShiftReportCategory, userId: string): Draft | null {
  try {
    if (typeof window === 'undefined') return null;
    const ownerPrefix = draftOwnerPrefix(userId);
    const pointer = window.localStorage.getItem(`${ownerPrefix}.last.${category}`);
    const candidates = [
      pointer?.startsWith(`${ownerPrefix}.${category}.`) ? window.localStorage.getItem(pointer) : null,
      window.localStorage.getItem(`${ownerPrefix}.recovery.${category}`),
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

function writeDraft(category: EmuShiftReportCategory, employeeId: string, reportDate: string, shiftType: EmuShiftType, rows: WorkRow[], userId: string) {
  try {
    if (typeof window === 'undefined') return false;
    const ownerPrefix = draftOwnerPrefix(userId);
    const key = getDraftKey(category, employeeId, reportDate, shiftType, userId);
    const value: StoredDraft & { savedAt: string } = {
      version: 1, employeeId, reportDate, shiftType,
      rows: rows.map(normalizeWorkRow).filter((row): row is WorkRow => row !== null),
      savedAt: new Date().toISOString(),
    };
    const serialized = JSON.stringify(value);
    window.localStorage.setItem(key, serialized);
    window.localStorage.setItem(`${ownerPrefix}.recovery.${category}`, serialized);
    window.localStorage.setItem(`${ownerPrefix}.last.${category}`, key);
    return true;
  } catch {
    return false;
  }
}

function removeDraft(category: EmuShiftReportCategory, userId: string) {
  try {
    if (typeof window === 'undefined') return;
    const ownerPrefix = draftOwnerPrefix(userId);
    const pointer = window.localStorage.getItem(`${ownerPrefix}.last.${category}`);
    if (pointer?.startsWith(`${ownerPrefix}.${category}.`)) window.localStorage.removeItem(pointer);
    window.localStorage.removeItem(`${ownerPrefix}.recovery.${category}`);
    window.localStorage.removeItem(`${ownerPrefix}.last.${category}`);
  } catch {
    // Storage can be unavailable in private browsing; the form remains usable.
  }
}

function getEditorInstanceId() {
  const key = 'patrol360.emu.shift-report.editor-instance.v1';
  try {
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const value = createClientUuid();
    window.sessionStorage.setItem(key, value);
    return value;
  } catch {
    return createClientUuid();
  }
}

export function ShiftReportEntryScreen({ workspace, currentUserId, onNotify, canManageFavorites }: { workspace: Workspace; currentUserId: string; onNotify: (message: string) => void; canManageFavorites: boolean }) {
  const submitLockRef = useRef(false);
  const draftTimerRef = useRef<number | null>(null);
  const latestDraftRef = useRef<DraftSnapshot | null>(null);
  const editorInstanceIdRef = useRef(getEditorInstanceId());
  const serverVersionsRef = useRef<Record<string, number>>({});
  const serverSaveChainRef = useRef<Promise<void>>(Promise.resolve());
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
  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [pendingRowRemoval, setPendingRowRemoval] = useState<number | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [draftStatus, setDraftStatus] = useState<DraftStatus>('idle');
  const [draftSavedAt, setDraftSavedAt] = useState('');
  const [draftConflict, setDraftConflict] = useState('');
  const [coordinationMessage, setCoordinationMessage] = useState('');

  const options = workspace.options;
  const employees = options?.employees ?? [];
  const usedRows = rows.filter(isWorkRowUsed);
  const totalMinutes = usedRows.reduce((sum, item) => sum + getDurationMinutes(item), 0);
  const hasDraftData = Boolean(employeeId || rows.some(isWorkRowUsed) || reportDate !== localDate() || shiftType !== 'day');

  function slotKey(snapshot: Pick<DraftSnapshot, 'employeeId' | 'reportDate' | 'shiftType'>) {
    return `${snapshot.employeeId}.${snapshot.reportDate}.${snapshot.shiftType}`;
  }

  async function persistServerDraft(snapshot: DraftSnapshot) {
    if (!snapshot.employeeId) return true;
    const key = slotKey(snapshot);
    try {
      const result = await workspace.saveDraft({
        employeeId: snapshot.employeeId, reportDate: snapshot.reportDate, shiftType: snapshot.shiftType,
        workerCategory: snapshot.category, editorInstanceId: editorInstanceIdRef.current,
        expectedVersion: serverVersionsRef.current[key] ?? null,
        payloadJson: JSON.stringify({ version: 1, employeeId: snapshot.employeeId, reportDate: snapshot.reportDate, shiftType: snapshot.shiftType, rows: snapshot.rows }),
      });
      serverVersionsRef.current[key] = result.version;
      if (latestDraftRef.current && slotKey(latestDraftRef.current) === key) {
        setDraftConflict('');
        setCoordinationMessage(`Серверный черновик защищён до ${new Date(result.leaseExpiresAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`);
      }
      return true;
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        const message = reason.problem?.detail || 'Этот отчёт уже редактируют на другом компьютере или во вкладке.';
        if (latestDraftRef.current && slotKey(latestDraftRef.current) === key) setDraftConflict(message);
        return false;
      }
      if (latestDraftRef.current && slotKey(latestDraftRef.current) === key) setCoordinationMessage('Локальная копия сохранена. Серверная защита временно недоступна.');
      return true;
    }
  }

  function queueServerDraft(snapshot: DraftSnapshot) {
    serverSaveChainRef.current = serverSaveChainRef.current.then(async () => { await persistServerDraft(snapshot); });
  }

  function releaseCurrentServerDraft() {
    const snapshot = latestDraftRef.current;
    if (!snapshot?.employeeId) return;
    const key = slotKey(snapshot);
    delete serverVersionsRef.current[key];
    setDraftConflict('');
    setCoordinationMessage('');
    void workspace.releaseDraft({ employeeId: snapshot.employeeId, reportDate: snapshot.reportDate, shiftType: snapshot.shiftType, editorInstanceId: editorInstanceIdRef.current }).catch(() => undefined);
  }

  useEffect(() => {
    setHydratedCategory(null);
    const draft = readDraft(category, currentUserId);
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
  }, [category, currentUserId]);

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
      removeDraft(category, currentUserId);
      setDraftStatus('idle');
      setDraftSavedAt('');
      return;
    }

    setDraftStatus('saving');
    const timer = window.setTimeout(() => {
      draftTimerRef.current = null;
      const current = latestDraftRef.current;
      if (!current) return;
      const saved = writeDraft(current.category, current.employeeId, current.reportDate, current.shiftType, current.rows, currentUserId);
      setDraftStatus(saved ? 'saved' : 'error');
      if (saved) {
        setDraftSavedAt(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
        queueServerDraft(current);
      }
    }, 250);
    draftTimerRef.current = timer;

    return () => {
      window.clearTimeout(timer);
      if (draftTimerRef.current === timer) draftTimerRef.current = null;
    };
  }, [category, currentUserId, employeeId, hydratedCategory, reportDate, rows, shiftType, hasDraftData]);

  useEffect(() => {
    const flushDraft = () => {
      if (draftTimerRef.current !== null) {
        window.clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
      const snapshot = latestDraftRef.current;
      if (snapshot) {
        writeDraft(snapshot.category, snapshot.employeeId, snapshot.reportDate, snapshot.shiftType, snapshot.rows, currentUserId);
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
  useEffect(() => {
    const timer = window.setInterval(() => {
      const snapshot = latestDraftRef.current;
      if (snapshot?.employeeId) queueServerDraft(snapshot);
    }, 45_000);
    return () => window.clearInterval(timer);
  }, []);

  function openDirectory() {
    setShowDirectoryDialog(true);
    void workspace.loadFavorites();
  }

  function selectDirectoryEmployee(employee: EmuShiftReportEmployeeOptionDto) {
    if (employee.workerCategory && employee.workerCategory !== category) {
      onNotify('Сотрудник относится к группе «' + categoryLabels[employee.workerCategory] + '». Переключите вкладку отчёта.');
      return;
    }
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
    releaseCurrentServerDraft();
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
      const saved = writeDraft(snapshot.category, snapshot.employeeId, snapshot.reportDate, snapshot.shiftType, snapshot.rows, currentUserId);
      setDraftStatus(saved ? 'saved' : 'error');
    } else {
      latestDraftRef.current = null;
    }
    setCategory(value);
  }

  function deleteRow(index: number) {
    setRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
    setPendingRowRemoval(null);
  }

  function removeRow(index: number) {
    const row = rows[index];
    if (!row) return;
    if (isWorkRowUsed(row)) {
      setPendingRowRemoval(index);
      return;
    }
    deleteRow(index);
  }

  function confirmRowRemoval() {
    if (pendingRowRemoval !== null) deleteRow(pendingRowRemoval);
  }

  function chooseShift(value: EmuShiftType) {
    if (value !== shiftType) releaseCurrentServerDraft();
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
    releaseCurrentServerDraft();
    if (draftTimerRef.current !== null) {
      window.clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
    latestDraftRef.current = null;
    removeDraft(category, currentUserId);
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

    submitLockRef.current = true;
    setSubmitting(true);
    await serverSaveChainRef.current;
    const claimed = await persistServerDraft({ category, employeeId, reportDate, shiftType, rows: rows.map((row) => ({ ...row })) });
    if (!claimed) {
      setErrors((current) => ({ ...current, form: 'Отчёт уже заполняют на другом компьютере. Выберите другого сотрудника или дождитесь освобождения черновика.' }));
      submitLockRef.current = false;
      setSubmitting(false);
      return;
    }

    const payload: EmuCreateShiftReportDto = {
      employeeId,
      reportDate,
      shiftType,
      workerCategory: category,
      lines: usedRows.map((item) => ({ workDescription: item.description.trim(), durationMinutes: getDurationMinutes(item), sectionId: item.sectionId || null, note: item.note.trim() || null })),
    };
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
      <PageHeader
        className='emu-shift-header'
        description='Зафиксируйте выполненные за смену работы. Черновик сохраняется автоматически.'
        eyebrow='ЭМУ · СМЕННЫЕ ОТЧЁТЫ'
        title='Сменный отчёт'
        actions={(
          <div className='emu-shift-header-actions'>
          <Button
            className='emu-notification-settings-button'
            aria-haspopup='dialog'
            aria-expanded={showReminderDialog}
            onClick={() => setShowReminderDialog(true)}
            variant='secondary'
          >
            <Bell aria-hidden='true' size={18} />
            Уведомления
          </Button>
          <div className='emu-shift-kpis' aria-label='Сводка отчёта'>
            <div><BriefcaseBusiness aria-hidden='true' size={18} /><b>{usedRows.length}</b><span>Работ</span></div>
            <div><Clock3 aria-hidden='true' size={18} /><b>{formatDuration(totalMinutes)}</b><span>Общее время</span></div>
          </div>
          </div>
        )}
      />
      <div className={`emu-draft-status is-${draftStatus}`} role='status' aria-live='polite'>
            <span className='emu-draft-status-dot' aria-hidden='true' />
            {draftStatus === 'saving' ? 'Сохраняем черновик…' : null}
            {draftStatus === 'saved' ? `Черновик сохранён${draftSavedAt ? ` в ${draftSavedAt}` : ''}` : null}
            {draftStatus === 'restored' ? 'Черновик восстановлен после обновления' : null}
            {draftStatus === 'error' ? 'Черновик не сохранён — проверьте настройки браузера' : null}
            {draftStatus === 'idle' ? 'Изменения сохраняются локально' : null}
      </div>

      <ShiftReportReminder open={showReminderDialog} onClose={() => setShowReminderDialog(false)} />

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
        coordinationMessage={coordinationMessage}
        draftConflict={draftConflict}
        submitting={submitting}
        hasDraftData={hasDraftData}
        onSubmit={submit}
        onSwitchCategory={switchCategory}
        onEmployeeChange={(value) => { if (value !== employeeId) releaseCurrentServerDraft(); setEmployeeId(value); setSuccessMessage(''); }}
        onDateChange={(value) => { if (value !== reportDate) releaseCurrentServerDraft(); setReportDate(value); setSuccessMessage(''); }}
        onChooseShift={chooseShift}
        onUpdateRow={updateRow}
        onRemoveRow={removeRow}
        onAddRow={() => setRows((current) => [...current, createWorkRow()])}
        onRequestClear={() => setShowClearDialog(true)}
      />


      {showClearDialog ? <ModalShell className='emu-shift-confirm-dialog' title='Очистить черновик?' subtitle='Все заполненные строки текущей вкладки будут удалены.' onClose={() => setShowClearDialog(false)} actions={<><Button onClick={() => setShowClearDialog(false)} variant='ghost'>Отмена</Button><Button onClick={clearDraft} variant='danger'>Очистить</Button></>}><p>Черновик {categoryLabels[category].toLowerCase()} нельзя будет восстановить после очистки.</p></ModalShell> : null}
      {pendingRowRemoval !== null ? (
        <ModalShell
          className='emu-shift-confirm-dialog'
          title='Удалить строку?'
          subtitle='В строке есть заполненные данные. После удаления их нельзя будет восстановить.'
          onClose={() => setPendingRowRemoval(null)}
          actions={
            <>
              <Button onClick={() => setPendingRowRemoval(null)} variant='ghost'>Нет</Button>
              <Button onClick={confirmRowRemoval} variant='danger'>Да</Button>
            </>
          }
        >
          <p>Вы уверены, что хотите удалить строку {pendingRowRemoval + 1}?</p>
        </ModalShell>
      ) : null}
    </main>
  );
}
