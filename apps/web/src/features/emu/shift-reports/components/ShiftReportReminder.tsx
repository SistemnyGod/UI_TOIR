import { Bell, BellRing, Clock3, Monitor, X } from 'lucide-react';
import { useRef } from 'react';
import { Button, ModalShell, useDialogCloseGuard } from '../../../../shared/ui';
import { usePageLeaveGuard } from '../../../../shared/navigation/usePageLeaveGuard';
import { useShiftReportReminder } from './useShiftReportReminder';
import { validReminderTime } from './shiftReportReminderModel';
import './shiftReportReminder.css';

export function ShiftReportReminder({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reminder = useShiftReportReminder(open);
  const { settings, committed, permission, secureContext, requestingPermission } = reminder;
  const close = () => { reminder.invalidatePermissionRequest(); reminder.discard(); onClose(); };
  const { requestClose, discardDialog } = useDialogCloseGuard({ dirty: reminder.dirty, pending: false, onClose: close });
  const { leaveDialog } = usePageLeaveGuard({ dirty: open && reminder.dirty, pending: false });
  const permissionRegion = useRef<HTMLDivElement>(null);
  const desktopDisabled = requestingPermission || (!settings.desktop && (permission === 'denied' || permission === 'unsupported' || !secureContext));
  const requestPermission = () => {
    permissionRegion.current?.focus({ preventScroll: true });
    void reminder.requestDesktopPermission();
  };
  return <>
    {reminder.due ? <div className='emu-reminder-stack'><div className='emu-reminder-banner' role='alert'>
      <BellRing aria-hidden='true' size={20} /><div><strong>Пора отправить сменный отчёт</strong><span>Проверьте сохранённый черновик и отправьте отчёт за смену.</span></div>
      <button type='button' aria-label='Закрыть напоминание' onClick={reminder.dismiss}><X aria-hidden='true' size={18} /></button>
    </div></div> : null}
    {open ? <ModalShell className='emu-reminder-dialog' title='Настройки уведомлений'
      subtitle={committed.enabled ? `Напоминание сохранено: ежедневно в ${committed.time}.` : 'Напоминание в этом браузере отключено.'}
      onClose={requestClose} actions={<>{reminder.storageError ? <Button onClick={() => reminder.save()}>Повторить сохранение</Button> : null}<Button onClick={requestClose} variant='primary'>Готово</Button></>}>
      <p className='emu-reminder-help'>Настройки этого браузера сохраняются автоматически. Напоминание работает, пока открыта форма сменного отчёта.</p>
      <div className='emu-reminder-settings'>
        <label className='emu-reminder-time'><span><Clock3 aria-hidden='true' size={17} />Время</span><input type='time' value={settings.time} aria-invalid={!validReminderTime(settings.time) || undefined} onChange={event => reminder.update({ time: event.target.value })} /></label>
        <label className='emu-reminder-check'><input type='checkbox' checked={settings.enabled} onChange={event => reminder.update({ enabled: event.target.checked })} /><span><b>Включить напоминание</b><small>Ежедневно в выбранное время</small></span></label>
        <label className='emu-reminder-check'><input type='checkbox' checked={settings.inApp} onChange={event => reminder.update({ inApp: event.target.checked })} /><Bell aria-hidden='true' size={17} /><span><b>Во вкладке</b><small>Баннер можно закрыть до следующего дня</small></span></label>
        <label className={`emu-reminder-check${desktopDisabled ? ' is-disabled' : ''}`}><input type='checkbox' checked={settings.desktop} disabled={desktopDisabled} onChange={event => { if (event.target.checked && permission !== 'granted') requestPermission(); else reminder.toggleDesktop(event.target.checked); }} /><Monitor aria-hidden='true' size={17} /><span><b>На устройстве</b><small>Системное уведомление браузера</small></span></label>
      </div>
      <div className='emu-reminder-permission' ref={permissionRegion} tabIndex={-1} role='region' aria-label='Разрешение системных уведомлений'>
        {!secureContext ? <p>Для системных уведомлений откройте приложение по HTTPS.</p> : null}
        {secureContext && permission === 'default' ? <Button disabled={requestingPermission} isLoading={requestingPermission} onClick={requestPermission}>Разрешить системные уведомления</Button> : null}
        {requestingPermission ? <p role='status'>Ожидаем ответ браузера. Это окно можно закрыть.</p> : null}
        {secureContext && permission === 'granted' ? <p>Разрешение браузера получено.</p> : null}
        {permission === 'denied' ? <p>Уведомления заблокированы в настройках браузера. Баннер во вкладке остаётся доступен.</p> : null}
        {permission === 'unsupported' ? <p>Этот браузер не поддерживает системные уведомления. Используйте баннер во вкладке.</p> : null}
      </div>
      {reminder.permissionError ? <p className='emu-reminder-error' role='alert'>{reminder.permissionError}</p> : null}
      {reminder.storageError ? <p className='emu-reminder-error' role='alert'>{reminder.storageError}</p> : <p className='emu-reminder-status' role='status'>{reminder.saved ? 'Настройки сохранены в этом браузере.' : 'Изменения сохраняются автоматически.'}</p>}
      {settings.enabled && !settings.inApp && !settings.desktop ? <p className='emu-reminder-help'>Выберите хотя бы один способ, чтобы получать напоминание.</p> : null}
    </ModalShell> : null}
    {open ? discardDialog : null}{leaveDialog}
  </>;
}
