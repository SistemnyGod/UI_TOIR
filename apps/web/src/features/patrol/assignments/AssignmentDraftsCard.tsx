import { useState } from 'react';
import { Button, PaginationBar, type PageSizeOption } from '../../../shared/ui';
import { downloadBlob } from '../../../shared/downloadBlob';
import { EmptyPanel, PanelHeader } from './AssignmentPanelParts';
import { FileText } from './AssignmentIcons';
import type { DraftReadResult, LocalDraft } from './assignmentDrafts';
import './assignmentDrafts.css';

export function AssignmentDraftsCard({ result, canManage, onDelete, onOpen, onReload, onRecover }: {
  result: DraftReadResult; canManage: boolean; onDelete: (id: string) => void; onOpen: (draft: LocalDraft) => void;
  onReload: () => void; onRecover?: () => void;
}) {
  const [query, setQuery] = useState(''), [page, setPage] = useState(1), [pageSize, setPageSize] = useState<PageSizeOption>(25);
  const [exportError, setExportError] = useState('');
  const rows = result.drafts.filter(draft => [draft.title, draft.employeeName, draft.routeName, draft.comment].join(' ').toLocaleLowerCase('ru-RU').includes(query.trim().toLocaleLowerCase('ru-RU')));
  const current = Math.min(page, Math.max(1, Math.ceil(rows.length / pageSize)));
  function backup() {
    try { downloadBlob(new Blob([result.raw!], { type: 'application/json;charset=utf-8' }), 'atom-my-assignment-drafts.json'); setExportError(''); }
    catch { setExportError('Не удалось подготовить файл. Повторите скачивание.'); }
  }
  return <section className='assign-am-card assignment-drafts-card'>
    <PanelHeader count={result.error ? undefined : result.drafts.length} icon={FileText} title='Черновики' />
    <div className='assignment-drafts-tools'>
      <label><span className='visually-hidden'>Поиск черновиков</span><input aria-label='Поиск черновиков' type='search' placeholder='Сотрудник, маршрут или текст' value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label>
      <Button aria-label='Обновить черновики' onClick={onReload} variant='ghost'>Обновить</Button>
      {result.raw !== null ? <Button aria-label='Скачать мои черновики' onClick={backup} variant='ghost'>Скачать</Button> : null}
      {onRecover ? <Button aria-label='Восстановить старые черновики' className='assignment-drafts-recover' onClick={onRecover} variant='secondary'>Старые черновики</Button> : null}
    </div>
    {result.error || result.rejected ? <p className='assignment-drafts-error' role='alert'>{result.error || `Не удалось прочитать строк: ${result.rejected}. Сохранение заблокировано, исходный файл доступен для восстановления.`}</p> : null}
    {exportError ? <p role='alert'>{exportError}</p> : null}
    {rows.length ? <div className='assignment-drafts-list'>
      {rows.slice((current - 1) * pageSize, current * pageSize).map(draft => <div key={draft.id}>
        <button className='assignment-draft-open' onClick={() => onOpen(draft)} type='button'>
          <strong>{draft.title || 'Черновик назначения'}</strong><span>{draft.employeeName}</span><span>{draft.routeName}</span><small>{draft.changedAt}</small>
        </button>
        {canManage ? <button aria-label={`Удалить черновик ${draft.title || draft.id}`} className='assignment-draft-delete' onClick={() => onDelete(draft.id)} type='button'>Удалить</button> : null}
      </div>)}
    </div> : !result.error ? <EmptyPanel description={query ? 'Измените строку поиска.' : 'Сохранённые назначения появятся здесь.'} title={query ? 'Черновики не найдены' : 'Черновиков нет'} /> : null}
    {rows.length > 25 ? <PaginationBar page={current} pageSize={pageSize} pageSizeOptions={[25, 50, 100]} total={rows.length} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} /> : null}
  </section>;
}
