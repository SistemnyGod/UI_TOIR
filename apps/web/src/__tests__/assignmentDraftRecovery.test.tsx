import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LegacyDraftRecoveryModal } from '../features/patrol/assignments/LegacyDraftRecoveryModal';
import { AssignmentDraftRecoveryEditor } from '../features/patrol/assignments/AssignmentDraftRecoveryEditor';
import { ASSIGNMENT_DRAFTS_STORAGE_KEY as key, loadAssignmentDrafts, readAssignmentDrafts, writeAssignmentDrafts, type LocalDraft } from '../features/patrol/assignments/assignmentDrafts';

const draft: LocalDraft = { id: 'old', title: 'Старая запись', employeeId: 'employee', employeeName: 'Исходное имя', routeId: 'route', routeName: 'Исходный маршрут', plannedDate: '2026-10-20', plannedStart: '08:30', priority: 'high', comment: 'Комментарий целиком', changedAt: '17.10', requestId: 'old-private-request' };
const options = { employees: [{ id: 'employee', name: 'Текущий сотрудник' }], routes: [{ id: 'route', name: 'Текущий маршрут' }] };
beforeEach(() => {
  const rows = new Map<string, string>();
  const storage: Storage = { get length() { return rows.size; }, clear: () => rows.clear(), key: index => [...rows.keys()][index] ?? null, getItem: name => rows.get(name) ?? null, setItem: (name, value) => { rows.set(name, value); }, removeItem: name => { rows.delete(name); } };
  Object.defineProperty(window, 'localStorage', { configurable: true, value: storage }); vi.stubGlobal('localStorage', storage);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('owned local draft storage', () => {
  it('reads and retains every row beyond the former four-draft limit', () => {
    const rows = Array.from({ length: 31 }, (_, index) => ({ ...draft, id: 'd-' + index }));
    localStorage.setItem('owned', JSON.stringify(rows)); expect(loadAssignmentDrafts('owned')).toHaveLength(31);
    const before = readAssignmentDrafts('owned'); writeAssignmentDrafts('owned', before.raw, [{ ...draft, id: 'new' }, ...before.drafts]);
    expect(loadAssignmentDrafts('owned').map(row => row.id)).toEqual(['new', ...rows.map(row => row.id)]);
  });
  it('rejects a stale tab without overwriting its newer data', () => {
    const before = readAssignmentDrafts('owned'); const newer = JSON.stringify([draft]); localStorage.setItem('owned', newer);
    expect(() => writeAssignmentDrafts('owned', before.raw, [])).toThrow('другой вкладке'); expect(localStorage.getItem('owned')).toBe(newer);
  });
  it('keeps malformed and duplicate data available instead of overwriting it', () => {
    for (const raw of ['{broken', JSON.stringify([draft, draft]), JSON.stringify([draft, { id: 'bad' }])]) {
      localStorage.setItem('owned', raw); const result = readAssignmentDrafts('owned');
      expect(Boolean(result.error || result.rejected)).toBe(true); expect(() => writeAssignmentDrafts('owned', raw, [])).toThrow(); expect(localStorage.getItem('owned')).toBe(raw);
    }
  });
  it('reports storage rejection without creating a successful result', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    expect(() => writeAssignmentDrafts('owned', null, [draft])).toThrow('не разрешил сохранить');
  });
  it('does not read the unowned key when loading an owned list', () => {
    const get = vi.spyOn(localStorage, 'getItem'); loadAssignmentDrafts('owned'); expect(get).not.toHaveBeenCalledWith(key);
  });
  it('retains additional owned metadata when saving another draft', () => {
    localStorage.setItem('owned', JSON.stringify([{ ...draft, futureMetadata: { value: 'keep' } }]));
    const before = readAssignmentDrafts('owned'); writeAssignmentDrafts('owned', before.raw, [{ ...draft, id: 'new' }, ...before.drafts]);
    expect(JSON.parse(localStorage.getItem('owned')!)[1].futureMetadata).toEqual({ value: 'keep' });
  });
});

describe('explicit recovery', () => {
  it('requires current employee and route choices even when old IDs match and drops the old request link', async () => {
    const user = userEvent.setup(), recover = vi.fn(); localStorage.setItem(key, JSON.stringify([draft])); const raw = localStorage.getItem(key);
    render(<LegacyDraftRecoveryModal {...options} onClose={vi.fn()} onRecover={recover} />);
    await user.click(screen.getByRole('button', { name: 'Подготовить копию' }));
    expect(screen.getByRole('combobox', { name: 'Сотрудник' })).toHaveValue(''); expect(screen.getByRole('combobox', { name: 'Маршрут' })).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Сохранить копию' })); expect(recover).not.toHaveBeenCalled();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Сотрудник' }), 'employee'); await user.selectOptions(screen.getByRole('combobox', { name: 'Маршрут' }), 'route');
    await user.click(screen.getByRole('button', { name: 'Сохранить копию' })); await waitFor(() => expect(recover).toHaveBeenCalledTimes(1));
    expect(recover.mock.calls[0][0]).toEqual(expect.objectContaining({ employeeName: 'Текущий сотрудник', routeName: 'Текущий маршрут', comment: draft.comment }));
    expect(recover.mock.calls[0][0].id).not.toBe(draft.id); expect(recover.mock.calls[0][0].requestId).toBeUndefined(); expect(localStorage.getItem(key)).toBe(raw);
  });
  it('retains inputs and returns to the same source after a failed write and cancelled dismissal', async () => {
    const user = userEvent.setup(); render(<AssignmentDraftRecoveryEditor {...options} source={draft} onClose={vi.fn()} onRecover={() => { throw new Error('Хранилище недоступно'); }} />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Сотрудник' }), 'employee'); await user.selectOptions(screen.getByRole('combobox', { name: 'Маршрут' }), 'route');
    await user.type(screen.getByRole('textbox', { name: 'Комментарий' }), ' Важное дополнение.'); await user.click(screen.getByRole('button', { name: 'Сохранить копию' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Хранилище недоступно'); await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Продолжить редактирование' })); expect(screen.getByRole('textbox', { name: 'Комментарий' })).toHaveValue(draft.comment + ' Важное дополнение.');
  });
  it('preserves a recovered draft while reference data refreshes and refuses a removed route', async () => {
    const user = userEvent.setup(), recover = vi.fn(); const view = render(<AssignmentDraftRecoveryEditor {...options} source={draft} onClose={vi.fn()} onRecover={recover} />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Сотрудник' }), 'employee'); await user.selectOptions(screen.getByRole('combobox', { name: 'Маршрут' }), 'route');
    view.rerender(<AssignmentDraftRecoveryEditor {...options} routes={[]} source={{ ...draft, comment: 'Обновлённый текст' }} onClose={vi.fn()} onRecover={recover} />);
    await user.click(screen.getByRole('button', { name: 'Сохранить копию' })); expect(recover).not.toHaveBeenCalled(); expect(screen.getByRole('textbox', { name: 'Комментарий' })).toHaveValue(draft.comment);
  });
  it('keeps unknown legacy records for raw export rather than inventing fields', () => {
    const raw = '[{"id":"incomplete","comment":"Не потерять"}]'; localStorage.setItem(key, raw);
    render(<LegacyDraftRecoveryModal {...options} onClose={vi.fn()} onRecover={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Строк с ошибками: 1'); expect(screen.queryByRole('button', { name: 'Подготовить копию' })).not.toBeInTheDocument(); expect(localStorage.getItem(key)).toBe(raw);
  });
});
