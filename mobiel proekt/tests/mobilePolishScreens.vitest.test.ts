import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';

const s = vi.hoisted(() => ({ db: null as unknown as DatabaseSync, owner: 'owner', generation: 1,
  writeBarrier: null as null | (() => Promise<void>), fail: false, clear: vi.fn(), enter: vi.fn(), route: 'request-1' }));
vi.mock('expo-router', async () => {
  const R = await import('react');
  return { useFocusEffect: (effect: () => void) => R.useEffect(effect, [effect]), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useLocalSearchParams: () => ({}) };
});
vi.mock('react-native', async () => {
  const R = await import('react');
  return { Text: 'Text', View: 'View', Pressable: 'Pressable', ScrollView: 'ScrollView', KeyboardAvoidingView: 'KeyboardAvoidingView',
    FlatList: (p: any) => R.createElement('FlatList', p, p.ListHeaderComponent, p.data?.map((item: any) => p.renderItem({ item }))),
    Modal: (p: any) => p.visible ? R.createElement('Modal', p, p.children) : null,
    Platform: { OS: 'android' }, Alert: { alert: vi.fn() }, AppState: { addEventListener: () => ({ remove() {} }) }, StyleSheet: { create: (v: unknown) => v } };
});
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'test-form' }));
vi.mock('@/features/settings/themePreference', () => ({ useAppTheme: () => ({ colors: {} }) }));
vi.mock('@/ui/useReducedMotion', () => ({ useReducedMotion: () => true }));
vi.mock('@/ui/TextField', () => ({ TextField: 'TextInput' }));
vi.mock('@/ui/PrimaryButton', () => ({ PrimaryButton: 'PrimaryButton' }));
vi.mock('@/ui/Card', () => ({ Card: 'Card' }));
vi.mock('@/ui/StatusMessage', () => ({ StatusMessage: 'StatusMessage' }));
vi.mock('@/ui/StatusPill', () => ({ StatusPill: 'StatusPill' }));
vi.mock('@/ui/ActionSheet', () => ({ ActionSheet: 'ActionSheet' }));
vi.mock('@/ui/SelectionTabs', () => ({ SelectionTabs: 'SelectionTabs', SelectionTransition: 'SelectionTransition' }));
vi.mock('@/ui/Screen', async () => {
  const R = await import('react');
  return { Screen: (p: any) => R.createElement('Screen', p, p.children, p.bottomAction), ScreenList: (p: any) => R.createElement('ScreenList', p, p.headerContent, p.data?.map((item: any) => p.renderItem({ item }))) };
});
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => s.owner }));
vi.mock('@/auth/sessionGeneration', () => ({ getSessionGeneration: () => s.generation }));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/db/database', () => ({ getDatabase: async () => ({
  getAllAsync: async (sql: string, args: any[]) => s.db.prepare(sql).all(...args),
  runAsync: async (sql: string, args: any[]) => { await s.writeBarrier?.(); if (s.fail) throw new Error('SQLite unavailable'); return s.db.prepare(sql).run(...args); }
}) }));
vi.mock('@/db/repositories/workTaskRepository', () => ({
  listLocalWorkItemsPage: async () => ({ items: [], nextCursor: null }), listMobileEmployees: async () => [{ employeeId: 'e', fullName: 'Employee' }, { employeeId: 'e2', fullName: 'Second Person' }],
  listEmuSections: async () => [{ sectionId: 'section', name: 'Section' }], getWorkListVisibleLimit: async () => 25, setWorkListVisibleLimit: async () => {},
}));
vi.mock('@/db/repositories/shiftRemarkRepository', () => ({ listShiftRemarksPage: async () => ({ items: [], nextCursor: null }) }));
vi.mock('@/services/workTaskService', () => ({ loadWorkItemsOfflineFirst: async () => [] }));
vi.mock('@/services/mediaAttachmentService', () => ({}));
vi.mock('@/services/mobileErrorReporter', () => ({ logMobileError: vi.fn() }));
vi.mock('@/services/mobileDataRefreshService', () => ({ refreshMobileData: async () => false }));
vi.mock('@/services/patrolEntryService', () => ({ enterPatrolRequest: s.enter }));
vi.mock('@/sync/syncTriggers', () => ({ requestMobileDataRefresh: vi.fn() }));
vi.mock('@/sync/syncEvents', () => ({ subscribeToSyncEvents: () => () => {} }));
vi.mock('@/sync/useSmoothRefreshIndicator', () => ({ useSmoothRefreshIndicator: () => ({ beginRefresh: vi.fn(), endRefresh: vi.fn(), showRefreshIndicator: false }) }));
vi.mock('@/db/repositories/patrolContextRepository', () => ({ getPatrolDeviceContext: async () => ({ assignmentId: 'assignment-1' }), clearCurrentPatrolIfMatches: s.clear }));
vi.mock('@/db/repositories/patrolRepository', () => ({
  listRequestBoard: async () => [{ requestId: 'request-1', routeName: 'Route', status: 'inProgress', plannedStartAt: '2026-09-28T01:00:00Z' }],
  getAssignmentById: async () => ({ requestId: 'request-1', assignmentId: 'assignment-1' }), getAssignmentProgress: async () => ({ completed: 0, total: 20 })
}));
vi.mock('@/features/emuTask/WorkAccountingPresentation', () => ({ useWorkAccountingStyles: () => ({ helperText: {} }), formatDateTime: String, formatShortName: String }));

