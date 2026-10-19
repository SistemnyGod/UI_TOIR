import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const s = vi.hoisted(() => ({
  task: { itemId: 'work-1', taskId: 'work-1', title: 'Замена ленты', status: 'inProgress', createdAtLocal: '2026-10-01T00:00:00Z' },
  remark: { remarkId: 'remark-1', sectionName: 'Цех', comment: 'Протечка', status: 'pending', employeeName: null, createdAtLocal: '2026-10-01T00:00:00Z', mediaClientFileIds: [] },
  pause: vi.fn(async () => undefined), complete: vi.fn(async () => undefined), photo: vi.fn(async () => undefined)
}));
vi.mock('expo-router', async () => { const R = await import('react'); return { useFocusEffect: (cb: () => (() => void) | void) => R.useEffect(cb, [cb]) }; });
vi.mock('expo-crypto', () => ({ randomUUID: () => 'id' }));
vi.mock('react-native', async () => { const R = await import('react'); return {
  View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', KeyboardAvoidingView: 'KeyboardAvoidingView',
  FlatList: (p: any) => R.createElement('FlatList', p, p.data?.map((item: any) => R.createElement(R.Fragment, { key: p.keyExtractor(item) }, p.renderItem({ item })))),
  Modal: (p: any) => p.visible ? R.createElement('Modal', p, p.children) : null,
  Platform: { OS: 'android' }, Alert: { alert: vi.fn() }, AppState: { addEventListener: () => ({ remove: vi.fn() }) }
}; });
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('@/features/settings/themePreference', () => ({ useAppTheme: () => ({ colors: {} }) }));
vi.mock('@/features/emuTask/WorkAccountingPresentation', () => ({
  formatDateTime: String, formatShortName: String, remarkStatusLabel: String, remarkStatusTone: () => 'neutral', useWorkAccountingStyles: () => ({ helperText: {} })
}));
vi.mock('@/features/emuTask/WorkTaskCard', () => ({ WorkTaskCard: 'WorkTaskCard' }));
vi.mock('@/features/emuTask/WorkTaskActions', () => ({
  TaskMenu: 'TaskMenu', getTaskPrimaryAction: (task: any, handlers: any) => ({ label: 'Завершить', onPress: () => handlers.onComplete(task) })
}));
vi.mock('@/ui/Screen', async () => { const R = await import('react'); return { Screen: (p: any) => R.createElement('Screen', p, p.children, p.bottomAction, p.floatingNotice) }; });
vi.mock('@/ui/Card', () => ({ Card: 'Card' }));
vi.mock('@/ui/EmptyState', () => ({ EmptyState: 'EmptyState' }));
vi.mock('@/ui/PrimaryButton', () => ({ PrimaryButton: 'PrimaryButton' }));
vi.mock('@/ui/ActionSheet', () => ({ ActionSheet: 'ActionSheet' }));
vi.mock('@/ui/StatusMessage', () => ({ StatusMessage: 'StatusMessage' }));
vi.mock('@/ui/StatusPill', () => ({ StatusPill: 'StatusPill' }));
vi.mock('@/ui/TransientNotice', () => ({ TransientNotice: 'TransientNotice' }));
vi.mock('@/ui/TextField', () => ({ TextField: 'TextInput' }));
vi.mock('@/ui/SelectField', () => ({ SelectField: 'SelectField' }));
vi.mock('@/ui/useReducedMotion', () => ({ useReducedMotion: () => true }));
vi.mock('@/services/mobileErrorReporter', () => ({ logMobileError: vi.fn() }));
vi.mock('@/services/mediaAttachmentService', () => ({ attachRemarkPhotoFromCamera: s.photo }));
vi.mock('@/services/workTaskService', () => ({ loadWorkItemsOfflineFirst: async () => undefined, loadMoreWorkItems: async () => null }));
vi.mock('@/services/formNavigationGuard', () => ({ registerFormNavigationGuard: () => () => undefined }));
vi.mock('@/services/pointDraftController', () => ({ createFormDraftController: () => ({
  update: vi.fn(), close: vi.fn(), pause: async () => undefined, resume: vi.fn(), flushUntilSettled: async () => undefined, requestLeave: async (leave: () => void) => leave()
}) }));
vi.mock('@/auth/dataOwnerContext', () => ({ captureDataOwnerContext: async () => ({ ownerUserId: 'a', contourId: 'test', generation: 1 }), assertDataOwnerContext: async () => undefined }));
vi.mock('@/db/repositories/shiftRemarkRepository', () => ({ listShiftRemarksPage: async () => ({ items: [s.remark], nextCursor: null }) }));
vi.mock('@/db/repositories/workDraftRepository', () => ({
  listWorkDraftsForContext: async () => [], saveWorkDraftForContext: vi.fn(), invalidateWorkDraftForContext: vi.fn(), waitForWorkDraftForContext: async () => undefined
}));
vi.mock('@/db/repositories/workTaskRepository', () => ({
  listLocalWorkItemsPage: async () => ({ items: [s.task], nextCursor: null }), getWorkListVisibleLimit: async () => 25, setWorkListVisibleLimit: async () => undefined,
  listMobileEmployees: async () => [{ employeeId: 'employee', fullName: 'Иванов' }], listEmuSections: async () => [{ sectionId: 'section', name: 'Цех' }],
  pauseWorkTaskLocally: s.pause, completeWorkTaskLocally: s.complete
}));
vi.mock('@/sync/syncEvents', () => ({ subscribeToSyncEvents: () => () => undefined }));
import { WorkAccountingScreen } from '@/features/emuTask/WorkAccountingScreen';

