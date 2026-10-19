import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ focused: true, rows: [] as any[], page: vi.fn(), event: null as null | ((event: any) => void) }));
vi.mock('expo-router', async () => { const R = await import('react'); return { useFocusEffect: (cb: () => (() => void) | void) => R.useEffect(() => state.focused ? cb() : undefined, [cb, state.focused]) }; });
vi.mock('expo-crypto', () => ({ randomUUID: () => 'draft-id' }));
vi.mock('react-native', async () => { const R = await import('react'); return {
  View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', FlatList: 'FlatList', KeyboardAvoidingView: 'KeyboardAvoidingView',
  Modal: (p: any) => p.visible ? R.createElement('Modal', p, p.children) : null,
  Platform: { OS: 'android' }, Alert: { alert: vi.fn() }, AppState: { addEventListener: () => ({ remove: vi.fn() }) }
}; });
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('@/features/settings/themePreference', () => ({ useAppTheme: () => ({ colors: {} }) }));
vi.mock('@/features/emuTask/WorkAccountingPresentation', () => ({
  formatDateTime: String, formatParticipants: () => '', formatShortName: String, formatWorkAttachments: () => '',
  workDeliveryPresentation: () => ({ label: 'Сохранено' }), remarkStatusLabel: String, remarkStatusTone: () => 'neutral',
  statusLabel: String, statusTone: () => 'neutral', useWorkAccountingStyles: () => ({ helperText: { color: 'gray' } })
}));
vi.mock('@/ui/Screen', async () => { const R = await import('react'); return { Screen: (p: any) => R.createElement('Screen', p, p.children, p.bottomAction) }; });
vi.mock('@/ui/Card', () => ({ Card: 'Card' }));
vi.mock('@/ui/PrimaryButton', () => ({ PrimaryButton: 'PrimaryButton' }));
vi.mock('@/ui/ActionSheet', () => ({ ActionSheet: 'ActionSheet' }));
vi.mock('@/ui/StatusMessage', () => ({ StatusMessage: 'StatusMessage' }));
vi.mock('@/ui/StatusPill', () => ({ StatusPill: 'StatusPill' }));
vi.mock('@/ui/TransientNotice', () => ({ TransientNotice: 'TransientNotice' }));
vi.mock('@/ui/TextField', () => ({ TextField: 'TextInput' }));
vi.mock('@/ui/SelectField', () => ({ SelectField: 'SelectField' }));
vi.mock('@/ui/useReducedMotion', () => ({ useReducedMotion: () => false }));
vi.mock('@/services/mobileErrorReporter', () => ({ logMobileError: vi.fn() }));
vi.mock('@/services/mediaAttachmentService', () => ({}));
vi.mock('@/services/workTaskService', () => ({ loadWorkItemsOfflineFirst: async () => undefined, loadMoreWorkItems: async () => null }));
vi.mock('@/services/formNavigationGuard', () => ({ registerFormNavigationGuard: () => () => undefined }));
vi.mock('@/services/pointDraftController', () => ({ createFormDraftController: () => ({ update: vi.fn(), close: vi.fn(), flushUntilSettled: async () => undefined }) }));
vi.mock('@/auth/dataOwnerContext', () => ({ captureDataOwnerContext: async () => ({ ownerUserId: 'a', contourId: 'test', generation: 1 }), assertDataOwnerContext: async () => undefined }));
vi.mock('@/db/repositories/shiftRemarkRepository', () => ({ listShiftRemarksPage: async () => ({ items: [], nextCursor: null }) }));
vi.mock('@/db/repositories/workDraftRepository', () => ({ listWorkDraftsForContext: async () => [], saveWorkDraftForContext: vi.fn() }));
vi.mock('@/db/repositories/workTaskRepository', () => ({
  listLocalWorkItemsPage: state.page, getWorkListVisibleLimit: async () => 25, setWorkListVisibleLimit: vi.fn(),
  listMobileEmployees: async () => [{ employeeId: 'employee', fullName: 'Иванов' }], listEmuSections: async () => [{ sectionId: 'section', name: 'Цех' }]
}));
vi.mock('@/sync/syncEvents', () => ({ subscribeToSyncEvents: (cb: (event: any) => void) => { state.event = cb; return () => { state.event = null; }; } }));
import { WorkAccountingScreen } from '@/features/emuTask/WorkAccountingScreen';
let screen: ReactTestRenderer | undefined;
const list = () => screen!.root.findByType('FlatList' as any);
const emit = () => state.event?.({ snapshotRefreshed: false, refreshedZones: ['workItems'] });
const deferred = <T,>() => { let resolve!: (result: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; vi.clearAllMocks(); state.focused = true;
  state.rows = Array.from({ length: 50 }, (_, index) => ({ itemId: String(index), title: `Работа ${index}`, plannedAt: null, createdAtLocal: new Date(Date.UTC(2026, 8, 30) - index * 1000).toISOString() }));
  state.page.mockImplementation(async (limit, cursor) => {
    const offset = Number(cursor ?? 0);
    return { items: structuredClone(state.rows.slice(offset, offset + limit)), nextCursor: offset + limit < state.rows.length ? String(offset + limit) : null };
  });
});
afterEach(async () => { if (screen) await act(() => screen!.unmount()); screen = undefined; });
const mount = async () => { await act(async () => { screen = create(React.createElement(WorkAccountingScreen)); }); };
it('defers background reads until pagination finishes and keeps all newly exposed rows', async () => {
  await mount(); expect(list().props.data).toHaveLength(25);
  const pending = deferred<any>(); state.page.mockReturnValueOnce(pending.promise);
  await act(async () => { void list().props.ListFooterComponent.props.onPress(); });
  const reads = state.page.mock.calls.length;
  await act(async () => emit());
  expect(state.page).toHaveBeenCalledTimes(reads);
  const page = { items: structuredClone(state.rows.slice(25)), nextCursor: null };
  state.rows[0] = { ...state.rows[0], title: 'Обновлённая работа' };
  await act(async () => pending.resolve(page));
  expect(list().props.data).toHaveLength(50);
  expect(new Set(list().props.data.map((row: any) => row.itemId)).size).toBe(50);
  expect(list().props.data[0].title).toBe('Обновлённая работа');
});
it('background refresh retains the open task form, text and employee choice', async () => {
  await mount();
  const createMenu = screen!.root.findAllByType('ActionSheet' as any).find(node => node.props.title === 'Что создать?')!;
  await act(async () => { await createMenu.props.actions[0].onPress(); });
  const input = () => screen!.root.findByProps({ accessibilityLabel: 'Задача' });
  await act(async () => input().props.onChangeText('Длинный текст, который ещё дописываю'));
  const original = input();
  await act(async () => emit());
  expect(input()).toBe(original);
  expect(input().props.value).toBe('Длинный текст, который ещё дописываю');
  const employee = screen!.root.findAllByType('SelectField' as any).find(node => node.props.label === 'Исполнитель')!;
  expect(employee.props.selectedId).toBe('employee');
  expect(screen!.root.findAllByType('StatusPill' as any).some(node => node.props.label === 'Обновляем данные…')).toBe(false);
});

