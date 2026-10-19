import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SubmitReportScreen } from '@/features/patrol/SubmitReportScreen';

const state = vi.hoisted(() => ({
  params: { assignmentId: 'assignment-a', mode: undefined as string | undefined }, focused: true,
  owner: 'account-a', completed: false, sync: null as null | (() => void),
  readiness: {} as any, delivery: {} as any, preview: undefined as any,
  push: vi.fn(), replace: vi.fn(), queue: vi.fn(), repair: vi.fn(), retry: vi.fn(),
  fullyDelivered: vi.fn(), finishNavigation: vi.fn(), clear: vi.fn(), log: vi.fn()
}));
vi.mock('expo-router', async () => {
  const R = await import('react');
  const router = { push: state.push, replace: state.replace };
  return { useRouter: () => router, useLocalSearchParams: () => state.params,
    useFocusEffect: (callback: () => (() => void) | void) => R.useEffect(() => state.focused ? callback() : undefined, [callback, state.focused]) };
});
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: (s: any) => s } }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('@/features/patrol/AutoSubmitCountdown', () => ({ AutoSubmitCountdown: () => null }));
vi.mock('@/features/settings/themePreference', () => ({ useAppTheme: () => ({ colors: { text: 'text', mutedText: 'muted', primary: 'primary', backgroundAccent: 'neutral', warning: 'warning', warningSurface: 'warnSurface', success: 'success', successSurface: 'successSurface', danger: 'danger', dangerSurface: 'dangerSurface' } }) }));
vi.mock('@/ui/Card', () => ({ Card: 'Card' }));
vi.mock('@/ui/PrimaryButton', () => ({ PrimaryButton: 'PrimaryButton' }));
vi.mock('@/ui/StatusMessage', () => ({ StatusMessage: 'StatusMessage' }));
vi.mock('@/ui/Screen', async () => {
  const R = await import('react');
  return { Screen: (p: any) => R.createElement('Screen', p, p.children, p.bottomAction) };
});
vi.mock('@/ui/ActionSheet', async () => {
  const R = await import('react');
  return { ActionSheet: (p: any) => p.visible ? R.createElement('ActionSheet', p) : null };
});
vi.mock('@/features/patrol/ReportSendDialog', async () => {
  const R = await import('react');
  return { ReportSendDialog: (p: any) => p.visible ? R.createElement('ReportSendDialog', p) : null };
});
vi.mock('@/auth/dataOwnerContext', () => ({
  captureDataOwnerContext: async () => ({ ownerUserId: state.owner, contourId: 'contour', sessionGeneration: 1 }),
  assertDataOwnerContext: async (scope: any) => { if (scope.ownerUserId !== state.owner) throw new Error('Сессия изменена'); }
}));
vi.mock('@/db/repositories/outboxRepository', () => ({ getReportDeliveryState: async () => state.delivery }));
vi.mock('@/db/repositories/patrolRepository', () => ({ getReportReadiness: async () => state.readiness, reopenInvalidCompletionReportLocally: state.repair,
  getReportPreviewPoints: async () => { if (state.preview instanceof Error) throw state.preview; return state.preview; } }));
vi.mock('@/db/repositories/patrolContextRepository', () => ({ clearCurrentPatrolIfMatches: state.clear, getPatrolDeviceContext: async () => ({ assignmentId: null }) }));
vi.mock('@/services/patrolNavigationService', () => ({ getPatrolReportState: async () => ({ completedLocally: state.completed }), isReportFullyDelivered: state.fullyDelivered, finishDeliveredNavigation: state.finishNavigation, deliveredBoardPath: '/patrol/request-board?notice=delivered' }));
vi.mock('@/services/mobileErrorReporter', () => ({ logMobileError: state.log }));
vi.mock('@/sync/syncEvents', () => ({ shouldReloadReportAfterSync: () => true, subscribeToSyncEvents: (callback: () => void) => { state.sync = callback; return () => { state.sync = null; }; } }));
vi.mock('@/sync/PatrolSyncCoordinator', () => ({ requestPatrolSync: state.retry }));
vi.mock('@/features/patrol/reportSubmissionCoordinator', () => ({ queuePatrolReport: state.queue }));

