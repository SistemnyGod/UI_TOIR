import { useId, useRef, useState, type FormEvent } from 'react';
import { Button, ModalShell, useDialogAction, useDialogCloseGuard } from '../../../shared/ui';
import { usePageLeaveGuard } from '../../../shared/navigation/usePageLeaveGuard';
import { parseDateKey } from '../../../shared/ui/dateRange';
import { createLocalDraftId, type LocalDraft } from './assignmentDrafts';
import './assignmentDrafts.css';
type Option = { id: string; name: string };

export function AssignmentDraftRecoveryEditor({ source, employees, routes, onClose, onRecover, requireExplicitSelection = true }: {
  source: LocalDraft; employees: Option[]; routes: Option[]; onClose: () => void; onRecover: (draft: LocalDraft) => void; requireExplicitSelection?: boolean;
}) {
  const [copyId] = useState(createLocalDraftId), formId = useId();
  const [form, setForm] = useState(() => ({ employeeId: !requireExplicitSelection && employees.some(item => item.id === source.employeeId) ? source.employeeId : '', routeId: !requireExplicitSelection && routes.some(item => item.id === source.routeId) ? source.routeId : '', plannedDate: parseDateKey(source.plannedDate) ? source.plannedDate : '', plannedStart: /^([01]\d|2[0-3]):[0-5]\d$/.test(source.plannedStart) ? source.plannedStart : '', priority: source.priority, comment: source.comment }));
  const initial = useRef(JSON.stringify(form)), action = useDialogAction();
  const [validationError, setValidationError] = useState('');
  const dirty = initial.current !== JSON.stringify(form);
  const { requestClose, discardDialog } = useDialogCloseGuard({ dirty, pending: action.pending, onClose });
  const { leaveDialog } = usePageLeaveGuard({ dirty, pending: action.pending });
  const patch = (value: Partial<typeof form>) => { setForm(current => ({ ...current, ...value })); setValidationError(''); action.clearError(); };
  async function submit(event: FormEvent) {
    event.preventDefault();
    const employee = employees.find(item => item.id === form.employeeId), route = routes.find(item => item.id === form.routeId);
    if (!employee || !route || !parseDateKey(form.plannedDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.plannedStart)) {
      setValidationError('Выберите действующих сотрудника и маршрут, укажите корректные дату и время.'); return;
    }
    await action.run(async () => {
      onRecover({ ...form, id: copyId, title: source.title || 'Черновик назначения', employeeName: employee.name, routeName: route.name, changedAt: new Date().toLocaleString('ru-RU') });
      onClose();
    });
  }
  return <><ModalShell className='assignment-recovery-editor' title='Восстановить черновик' subtitle='Сохраните проверенную копию в своих локальных черновиках.' onClose={requestClose} pending={action.pending} initialFocusSelector='[data-recovery-employee]'
    actions={<><Button disabled={action.pending} onClick={requestClose}>Отмена</Button><Button disabled={action.pending} isLoading={action.pending} form={formId} type='submit' variant='primary'>Сохранить копию</Button></>}>
    <p className='assignment-recovery-original'><span className='assignment-recovery-label'>В исходной записи:</span> {source.employeeName || 'Без имени'} · {source.routeName || 'Без названия маршрута'} · {source.plannedDate} {source.plannedStart}</p>
    <form className='assignment-recovery-form' id={formId} noValidate onSubmit={submit}>
      <label>Сотрудник<select aria-label='Сотрудник' data-recovery-employee disabled={action.pending} value={form.employeeId} onChange={event => patch({ employeeId: event.target.value })}><option value=''>Выберите сотрудника</option>{employees.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{form.employeeId ? <small className='assignment-recovery-selection'>{employees.find(item => item.id === form.employeeId)?.name || 'Выбранный сотрудник недоступен'}</small> : null}</label>
      <label>Маршрут<select aria-label='Маршрут' disabled={action.pending} value={form.routeId} onChange={event => patch({ routeId: event.target.value })}><option value=''>Выберите маршрут</option>{routes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{form.routeId ? <small className='assignment-recovery-selection'>{routes.find(item => item.id === form.routeId)?.name || 'Выбранный маршрут недоступен'}</small> : null}</label>
      <label>Дата<input disabled={action.pending} type='date' value={form.plannedDate} onChange={event => patch({ plannedDate: event.target.value })} /></label>
      <label>Время<input disabled={action.pending} type='time' value={form.plannedStart} onChange={event => patch({ plannedStart: event.target.value })} /></label>
      <label>Приоритет<select disabled={action.pending} value={form.priority} onChange={event => patch({ priority: event.target.value as LocalDraft['priority'] })}><option value='high'>Высокий</option><option value='medium'>Средний</option><option value='low'>Низкий</option></select></label>
      <label className='assignment-recovery-full'>Комментарий<textarea aria-label="Комментарий" disabled={action.pending} value={form.comment} onChange={event => patch({ comment: event.target.value })} /></label>
      {action.error || validationError ? <p className='assignment-drafts-error assignment-recovery-full' role='alert'>{action.error || validationError}</p> : null}
    </form>
  </ModalShell>{discardDialog}{leaveDialog}</>;
}