import { WorkAccountingScreen } from '@/features/emuTask/WorkAccountingScreen';
import { RequestBoardScreen } from '@/features/patrol/RequestBoardScreen';
let screen: ReactTestRenderer;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  s.owner = 'owner'; s.generation = 1; s.fail = false; s.writeBarrier = null; s.clear.mockClear();
  s.db = new DatabaseSync(':memory:');
  s.db.exec('CREATE TABLE work_form_drafts(owner_user_id TEXT, contour_id TEXT, employee_id TEXT, form_kind TEXT, entity_id TEXT, payload_json TEXT, updated_at TEXT, PRIMARY KEY(owner_user_id,contour_id,employee_id,form_kind,entity_id))');
});
afterEach(async () => { if (screen) await act(() => screen.unmount()); s.db.close(); });
const button = (label: string) => (screen.root.findAllByType('PrimaryButton' as any).find(node => node.props.label === label) ?? screen.root.findAllByType('Pressable' as any).find(node => node.props.accessibilityLabel === label))!;
async function openCreateWork() {
  button('Создать работу или замечание').props.onPress();
}
async function chooseCreateWork() {
  const menu = screen.root.findAllByType('ActionSheet' as any).find(n => n.props.title === 'Что создать?')!;
  expect(menu.props.visible).toBe(true);
  menu.props.onClose();
  await menu.props.actions.find((a: any) => a.label === 'Создать работу').onPress();
}
const input = () => screen.root.findByProps({ accessibilityLabel: 'Задача' });