let screen: ReactTestRenderer;
const buttons = () => screen.root.findAllByType('PrimaryButton' as any);
const button = (label: string) => buttons().find(n => n.props.label === label)!;
const text = () => screen.root.findAllByType('Text' as any).map(n => n.children.filter(c => typeof c === 'string').join('')).join('\n');
const link = (label: string) => screen.root.findAllByType('Pressable' as any).find(n => n.findAllByType('Text' as any).some(t => t.children.join('') === label))!;
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const mount = async () => { await act(async () => { screen = create(React.createElement(SubmitReportScreen)); }); };

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  state.params = { assignmentId: 'assignment-a', mode: undefined };
  state.focused = true; state.owner = 'account-a'; state.completed = false;
  state.readiness = { ready: true, assignment: { routeName: 'Длинное название маршрута' }, progress: { completed: 20, total: 20, inspected: 20, issues: 0, skipped: 0, deferred: 0 }, problems: [] };
  state.delivery = { status: 'notQueued' };
  state.preview = undefined;
  state.queue.mockResolvedValue({ clientOperationId: 'completion-a' });
  state.fullyDelivered.mockResolvedValue(true);
  state.finishNavigation.mockResolvedValue(true);
});
afterEach(async () => { if (screen) await act(() => screen.unmount()); });

it('ready summary submits immediately once for a double tap and then shows the existing report', async () => {
  const write = deferred<{ clientOperationId: string }>();
  state.queue.mockImplementation(() => write.promise);
  await mount();
  expect(text()).toContain('Всё готово к отправке отчёта');
  expect(text()).toContain('20 из 20');
  expect(state.queue).not.toHaveBeenCalled();
  await act(async () => { const send = button('Отправить отчёт').props.onPress; send(); send(); });
  expect(state.queue).toHaveBeenCalledExactlyOnceWith('assignment-a');
  expect(button('Отправляем отчёт…').props.disabled).toBe(true);
  state.completed = true; state.delivery = { status: 'waitingNetwork', clientOperationId: 'completion-a', lastError: null };
  await act(async () => write.resolve({ clientOperationId: 'completion-a' }));
  expect(text()).toContain('Отчёт сохранён на телефоне');
  expect(button('Отправить отчёт')).toBeUndefined();
  expect(link('К выбору заявок')).toBeDefined();
  expect(state.replace).not.toHaveBeenCalled();
});

it.each([0, 8])('incomplete %s/20 opens missing points and counts route problems separately', async (completed) => {
  state.readiness = { ...state.readiness, ready: false, progress: { ...state.readiness.progress, completed }, problems: [
    { pointId: 'p1', pointName: 'Точка 1', orderIndex: 1, reason: 'Нужно фото' },
    { pointId: 'p1', pointName: 'Точка 1', orderIndex: 1, reason: 'Нужен комментарий' },
    { pointId: 'route', pointName: 'Маршрут', orderIndex: 0, reason: 'Проверьте назначение' }
  ] };
  await mount();
  const notice = screen.root.findByType('ActionSheet' as any);
  expect(notice.props.title).toBe('Нужно заполнить результаты');
  expect(text()).not.toContain('Нужно заполнить результаты');
  expect(text()).not.toContain('Всё готово к отправке отчёта');
  expect(notice.props.message).toContain('Точек, требующих внимания: 1.');
  expect(screen.root.findByType('Screen' as any).props.bottomActionBackground).toBe('transparent');
  await act(async () => notice.props.onClose());
  expect(text()).toContain('Проблемы маршрута');
  await act(async () => button('Открыть незаполненные').props.onPress());
  expect(state.push).toHaveBeenCalledWith('/patrol/assignment/assignment-a/all-points?filter=attention');
  expect(state.queue).not.toHaveBeenCalled();
});

