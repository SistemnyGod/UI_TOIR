import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// The handover action in the patrol menu, the colleague list and the handover screen:
// offline only colleagues of this phone can be picked, a colleague on this phone takes
// the patrol over at once, and a patrol sent to another phone shows that it waits for sync.
const state = vi.hoisted(() => ({
  push: vi.fn(), replace: vi.fn(), routerPush: vi.fn(), context: vi.fn(), local: vi.fn(), server: vi.fn(), transfer: vi.fn()
}));
vi.mock('expo-router', async () => { const R = await import('react'); return {
  router: { push: state.routerPush },
  useFocusEffect: (cb: () => (() => void) | void) => R.useEffect(() => cb(), [cb]),
  useLocalSearchParams: () => ({ assignmentId: 'a1' }), useRouter: () => ({ push: state.push, replace: state.replace })
}; });
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', Pressable: 'Pressable', StyleSheet: { create: (s: any) => s } }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
vi.mock('@/features/settings/themePreference', () => ({ useAppTheme: () => ({ colors: {} }) }));
vi.mock('@/sync/syncEvents', () => ({ subscribeToSyncEvents: () => () => undefined }));
vi.mock('@/api/patrolTransferApi', () => ({ getPatrolTransferCandidates: state.server }));
vi.mock('@/db/repositories/patrolTransferRepository', () => ({
  getPatrolTransferContext: state.context, listLocalTransferCandidates: state.local, transferAssignmentLocally: state.transfer
}));
vi.mock('@/ui/Screen', async () => { const R = await import('react'); return { Screen: (p: any) => R.createElement('Screen', p, p.children, p.bottomAction) }; });
vi.mock('@/ui/Card', () => ({ Card: 'Card' }));
vi.mock('@/ui/EmptyState', async () => { const R = await import('react'); return { EmptyState: (p: any) => R.createElement('Text', null, `${p.title} ${p.text ?? ''}`) }; });
vi.mock('@/ui/PrimaryButton', () => ({ PrimaryButton: 'PrimaryButton' }));
vi.mock('@/ui/StatusMessage', async () => { const R = await import('react'); return { StatusMessage: (p: any) => R.createElement('Text', null, p.message) }; });
vi.mock('@/ui/StatusPill', () => ({ StatusPill: 'StatusPill' }));
vi.mock('@/ui/TextField', () => ({ TextField: 'TextField' }));

import { buildPatrolActionMenu } from '@/features/patrol/patrolActionMenu';
import { PatrolHandoverScreen } from '@/features/patrol/PatrolHandoverScreen';
import { mergeTransferCandidates, transferCandidateBlocker, transferRefusalMessage } from '@/domain/patrol/patrolTransferPolicy';

let screen: ReactTestRenderer | undefined;
const ivanov = { employeeId: 'ivanov', fullName: 'Иванов И.', position: null, sameAccount: true, hasPatrolInProgress: true };
const petrov = { employeeId: 'petrov', fullName: 'Петров П.', position: 'Обходчик', sameAccount: true, hasPatrolInProgress: false };
const sidorov = { employeeId: 'sidorov', fullName: 'Сидоров С.', position: null, sameAccount: false, hasPatrolInProgress: false };
const context = (overrides: Record<string, unknown> = {}) => ({
  assignmentId: 'a1', requestId: 'request-a1', routeName: 'Обход печей', status: 'inProgress', performerId: 'ivanov', performerName: 'Иванов И.',
  filledPointCount: 2, totalPointCount: 5, serverSupportsTransfer: true, pending: null, ...overrides
});
const text = () => screen!.root.findAllByType('Text' as any).map(node => node.children.filter(child => typeof child === 'string').join('')).join(' ');
const submit = () => screen!.root.findAllByType('PrimaryButton' as any).find(node => node.props.testID === 'handover-submit');
const candidate = (id: string) => screen!.root.findAll(node => node.props.testID === `handover-candidate-${id}`)[0];
const mount = async () => { await act(async () => { screen = create(React.createElement(PatrolHandoverScreen)); }); };

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; vi.clearAllMocks();
  state.context.mockResolvedValue(context());
  state.local.mockResolvedValue([ivanov, petrov]);
  state.server.mockResolvedValue([{ ...ivanov, sameAccount: false }, { ...petrov, sameAccount: false }, sidorov]);
  state.transfer.mockResolvedValue('operation-1');
});
afterEach(async () => { if (screen) await act(() => screen!.unmount()); screen = undefined; });

