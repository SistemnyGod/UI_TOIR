export const REMINDER_SETTINGS_KEY = 'patrol360.emu.shift-report.reminder.v1';
export const REMINDER_DISMISSED_KEY = 'patrol360.emu.shift-report.reminder.dismissed.v1';
export const REMINDER_SENT_KEY = 'patrol360.emu.shift-report.reminder.desktop-sent.v1';
export type ReminderSettings = { enabled: boolean; time: string; inApp: boolean; desktop: boolean };
export const defaultReminderSettings: ReminderSettings = { enabled: false, time: '19:30', inApp: true, desktop: false };
export const validReminderTime = (time: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
export const sameReminderSettings = (a: ReminderSettings, b: ReminderSettings) => a.enabled === b.enabled && a.time === b.time && a.inApp === b.inApp && a.desktop === b.desktop;

export function readReminderSettings(): { settings: ReminderSettings; error: string } {
  try {
    const raw = window.localStorage.getItem(REMINDER_SETTINGS_KEY);
    if (raw === null) return { settings: { ...defaultReminderSettings }, error: '' };
    const stored = JSON.parse(raw) as Partial<ReminderSettings>;
    if (!stored || Array.isArray(stored) || typeof stored !== 'object' || typeof stored.time !== 'string' || !validReminderTime(stored.time)) throw new Error('Invalid settings');
    return { settings: { enabled: stored.enabled === true, time: stored.time, inApp: stored.inApp !== false, desktop: stored.desktop === true }, error: '' };
  } catch {
    return { settings: { ...defaultReminderSettings }, error: 'Не удалось прочитать настройки этого браузера. Напоминание отключено. Исходная запись не изменена; проверьте настройки и сохраните повторно.' };
  }
}

export function saveReminderSettings(settings: ReminderSettings): string {
  if (!validReminderTime(settings.time)) return 'Укажите время от 00:00 до 23:59.';
  try { window.localStorage.setItem(REMINDER_SETTINGS_KEY, JSON.stringify(settings)); return ''; }
  catch { return 'Не удалось сохранить настройки в этом браузере. Изменения остаются в форме; повторите сохранение.'; }
}

export function localReminderDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function localReminderTime(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// Keep the existing browser-wide device preferences. Memory avoids repeats in this
// SPA when storage is unavailable; it does not persist across a browser restart.
const rememberedDays = new Map<string, string>();
export function reminderDayRecorded(key: string, day: string) {
  if (rememberedDays.get(key) === day) return true;
  try { return window.localStorage.getItem(key) === day; } catch { return false; }
}
export function recordReminderDay(key: string, day: string) {
  rememberedDays.set(key, day);
  try { window.localStorage.setItem(key, day); } catch { /* Retained for this app session. */ }
}