it('local write failure leaves Send available and exposes the actual error without claiming delivery', async () => {
  state.queue.mockRejectedValueOnce(new Error('SQLite: диск заполнен'));
  await mount();
  await act(async () => button('Отправить отчёт').props.onPress());
  expect(screen.root.findByType('StatusMessage' as any).props).toMatchObject({ message: 'SQLite: диск заполнен', tone: 'danger' });
  expect(button('Отправить отчёт').props.disabled).toBe(false);
  expect(text()).not.toContain('Отчёт доставлен');
  expect(state.replace).not.toHaveBeenCalled();
  await act(async () => button('Отправить отчёт').props.onPress());
  expect(state.queue).toHaveBeenCalledTimes(2);
});

it.each([
  ['waitingAuth', 'Войти и продолжить отправку', '/(auth)/login'],
  ['wrongContour', 'Проверить настройки сервера', '/(auth)/server-settings'],
  ['repairRequired', 'Исправить отчёт', '/patrol/assignment/assignment-a/all-points?filter=attention']
])('%s action has priority over incomplete results', async (status, label, path) => {
  state.completed = true; state.delivery = { status, lastError: null }; state.readiness.ready = false;
  await mount();
  await act(async () => button(label).props.onPress());
  expect(state.push).toHaveBeenCalledWith(path);
  expect(state.queue).not.toHaveBeenCalled();
});

it('unconfirmed files keep the report on screen and allow an explicit exit without a second completion', async () => {
  state.completed = true; state.delivery = { status: 'delivered', clientOperationId: 'completion-a' };
  state.fullyDelivered.mockResolvedValue(false);
  await mount();
  expect(text()).toContain('Ожидаем вложения');
  expect(text()).not.toContain('Отчёт доставлен');
  expect(state.finishNavigation).not.toHaveBeenCalled();
  await act(async () => link('К выбору заявок').props.onPress());
  expect(state.clear).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: 'account-a' }), 'assignment-a', expect.any(Function));
  expect(state.replace).toHaveBeenCalledWith('/patrol/request-board');
  expect(state.queue).not.toHaveBeenCalled();
});

it('history retains a fully delivered report and opens the queue directly', async () => {
  state.params.mode = 'history'; state.completed = true; state.delivery = { status: 'delivered', clientOperationId: 'completion-a' };
  await mount();
  expect(text()).toContain('Отчёт доставлен');
  expect(state.finishNavigation).not.toHaveBeenCalled();
  expect(state.replace).not.toHaveBeenCalled();
  expect(screen.root.findAllByType('ActionSheet' as any)).toHaveLength(0);
  await act(async () => screen.root.findAllByType('Pressable' as any).find(n => n.props.accessibilityLabel === 'Очередь отправки отчётов')!.props.onPress());
  expect(state.push).toHaveBeenCalledWith('/settings/sync-queue');
});

it.each(['blur', 'account', 'assignment'])('late delivery after %s cannot clear context or navigate', async (change) => {
  const files = deferred<boolean>();
  state.completed = true; state.delivery = { status: 'delivered', clientOperationId: 'completion-a' };
  state.fullyDelivered.mockImplementationOnce(() => files.promise);
  await mount();
  if (change === 'blur') state.focused = false;
  if (change === 'account') state.owner = 'account-b';
  if (change === 'assignment') { state.params = { assignmentId: 'assignment-b', mode: undefined }; state.completed = false; state.delivery = { status: 'notQueued' }; }
  await act(async () => screen.update(React.createElement(SubmitReportScreen)));
  await act(async () => files.resolve(true));
  expect(state.finishNavigation).not.toHaveBeenCalled();
  expect(state.replace).not.toHaveBeenCalled();
});

it('a delivered report stays visible until the user explicitly continues', async () => {
  state.completed = true; state.delivery = { status: 'delivered', clientOperationId: 'completion-a' };
  await mount();
  expect(state.finishNavigation).not.toHaveBeenCalled();
  expect(state.replace).not.toHaveBeenCalled();
  expect(text()).toContain('Отчёт доставлен');
  await act(async () => button('К выбору заявок').props.onPress());
  expect(state.replace).toHaveBeenCalledWith('/patrol/request-board');
});

