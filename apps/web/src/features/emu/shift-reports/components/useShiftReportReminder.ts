import { useEffect, useRef, useState } from 'react';
import { localReminderDay, localReminderTime, readReminderSettings, recordReminderDay, reminderDayRecorded, REMINDER_DISMISSED_KEY, REMINDER_SENT_KEY, sameReminderSettings, saveReminderSettings, type ReminderSettings } from './shiftReportReminderModel';

type Permission = NotificationPermission | 'unsupported';
const browserPermission = (): Permission => typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;

export function useShiftReportReminder(open: boolean) {
  const [initial] = useState(readReminderSettings);
  const [settings, setSettings] = useState(initial.settings), [committed, setCommitted] = useState(initial.settings);
  const [storageError, setStorageError] = useState(initial.error), [permissionError, setPermissionError] = useState('');
  const [due, setDue] = useState(false), [permission, setPermission] = useState<Permission>(browserPermission);
  const [requestingPermission, setRequestingPermission] = useState(false);
  const [saved, setSaved] = useState(false);
  const state = useRef({ settings, committed, open }); state.current = { settings, committed, open };
  const lifecycle = useRef({ mounted: true, generation: 0, requesting: false });
  const secureContext = window.isSecureContext !== false;
  const dirty = !sameReminderSettings(settings, committed);

  useEffect(() => {
    lifecycle.current.mounted = true;
    return () => { lifecycle.current.mounted = false; lifecycle.current.generation++; };
  }, []);
  useEffect(() => {
    lifecycle.current.generation++;
    lifecycle.current.requesting = false; setRequestingPermission(false); setPermissionError(''); setSaved(false);
    if (open) {
      setPermission(browserPermission());
      if (sameReminderSettings(state.current.settings, state.current.committed)) {
        const latest = readReminderSettings();
        setSettings(latest.settings); setCommitted(latest.settings); setStorageError(latest.error);
      }
    }
  }, [open]);
  useEffect(() => {
    const refresh = () => setPermission(browserPermission());
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  useEffect(() => {
    const check = () => {
      const today = localReminderDay(), isDue = committed.enabled && localReminderTime() >= committed.time;
      setDue(isDue && committed.inApp && !reminderDayRecorded(REMINDER_DISMISSED_KEY, today));
      if (!isDue || !committed.desktop || permission !== 'granted' || !secureContext || reminderDayRecorded(REMINDER_SENT_KEY, today)) return;
      try {
        new Notification('Пора отправить сменный отчёт', { body: 'Откройте сменный отчёт ЭМУ, проверьте черновик и отправьте его.', tag: 'patrol360-emu-shift-report' });
        recordReminderDay(REMINDER_SENT_KEY, today);
      } catch { setPermissionError('Браузер не смог показать системное уведомление. Проверьте его разрешения.'); }
    };
    check(); const timer = window.setInterval(check, 30_000); return () => window.clearInterval(timer);
  }, [committed, permission, secureContext]);

  function save(next = state.current.settings) {
    const error = saveReminderSettings(next);
    setStorageError(error);
    if (!error) { state.current.committed = next; setCommitted(next); setSaved(true); }
  }
  function update(patch: Partial<ReminderSettings>) {
    const next = { ...state.current.settings, ...patch };
    state.current.settings = next; setSettings(next); save(next);
  }
  function discard() {
    state.current.settings = state.current.committed; setSettings(state.current.committed); setStorageError('');
  }
  function invalidatePermissionRequest() {
    lifecycle.current.generation++; lifecycle.current.requesting = false; setRequestingPermission(false);
  }
  async function requestDesktopPermission() {
    if (!state.current.open || lifecycle.current.requesting || typeof Notification === 'undefined' || !secureContext) return;
    const generation = lifecycle.current.generation;
    const current = () => lifecycle.current.mounted && state.current.open && generation === lifecycle.current.generation;
    lifecycle.current.requesting = true; setRequestingPermission(true); setPermissionError('');
    try {
      const next = await Notification.requestPermission();
      if (!current()) return;
      setPermission(next);
      if (next === 'granted') update({ desktop: true });
      else setPermissionError(next === 'denied' ? 'Разрешение не получено. Измените его в настройках браузера.' : 'Разрешение не выбрано. Можно повторить запрос.');
    } catch {
      if (current()) setPermissionError('Не удалось запросить разрешение браузера. Повторите попытку.');
    } finally {
      if (current()) { lifecycle.current.requesting = false; setRequestingPermission(false); }
    }
  }
  function toggleDesktop(checked: boolean) {
    if (checked && browserPermission() !== 'granted') { void requestDesktopPermission(); return; }
    update({ desktop: checked });
  }
  function dismiss() { recordReminderDay(REMINDER_DISMISSED_KEY, localReminderDay()); setDue(false); }
  return { settings, committed, dirty, storageError, permissionError, due, permission, secureContext, requestingPermission, saved, update, save, discard, dismiss, toggleDesktop, requestDesktopPermission, invalidatePermissionRequest };
}
