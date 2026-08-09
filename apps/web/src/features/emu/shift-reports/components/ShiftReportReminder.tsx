import { Bell, BellRing, Clock3, Monitor, Settings2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, ModalShell } from '../../../../shared/ui';

const SETTINGS_KEY = 'patrol360.emu.shift-report.reminder.v1';
const DISMISSED_KEY = 'patrol360.emu.shift-report.reminder.dismissed.v1';
const DESKTOP_SENT_KEY = 'patrol360.emu.shift-report.reminder.desktop-sent.v1';

type ReminderSettings = {
  enabled: boolean;
  time: string;
  inApp: boolean;
  desktop: boolean;
};

const defaultSettings: ReminderSettings = {
  enabled: false,
  time: '19:30',
  inApp: true,
  desktop: false,
};

function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function currentTime(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function storageGet(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function readSettings(): ReminderSettings {
  try {
    const stored = JSON.parse(storageGet(SETTINGS_KEY) ?? 'null') as Partial<ReminderSettings> | null;
    if (!stored || typeof stored !== 'object') return defaultSettings;
    return {
      enabled: stored.enabled === true,
      time: typeof stored.time === 'string' && /^\d{2}:\d{2}$/.test(stored.time) ? stored.time : defaultSettings.time,
      inApp: stored.inApp !== false,
      desktop: stored.desktop === true,
    };
  } catch {
    return defaultSettings;
  }
}

function notificationPermission(): NotificationPermission | 'unsupported' {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

export function ShiftReportReminder({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [settings, setSettings] = useState<ReminderSettings>(readSettings);
  const [due, setDue] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(notificationPermission);
  const secureContext = typeof window !== 'undefined' && window.isSecureContext !== false;

  useEffect(() => {
    storageSet(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    function checkReminder() {
      if (!settings.enabled) {
        setDue(false);
        return;
      }
      const today = localDay();
      const isDue = currentTime() >= settings.time;
      const dismissed = storageGet(DISMISSED_KEY) === today;
      setDue(isDue && settings.inApp && !dismissed);

      if (!isDue || !settings.desktop || permission !== 'granted' || !secureContext) return;
      if (storageGet(DESKTOP_SENT_KEY) === today) return;
      try {
        new Notification('Пора отправить сменный отчёт', {
          body: 'Откройте сменный отчёт ЭМУ, проверьте черновик и отправьте его.',
          tag: 'patrol360-emu-shift-report',
        });
        storageSet(DESKTOP_SENT_KEY, today);
      } catch {
        // A browser may revoke notification access while the page is open.
      }
    }

    checkReminder();
    const interval = window.setInterval(checkReminder, 30_000);
    return () => window.clearInterval(interval);
  }, [permission, secureContext, settings]);

  function update(patch: Partial<ReminderSettings>) {
    setSettings((current) => ({ ...current, ...patch }));
  }

  function dismiss() {
    storageSet(DISMISSED_KEY, localDay());
    setDue(false);
  }

  async function requestDesktopPermission() {
    if (typeof Notification === 'undefined' || !secureContext) return;
    const next = await Notification.requestPermission();
    setPermission(next);
    if (next === 'granted') {
      update({ desktop: true });
      try {
        new Notification('Уведомления включены', {
          body: `Напомним о сменном отчёте в ${settings.time}, пока приложение открыто.`,
          tag: 'patrol360-emu-shift-report-permission',
        });
      } catch {
        // Permission state can change between the request and notification creation.
      }
    }
  }

  return (
    <>
      {due ? (
        <div className='emu-reminder-stack'>
          <div className='emu-reminder-banner' role='alert'>
            <BellRing aria-hidden='true' size={19} />
            <div><strong>Пора отправить сменный отчёт</strong><span>Проверьте сохранённый черновик и отправьте отчёт за смену.</span></div>
            <button type='button' aria-label='Закрыть напоминание' onClick={dismiss}><X aria-hidden='true' size={17} /></button>
          </div>
        </div>
      ) : null}

      {open ? (
        <ModalShell
          className='emu-reminder-dialog'
          title='Настройки уведомлений'
          subtitle={settings.enabled ? `Напоминание включено ежедневно в ${settings.time}.` : 'Настройте время и способы получения напоминания.'}
          onClose={onClose}
          actions={<Button onClick={onClose} variant='primary'>Готово</Button>}
        >
          <div className='emu-reminder-settings'>
            <label className='emu-reminder-time'><span><Clock3 aria-hidden='true' size={15} />Время</span><input type='time' value={settings.time} onChange={(event) => update({ time: event.target.value })} /></label>
            <label className='emu-reminder-toggle'><input type='checkbox' checked={settings.enabled} onChange={(event) => update({ enabled: event.target.checked })} /><span /><b>Включить напоминание</b></label>
            <label className='emu-reminder-check'><input type='checkbox' checked={settings.inApp} onChange={(event) => update({ inApp: event.target.checked })} /><Bell aria-hidden='true' size={15} /><span><b>Во вкладке</b><small>Покажем закрываемый баннер</small></span></label>
            <label className='emu-reminder-check'><input type='checkbox' checked={settings.desktop} disabled={permission === 'denied' || permission === 'unsupported' || !secureContext} onChange={(event) => update({ desktop: event.target.checked })} /><Monitor aria-hidden='true' size={15} /><span><b>Windows</b><small>Системное уведомление браузера</small></span></label>
            <div className='emu-reminder-permission'>
              <Settings2 aria-hidden='true' size={15} />
              {!secureContext ? <span>Для Windows-уведомлений откройте приложение по HTTPS.</span> : null}
              {secureContext && permission === 'default' ? <button type='button' onClick={() => void requestDesktopPermission()}>Разрешить Windows-уведомления</button> : null}
              {secureContext && permission === 'granted' ? <span className='is-success'>Разрешение браузера получено</span> : null}
              {permission === 'denied' ? <span>Уведомления заблокированы в настройках браузера.</span> : null}
              {permission === 'unsupported' ? <span>Этот браузер не поддерживает системные уведомления.</span> : null}
            </div>
          </div>
        </ModalShell>
      ) : null}
    </>
  );
}