it('an old submission cannot release a new assignment submission lock or update its summary', async () => {
  const oldWrite = deferred<{ clientOperationId: string }>();
  const newWrite = deferred<{ clientOperationId: string }>();
  state.queue.mockImplementationOnce(() => oldWrite.promise).mockImplementationOnce(() => newWrite.promise);
  await mount();
  await act(async () => button('Отправить отчёт').props.onPress());
  state.params = { assignmentId: 'assignment-b', mode: undefined };
  await act(async () => screen.update(React.createElement(SubmitReportScreen)));
  await act(async () => button('Отправить отчёт').props.onPress());
  await act(async () => oldWrite.resolve({ clientOperationId: 'completion-a' }));
  expect(button('Отправляем отчёт…').props.disabled).toBe(true);
  expect(text()).not.toContain('Отчёт сохранён на телефоне');
  expect(state.queue.mock.calls.map(args => args[0])).toEqual(['assignment-a', 'assignment-b']);
  state.completed = true; state.delivery = { status: 'queued', clientOperationId: 'completion-b' };
  await act(async () => newWrite.resolve({ clientOperationId: 'completion-b' }));
  expect(text()).toContain('Отчёт сохранён на телефоне');
});

it('opening notice dismisses without submission, stays closed on sync and returns only on reopening', async () => {
  state.readiness.ready = false;
  state.readiness.problems = [{ pointId: 'p1', pointName: 'Точка', orderIndex: 1, reason: 'Нужно фото' }];
  await mount();
  const notice = screen.root.findByType('ActionSheet' as any);
  expect(notice.props.actions.map((a: any) => a.label)).toEqual(['Понятно']);
  await act(async () => notice.props.actions[0].onPress());
  expect(screen.root.findAllByType('ActionSheet' as any)).toHaveLength(0);
  await act(async () => state.sync?.());
  expect(screen.root.findAllByType('ActionSheet' as any)).toHaveLength(0);
  expect(state.queue).not.toHaveBeenCalled();
  expect(state.push).not.toHaveBeenCalled();
  state.focused = false;
  await act(async () => screen.update(React.createElement(SubmitReportScreen)));
  state.focused = true;
  await act(async () => screen.update(React.createElement(SubmitReportScreen)));
  expect(screen.root.findByType('ActionSheet' as any).props.title).toBe('Нужно заполнить результаты');
});
it('history does not interrupt viewing incomplete material with an opening notice', async () => {
  state.params.mode = 'history'; state.readiness.ready = false;
  await mount();
  expect(screen.root.findAllByType('ActionSheet' as any)).toHaveLength(0);
});
it('ready results and delivery errors do not open the incomplete-results notice', async () => {
  await mount();
  expect(screen.root.findAllByType('ActionSheet' as any)).toHaveLength(0);
  state.params = { assignmentId: 'assignment-b', mode: undefined };
  state.completed = true; state.delivery = { status: 'waitingAuth', lastError: null };
  state.readiness.ready = false;
  await act(async () => screen.update(React.createElement(SubmitReportScreen)));
  expect(screen.root.findAllByType('ActionSheet' as any)).toHaveLength(0);
  expect(button('Войти и продолжить отправку')).toBeDefined();
});

it('the send dialog follows persisted receipts in real time and closing it never resubmits', async () => {
  const attempt = deferred<void>();
  state.queue.mockImplementation(async () => {
    state.completed = true;
    state.delivery = { status: 'sending', clientOperationId: 'completion-a' };
    return { clientOperationId: 'completion-a', deliveryAttempt: attempt.promise };
  });
  await mount();
  await act(async () => { button('Отправить отчёт').props.onPress(); });
  expect(screen.root.findByType('ReportSendDialog' as any).props.delivery.status).toBe('sending');
  state.delivery = { status: 'delivered', clientOperationId: 'completion-a' };
  await act(async () => state.sync?.());
  expect(screen.root.findByType('ReportSendDialog' as any).props.delivery.status).toBe('delivered');
  expect(state.replace).not.toHaveBeenCalled();
  await act(async () => screen.root.findByType('ReportSendDialog' as any).props.onClose());
  await act(async () => state.sync?.());
  expect(screen.root.findAllByType('ReportSendDialog' as any)).toHaveLength(0);
  expect(button('К выбору заявок').props.disabled).toBe(false);
  await act(async () => button('К выбору заявок').props.onPress());
  expect(state.replace).toHaveBeenCalledWith('/patrol/request-board');
  await act(async () => attempt.resolve());
  expect(state.queue).toHaveBeenCalledOnce();
});