it('offers the handover for a started or paused patrol and opens the handover screen', () => {
  const labels = (status: string) => buildPatrolActionMenu({ assignmentId: 'a1', status }).map(item => item.label);
  expect(labels('inProgress')).toContain('Передать коллеге');
  expect(labels('paused')).toContain('Передать коллеге');
  expect(labels('accepted')).not.toContain('Передать коллеге');
  expect(labels('completedLocal')).not.toContain('Передать коллеге');
  expect(buildPatrolActionMenu({ assignmentId: 'a1', status: 'inProgress', onHandover: null }).map(item => item.label)).not.toContain('Передать коллеге');
  buildPatrolActionMenu({ assignmentId: 'a1', status: 'inProgress' }).find(item => item.label === 'Передать коллеге')!.onPress();
  expect(state.routerPush).toHaveBeenCalledWith('/patrol/assignment/a1/handover');
});

it('lists colleagues of this phone first and blocks other phones while offline', () => {
  const merged = mergeTransferCandidates([ivanov, petrov], [{ ...petrov, sameAccount: false, hasPatrolInProgress: true }, sidorov], 'ivanov');
  expect(merged.map(item => [item.employeeId, item.sameAccount, item.hasPatrolInProgress])).toEqual([['petrov', true, true], ['sidorov', false, false]]);
  expect(transferCandidateBlocker(sidorov, 'inProgress', false)).toContain('Нужна связь');
  expect(transferCandidateBlocker(sidorov, 'inProgress', true)).toBeNull();
  expect(transferCandidateBlocker({ ...petrov, hasPatrolInProgress: true }, 'inProgress', false)).toContain('уже есть начатый обход');
  expect(transferCandidateBlocker({ ...petrov, hasPatrolInProgress: true }, 'paused', false)).toBeNull();
  expect(transferRefusalMessage('transferTargetBusy', 'x')).toBe('Коллега уже выполняет другой обход.');
  expect(transferRefusalMessage('unknown', 'Сервер отклонил')).toBe('Сервер отклонил');
});

it('hands the patrol to a colleague on this phone and returns to the patrol', async () => {
  await mount();
  expect(text()).toContain('Заполнено точек: 2 из 5');
  expect(text()).toContain('Сидоров С.');
  expect(submit()!.props.disabled).toBe(true);
  await act(async () => candidate('petrov').props.onPress());
  expect(submit()!.props.label).toBe('Передать: Петров П.');
  await act(async () => submit()!.props.onPress());
  expect(state.transfer).toHaveBeenCalledWith({ assignmentId: 'a1', toEmployeeId: 'petrov', toEmployeeName: 'Петров П.', sameAccount: true, reason: '' });
  expect(state.replace).toHaveBeenCalledWith('/patrol/assignment/a1');
});

it('offline keeps only colleagues of this phone and a patrol sent to another phone waits for sync', async () => {
  state.server.mockRejectedValue(new Error('offline'));
  await mount();
  expect(text()).toContain('Нет связи с сервером');
  expect(text()).not.toContain('Сидоров С.');
  await act(async () => screen!.unmount()); screen = undefined;

  state.server.mockResolvedValue([sidorov]);
  await mount();
  await act(async () => candidate('sidorov').props.onPress());
  state.context.mockResolvedValue(context({ status: 'paused', pending: { toEmployeeName: 'Сидоров С.', mode: 'otherDevice', status: 'pending', lastError: null } }));
  await act(async () => submit()!.props.onPress());
  expect(state.transfer).toHaveBeenCalledWith(expect.objectContaining({ toEmployeeId: 'sidorov', sameAccount: false }));
  expect(text()).toContain('Передача сохранена');
  expect(text()).toContain('Сидоров С. получит обход на своём телефоне');
});

it('explains a server without the handover and a patrol that is gone', async () => {
  state.context.mockResolvedValue(context({ serverSupportsTransfer: false }));
  await mount();
  expect(text()).toContain('сервер ещё не поддерживает передачу');
  expect(submit()).toBeUndefined();
  await act(async () => screen!.unmount()); screen = undefined;

  state.context.mockResolvedValue(null);
  await mount();
  expect(text()).toContain('Обход не найден');
});
