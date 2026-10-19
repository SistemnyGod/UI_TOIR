import { AssignmentDraftRecoveryEditor } from './AssignmentDraftRecoveryEditor';
import { useState } from 'react';
import { Button, ModalShell, PaginationBar, type PageSizeOption } from '../../../shared/ui';
import { downloadBlob } from '../../../shared/downloadBlob';
import { ASSIGNMENT_DRAFTS_STORAGE_KEY, readAssignmentDrafts, type LocalDraft } from './assignmentDrafts';
import './assignmentDrafts.css';

type Option = { id: string; name: string };
export function LegacyDraftRecoveryModal({ employees, routes, onClose, onRecover }: {
  employees: Option[]; routes: Option[]; onClose: () => void; onRecover: (draft: LocalDraft) => void;
}) {
  // Read unowned data only after an administrator explicitly opens recovery.
  const [source, setSource] = useState(() => readAssignmentDrafts(ASSIGNMENT_DRAFTS_STORAGE_KEY));
  const [target, setTarget] = useState<LocalDraft | null>(null), [error, setError] = useState('');
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState<PageSizeOption>(25);
  const current = Math.min(page, Math.max(1, Math.ceil(source.drafts.length / pageSize)));
  function backup() {
    try { downloadBlob(new Blob([source.raw!], { type: 'application/json;charset=utf-8' }), 'atom-legacy-assignment-drafts.json'); setError(''); }
    catch { setError('Не удалось подготовить файл. Повторите скачивание.'); }
  }
  return <><ModalShell className='assignment-recovery-modal' title='Старые локальные черновики' onClose={onClose}
    actions={<><Button onClick={() => { setSource(readAssignmentDrafts(ASSIGNMENT_DRAFTS_STORAGE_KEY)); setError(''); }}>Повторить чтение</Button><Button disabled={source.raw === null} onClick={backup}>Скачать исходный файл</Button><Button onClick={onClose} variant='primary'>Закрыть</Button></>}>
    <p className='assignment-recovery-note'>Это записи прежней версии, сохранённые в этом браузере без владельца и режима работы. Проверьте их принадлежность. Для копии потребуется выбрать сотрудника и маршрут из текущих справочников.</p>
    {source.error ? <p role='alert' className='assignment-drafts-error'>{source.error}</p> : <p role='status'>Доступно черновиков: {source.drafts.length}. Строк с ошибками: {source.rejected}.</p>}
    {source.rejected ? <p className='assignment-recovery-note'>Повреждённые строки доступны в исходном файле. Исходные записи сохраняются после создания копии.</p> : null}
    {error ? <p role='alert'>{error}</p> : null}
    <ul className='assignment-recovery-list'>
      {source.drafts.slice((current - 1) * pageSize, current * pageSize).map(draft => <li key={draft.id}><div>
        <strong>{draft.title || 'Черновик назначения'}</strong><span>{draft.employeeName || 'Сотрудник не указан'} · {draft.routeName || 'Маршрут не указан'}</span><small>{draft.changedAt}</small>
      </div><Button onClick={() => setTarget(structuredClone(draft))}>Подготовить копию</Button></li>)}
    </ul>
    {source.drafts.length > 25 ? <PaginationBar page={current} pageSize={pageSize} pageSizeOptions={[25, 50, 100]} total={source.drafts.length} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} /> : null}
  </ModalShell>
    {target ? <AssignmentDraftRecoveryEditor key={target.id} source={target} employees={employees} routes={routes} onClose={() => setTarget(null)} onRecover={onRecover} /> : null}
  </>;
}