it('offline retry updates the dialog without claiming success or requiring screen reload', async () => {
  state.completed = true; state.delivery = { status: 'queued', clientOperationId: 'completion-a' };
  state.retry.mockImplementation(async () => {
    state.delivery = { status: 'waitingNetwork', clientOperationId: 'completion-a', lastError: null };
    return { skipped: 'offline' };
  });
  await mount();
  await act(async () => button('Проверить отправку').props.onPress());
  expect(screen.root.findByType('ReportSendDialog' as any).props.delivery.status).toBe('waitingNetwork');
  expect(state.queue).not.toHaveBeenCalled();
  expect(state.replace).not.toHaveBeenCalled();
});

const previewPoint = (pointId: string, orderIndex: number, extra: Record<string, unknown> = {}) => ({
  pointId, name: `Точка ${orderIndex}`, orderIndex, status: 'ok', comment: null, requiresPhoto: false, confirmationType: 'nfc',
  photoCount: 0, videoCount: 0, missingAttachmentCount: 0, required: true, routeId: 'route', photoClientFileIds: [], ...extra
});
const previewRows = () => screen.root.findAllByType('Pressable' as any).filter(n => n.props.accessibilityHint?.startsWith('Открыть точку'));

it('previews every point before sending: result, comment start, photos and how it was confirmed', async () => {
  state.preview = [
    previewPoint('p2', 2, { status: 'issue', comment: 'Течь у фланца', confirmationType: 'qr', photoCount: 3 }),
    previewPoint('p1', 1, { confirmationType: 'manual', photoCount: 1 })
  ];
  await mount();
  expect(text()).toContain('Состав отчёта');
  expect(previewRows().map(n => n.props.accessibilityLabel)).toEqual([
    '1. Точка 1. Исправно. Вручную · Фото: 1',
    '2. Точка 2. Неисправно. QR · Фото: 3. Течь у фланца'
  ]);
  expect(button('Отправить отчёт').props.disabled).toBe(false);
  await act(async () => previewRows()[1].props.onPress());
  expect(state.push).toHaveBeenCalledWith('/patrol/assignment/assignment-a/point/p2');
  expect(state.queue).not.toHaveBeenCalled();
});

it('highlights a point with missing required data and jumps straight to its form', async () => {
  state.readiness = { ...state.readiness, ready: false, assignment: { routeName: 'Маршрут', status: 'inProgress' },
    problems: [{ pointId: 'p2', pointName: 'Точка 2', orderIndex: 2, reason: 'Обязательная метка не заполнена.' }] };
  state.preview = [previewPoint('p1', 1), previewPoint('p2', 2, { status: 'pending', confirmationType: null })];
  await mount();
  await act(async () => screen.root.findByType('ActionSheet' as any).props.onClose());
  const [ready, missing] = previewRows();
  expect(ready.props.accessibilityHint).toBe('Открыть точку');
  expect(missing.props.accessibilityHint).toBe('Открыть точку и заполнить недостающие данные');
  expect(missing.props.accessibilityLabel).toContain('Обязательная метка не заполнена.');
  expect(text()).toContain('Требуют внимания: 1');
  await act(async () => missing.props.onPress());
  expect(state.push).toHaveBeenCalledWith('/patrol/assignment/assignment-a/point/p2/fill');
});

it('a preview that cannot be read keeps the readiness list and sending available', async () => {
  state.preview = new Error('SQLite busy');
  state.readiness = { ...state.readiness, ready: false, problems: [{ pointId: 'p1', pointName: 'Точка 1', orderIndex: 1, reason: 'Нужен комментарий' }] };
  await mount();
  expect(text()).not.toContain('Состав отчёта');
  expect(text()).toContain('Требуют внимания');
  expect(state.log).toHaveBeenCalledWith('report.preview.load.failed', expect.any(Error));
});