let screen: ReactTestRenderer | undefined;
beforeEach(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; vi.clearAllMocks(); });
afterEach(async () => { if (screen) await act(() => screen!.unmount()); screen = undefined; });
const mount = async () => { await act(async () => { screen = create(React.createElement(WorkAccountingScreen)); }); };
const sheet = (title: string) => screen!.root.findAllByType('ActionSheet' as any).find(node => node.props.title === title)!;
const notice = () => screen!.root.findByType('TransientNotice' as any).props.message;
const button = (label: string) => screen!.root.findAllByType('PrimaryButton' as any).find(node => node.props.label === label)!;

it('shows remarks through the filter and attaches a camera photo to the chosen remark', async () => {
  await mount();
  expect(screen!.root.findAllByType('WorkTaskCard' as any)).toHaveLength(1);
  await act(async () => sheet('Показать').props.actions[2].onPress());
  expect(screen!.root.findAllByType('WorkTaskCard' as any)).toHaveLength(0);
  expect(screen!.root.findAllByType('Text' as any).some(node => node.props.children === 'Протечка')).toBe(true);
  await act(async () => button('Добавить вложение').props.onPress());
  expect(sheet('Вложение: Цех').props.visible).toBe(true);
  await act(async () => sheet('Вложение: Цех').props.actions.find((action: any) => action.label === 'Сделать фото').onPress());
  expect(s.photo).toHaveBeenCalledWith('remark-1');
  expect(sheet('Вложение к замечанию').props.visible).toBe(false);
  expect(notice()).toBe('Фото замечания сохранено на телефоне и будет отправлено на сервер.');
});

it('pausing from the work menu saves locally, closes the menu and reports it', async () => {
  await mount();
  await act(async () => screen!.root.findByType('WorkTaskCard' as any).props.onMenu());
  const menu = () => screen!.root.findByType('TaskMenu' as any);
  expect(menu().props.task).toEqual(s.task);
  await act(async () => menu().props.onPause(menu().props.task));
  expect(s.pause).toHaveBeenCalledWith(s.task, '');
  expect(menu().props.task).toBeNull();
  expect(notice()).toBe('Работа поставлена на паузу.');
});

it('completing a work requires a result and saves it with the form draft key', async () => {
  await mount();
  await act(async () => screen!.root.findByType('WorkTaskCard' as any).props.primary.onPress());
  expect(screen!.root.findAllByType('Modal' as any)).toHaveLength(1);
  await act(async () => button('Завершить работу').props.onPress());
  expect(s.complete).not.toHaveBeenCalled();
  expect(screen!.root.findByType('StatusMessage' as any).props.message).toBe('Заполните результат работы перед завершением.');
  await act(async () => screen!.root.findByProps({ accessibilityLabel: 'Результат выполнения' }).props.onChangeText(' Лента заменена '));
  await act(async () => button('Завершить работу').props.onPress());
  expect(s.complete).toHaveBeenCalledWith(s.task, 'Лента заменена', 'form:id');
  expect(screen!.root.findAllByType('Modal' as any)).toHaveLength(0);
  expect(notice()).toBe('Работа завершена на телефоне и будет отправлена на сервер.');
});
