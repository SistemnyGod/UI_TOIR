import { Button, ModalShell } from '../../../shared/ui';
import './accountEditConfirmation.css';

export function AccountEditConfirmation({ login, role, status, changesPassword, pending, onClose, onConfirm }: {
  login: string; role: string; status: string; changesPassword: boolean; pending: boolean;
  onClose: () => void; onConfirm: () => void;
}) {
  return <ModalShell className='account-change-confirm' title='Подтвердить изменения?' subtitle='Проверьте параметры мобильного аккаунта перед сохранением.' pending={pending} onClose={onClose} initialFocusSelector='[data-account-confirm-cancel]'
    actions={<><Button data-account-confirm-cancel disabled={pending} onClick={onClose}>Нет</Button><Button disabled={pending} isLoading={pending} onClick={onConfirm} variant='primary'>Да, сохранить</Button></>}>
    <dl className='account-change-summary'>
      <div><dt>Логин</dt><dd>{login}</dd></div>
      <div><dt>Роль</dt><dd>{role}</dd></div>
      <div><dt>Статус</dt><dd>{status}</dd></div>
      <div><dt>Пароль</dt><dd>{changesPassword ? 'Будет изменён' : 'Сохраняется текущий'}</dd></div>
    </dl>
  </ModalShell>;
}