it('keeps the old bottom row when eighty new tasks arrive above two loaded pages', async () => {
  await mount(); await act(async () => { await list().props.ListFooterComponent.props.onPress(); });
  const previous = list().props.data.map((row: any) => row.itemId);
  state.rows = [...Array.from({ length: 80 }, (_, i) => ({ itemId: 'new-' + i, title: 'Новое', plannedAt: null,
    createdAtLocal: new Date(Date.UTC(2026, 9, 1) - i * 1000).toISOString() })), ...state.rows];
  await act(async () => emit());
  const ids = list().props.data.map((row: any) => row.itemId);
  expect(ids).toHaveLength(130); expect(ids.slice(-50)).toEqual(previous);
  expect(new Set(ids).size).toBe(130);
});

it('revisiting works keeps creation enabled and retains loaded pages during a slow read', async () => {
  await mount(); await act(async () => { await list().props.ListFooterComponent.props.onPress(); });
  const original = list().props.data;
  state.focused = false;
  await act(async () => screen!.update(React.createElement(WorkAccountingScreen)));
  const pending = deferred<any>(); state.page.mockReturnValueOnce(pending.promise);
  state.focused = true;
  await act(async () => screen!.update(React.createElement(WorkAccountingScreen)));
  expect(list().props.data).toBe(original);
  expect(screen!.root.findByProps({ accessibilityLabel: 'Создать работу или замечание' }).props.disabled).toBe(false);
  await act(async () => pending.resolve({ items: structuredClone(state.rows.slice(0, 25)), nextCursor: '25' }));
  expect(list().props.data).toHaveLength(50);
});
