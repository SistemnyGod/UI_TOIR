import { Button, ModalShell } from '../../../shared/ui';
import type { LocalDraft } from './assignmentDrafts';
import './assignmentDrafts.css';
export function AssignmentDraftPreview({ draft, onClose }: { draft: LocalDraft; onClose: () => void }) {
  return <ModalShell className='assignment-recovery-editor' title='Просмотр черновика' subtitle={draft.title} onClose={onClose} actions={<Button onClick={onClose}>Закрыть</Button>}>
    <dl className='assignment-draft-preview'>
      <div><dt>Сотрудник</dt><dd>{draft.employeeName || 'Не указан'}</dd></div>
      <div><dt>Маршрут</dt><dd>{draft.routeName || 'Не указан'}</dd></div>
      <div><dt>План</dt><dd>{draft.plannedDate} {draft.plannedStart}</dd></div>
      <div><dt>Приоритет</dt><dd>{{ high: 'Высокий', medium: 'Средний', low: 'Низкий' }[draft.priority]}</dd></div>
      <div><dt>Комментарий</dt><dd className='assignment-draft-comment'>{draft.comment || 'Без комментария'}</dd></div>
    </dl>
  </ModalShell>;
}