it('browsing the mounted request list keeps the selection and shows it once', async () => {
  await act(async () => { screen = create(React.createElement(RequestBoardScreen)); });
  expect(s.clear).not.toHaveBeenCalled();
  expect(screen.root.findByType('ScreenList' as any).props.data).toHaveLength(0);
  expect(button('Продолжить')).toBeDefined();
});
it('closing the mounted work form waits for characters typed during SQLite write', async () => {
  await act(async () => { screen = create(React.createElement(WorkAccountingScreen)); });
  await act(openCreateWork);
  await act(chooseCreateWork);
  let release!: () => void;
  s.writeBarrier = () => new Promise<void>(resolve => { release = () => { s.writeBarrier = null; resolve(); }; });
  await act(async () => { input().props.onChangeText('first'); button('Закрыть').props.onPress(); });
  await act(async () => { input().props.onChangeText('latest characters'); release(); });
  expect(screen.root.findAllByType('Modal' as any)).toHaveLength(0);
  const row = s.db.prepare('SELECT payload_json AS payload FROM work_form_drafts').get()!;
  expect(JSON.parse(row.payload as string).text).toBe('latest characters');
});
it('SQLite error keeps the form editable and retry saves the latest text', async () => {
  await act(async () => { screen = create(React.createElement(WorkAccountingScreen)); });
  await act(openCreateWork);
  await act(chooseCreateWork);
  s.fail = true;
  await act(async () => { input().props.onChangeText('first'); button('Закрыть').props.onPress(); });
  expect(button('Повторить сохранение')).toBeDefined();
  s.fail = false;
  await act(async () => { input().props.onChangeText('after error'); button('Повторить сохранение').props.onPress(); });
  expect(screen.root.findAllByType('Modal' as any)).toHaveLength(0);
  expect(JSON.parse(s.db.prepare('SELECT payload_json AS payload FROM work_form_drafts').get()!.payload as string).text).toBe('after error');
});
it('a tab transition retains the first destination and waits for the last input', async () => {
  const { navigateAfterFormSave } = await import('@/services/formNavigationGuard');
  await act(async () => { screen = create(React.createElement(WorkAccountingScreen)); });
  await act(openCreateWork);
  await act(chooseCreateWork);
  const first = vi.fn(); const second = vi.fn();
  let release!: () => void;
  s.writeBarrier = () => new Promise<void>(resolve => { release = () => { s.writeBarrier = null; resolve(); }; });
  await act(async () => { input().props.onChangeText('initial'); navigateAfterFormSave(first); navigateAfterFormSave(second); });
  expect(first).not.toHaveBeenCalled();
  await act(async () => { input().props.onChangeText('final tab text'); release(); });
  expect(first).toHaveBeenCalledTimes(1); expect(second).not.toHaveBeenCalled();
  expect(JSON.parse(s.db.prepare('SELECT payload_json AS payload FROM work_form_drafts').get()!.payload as string).text).toBe('final tab text');
});
it('a form opened by the previous account cannot save under the next account', async () => {
  await act(async () => { screen = create(React.createElement(WorkAccountingScreen)); });
  await act(openCreateWork);
  await act(chooseCreateWork);
  await act(async () => { input().props.onChangeText('private'); s.owner = 'next'; s.generation++; button('Закрыть').props.onPress(); });
  expect(screen.root.findAllByType('Modal' as any)).toHaveLength(1);
  expect(button('Повторить сохранение')).toBeDefined();
  expect(s.db.prepare('SELECT * FROM work_form_drafts').all()).toHaveLength(0);
});

it('searching and choosing an employee keeps the work text and saves the selection in the draft', async () => {
  await act(async () => { screen = create(React.createElement(WorkAccountingScreen)); });
  await act(openCreateWork);
  await act(chooseCreateWork);
  await act(async () => { input().props.onChangeText('preserved work'); button('Исполнитель: Выбрать').props.onPress(); });
  await act(async () => { screen.root.findByProps({ accessibilityLabel: 'Поиск: Исполнитель' }).props.onChangeText('Second'); });
  expect(screen.root.findAllByType('Pressable' as any).filter(node => node.props.accessibilityRole === 'radio').map(node => node.props.accessibilityLabel)).toEqual(['Second Person']);
  await act(async () => { button('Second Person').props.onPress(); });
  expect(input().props.value).toBe('preserved work');
  await act(async () => { button('Закрыть').props.onPress(); });
  const payload = JSON.parse(s.db.prepare('SELECT payload_json AS payload FROM work_form_drafts').get()!.payload as string);
  expect(payload.text).toBe('preserved work'); expect(payload.employeeId).toBe('e2');
});


it('compact work screen exposes creation through plus and all lists through the filter', async () => {
  await act(async () => { screen = create(React.createElement(WorkAccountingScreen)); });
  expect(screen.root.findByType('Screen' as any).props.title).toBe('');
  expect(screen.root.findAllByType('PrimaryButton' as any).some(n => n.props.label === 'Создать работу')).toBe(false);
  await act(openCreateWork);
  const createMenu = screen.root.findAllByType('ActionSheet' as any).find(n => n.props.title === 'Что создать?')!;
  expect(createMenu.props.actions.map((a: any) => a.label)).toEqual(['Создать работу', 'Создать замечание']);
  await act(() => createMenu.props.onClose());
  await act(() => button('Настроить фильтр').props.onPress());
  const filter = () => screen.root.findAllByType('ActionSheet' as any).find(n => n.props.title === 'Показать')!;
  expect(filter().props.visible).toBe(true);
  await act(async () => filter().props.actions[1].onPress());
  expect(filter().props.actions[1].icon).toBe('checkmark-circle');
  await act(async () => filter().props.actions[2].onPress());
  expect(filter().props.actions[2].icon).toBe('checkmark-circle');
  await act(async () => filter().props.actions[0].onPress());
  expect(filter().props.actions[0].icon).toBe('checkmark-circle');
});
