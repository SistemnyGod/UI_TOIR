import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  db: null as unknown as DatabaseSync, owner: 'owner', generation: 1, focused: true,
  point: {} as any, files: [] as any[], writeBarrier: null as null | (() => Promise<void>), failWrite: false,
  preventRemove: null as null | ((event: any) => void), appState: null as null | ((value: string) => void),
  dispatch: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn(),
  saveDraft: vi.fn(), saveOk: vi.fn(), saveIssue: vi.fn(), skip: vi.fn(), camera: vi.fn(), gallery: vi.fn(), readiness: vi.fn(), load: vi.fn(), getPoint: vi.fn(), fileReads: 0,
}));
vi.mock('expo-router', async () => {
  const R = await import('react');
  const router = { push: state.push, replace: state.replace, back: state.back };
  return { useRouter: () => router, useLocalSearchParams: () => ({ assignmentId: 'assignment', pointId: 'point' }),
    useFocusEffect: (effect: () => void) => R.useEffect(() => state.focused ? effect() : undefined, [effect, state.focused]) };
});
vi.mock('expo-router/react-navigation', () => {
  const navigation = { dispatch: state.dispatch };
  return { useNavigation: () => navigation, usePreventRemove: (_enabled: boolean, callback: (event: any) => void) => { state.preventRemove = callback; } };
});
vi.mock('react-native', () => ({
  View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', Image: 'Image',
  ActivityIndicator: 'ActivityIndicator', KeyboardAvoidingView: 'KeyboardAvoidingView',
  Platform: { OS: 'android' }, StyleSheet: { create: (styles: unknown) => styles },
  useWindowDimensions: () => ({ width: 360, height: 800, fontScale: 1, scale: 3 }),
  AppState: { addEventListener: (_name: string, callback: (value: string) => void) => { state.appState = callback; return { remove() { state.appState = null; } }; } },
}));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('@/features/settings/themePreference', () => ({ useAppTheme: () => ({ colors: {} }) }));
vi.mock('@/ui/Screen', async () => {
  const R = await import('react');
  return { Screen: (props: any) => R.createElement('Screen', props, props.children, props.bottomAction) };
});
vi.mock('@/ui/TextField', () => ({ TextField: 'TextInput' }));
vi.mock('@/ui/PrimaryButton', () => ({ PrimaryButton: 'PrimaryButton' }));
vi.mock('@/ui/Card', () => ({ Card: 'Card' }));
vi.mock('@/ui/StatusPill', () => ({ StatusPill: 'StatusPill' }));
vi.mock('@/ui/StatusMessage', () => ({ StatusMessage: 'StatusMessage' }));
vi.mock('@/ui/SelectField', () => ({ SelectField: 'SelectField' }));
vi.mock('@/ui/ActionSheet', () => ({ ActionSheet: 'ActionSheet' }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => state.owner }));
vi.mock('@/auth/sessionGeneration', () => ({ getSessionGeneration: () => state.generation }));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('expo-sqlite', () => ({}));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'result-id' }));
vi.mock('@/services/nfcService', () => ({ getNfcCodeCandidates: vi.fn(), normalizeNfcCode: vi.fn() }));
vi.mock('@/services/fileStorageService', () => ({ getLocalFileInfo: vi.fn() }));
vi.mock('@/db/repositories/mobileActionLogRepository', () => ({ logMobileAction: vi.fn() }));
vi.mock('@/sync/mutationSyncRequest', () => ({ requestSyncAfterMutation: vi.fn() }));
vi.mock('@/db/database', () => {
  const db = {
    getFirstAsync: async (sql: string, args: any[] = []) => state.db.prepare(sql).get(...args),
    getAllAsync: async (sql: string, args: any[] = []) => state.db.prepare(sql).all(...args),
    runAsync: async (sql: string, args: any[] = []) => state.db.prepare(sql).run(...args),
  };
  return { getDatabase: async () => db, withProtectedExclusiveTransactionAsync: async (_db: unknown, write: (tx: typeof db) => Promise<void>) => {
    state.db.exec('BEGIN');
    try { await write(db); state.db.exec('COMMIT'); }
    catch (error) { state.db.exec('ROLLBACK'); throw error; }
  } };
});
vi.mock('@/services/mobileErrorReporter', () => ({ logMobileError: vi.fn() }));
vi.mock('@/services/mediaAttachmentService', () => ({ attachPointPhotoFromCamera: state.camera,
  attachPointVideoFromCamera: vi.fn(), attachPointMediaFromGallery: state.gallery }));
vi.mock('@/db/repositories/filesRepository', () => ({ listPointFiles: async () => { state.fileReads++; return state.files; } }));
// The mounted screen and draft controller are real. Repository boundaries are
// controlled here; SQLite records draft writes and lets tests delay/fail storage.
vi.mock('@/db/repositories/patrolRepository', () => ({
  assertPointCanBeOpened: state.load, getPointForFill: state.getPoint,
  getReportReadiness: state.readiness,
  getAssignmentScanPolicy: async () => ({ nfcEnabled: true, qrFallbackEnabled: true }),
  savePointDraft: state.saveDraft, savePointOk: state.saveOk, savePointIssue: state.saveIssue, skipPoint: state.skip,
  beginManualPointInspection: vi.fn(), deferPoint: vi.fn(),
}));

import { PointFillScreen } from '@/features/patrol/PointFillScreen';
import { normalizePointDraft, restoreDeferredPointSelection } from '@/domain/patrol/pointDraftPolicy';
import { navigateAfterFormSave } from '@/services/formNavigationGuard';

let screen: ReactTestRenderer | undefined;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers(); vi.resetAllMocks();
  state.owner = 'owner'; state.generation = 1; state.focused = true; state.writeBarrier = null; state.failWrite = false;
  state.point = { pointId: 'point', name: 'Печь 930 Э', orderIndex: 1, status: 'pending',
    confirmationType: 'nfc', scannedAtLocal: '2026-09-28T12:00:00Z', comment: '', issueTypeId: null,
    requiresPhoto: false, description: 'Осмотреть оборудование', instruction: 'Проверить крепления', photoClientFileIds: [] };
  state.files = [];
  state.load.mockImplementation(async () => state.point); state.getPoint.mockImplementation(async () => state.point);
  state.db = new DatabaseSync(':memory:');
  state.db.exec('CREATE TABLE draft (owner TEXT PRIMARY KEY, payload TEXT NOT NULL)');
  state.saveDraft.mockImplementation(async (_assignment, _point, value, scope) => {
    await state.writeBarrier?.();
    if (state.failWrite) throw new Error('SQLite unavailable');
    state.db.prepare('INSERT OR REPLACE INTO draft(owner,payload) VALUES (?,?)').run(scope.ownerUserId, JSON.stringify(value));
  });
  state.saveOk.mockResolvedValue(undefined); state.saveIssue.mockResolvedValue(undefined); state.skip.mockResolvedValue(undefined);
  state.readiness.mockResolvedValue({ ready: false });
  state.camera.mockResolvedValue('cancelled');
});
afterEach(async () => {
  state.writeBarrier = null; state.failWrite = false;
  if (screen) await act(async () => { screen!.unmount(); });
  screen = undefined; state.db.close(); vi.useRealTimers();
});
async function mount() { await act(async () => { screen = create(React.createElement(PointFillScreen)); }); }
const button = (label: string) => screen!.root.findAllByType('PrimaryButton' as any).find(node => node.props.label === label)!;
const choice = (label: string) => screen!.root.findAllByType('Pressable' as any).find(node => node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === label)!;
async function choose(label: string) {
  const back = screen!.root.findAllByType('Pressable' as any).find(n => n.props.accessibilityLabel === 'Изменить статус');
  if (back) await act(() => back.props.onPress());
  await act(() => choice(label).props.onPress());
}
async function mediaAction(label: string) {
  await act(() => button('Добавить фото или видео').props.onPress());
  const sheet = screen!.root.findByType('ActionSheet' as any);
  expect(sheet.props.actions.map((a: any) => a.label)).toEqual(['Сделать фото', 'Снять видео', 'Выбрать фото и видео с телефона']);
  await act(() => { sheet.props.onClose(); sheet.props.actions.find((a: any) => a.label === label).onPress(); });
}
const comment = () => screen!.root.findAllByType('TextInput' as any).find(node => node.props.multiline)!;
const alerts = () => screen!.root.findAllByType('Text' as any).filter(node => node.props.accessibilityRole === 'alert').map(node => node.props.children);
const draft = () => JSON.parse(state.db.prepare('SELECT payload FROM draft WHERE owner=?').get('owner')!.payload as string);
function delayWrite() {
  let release!: () => void;
  state.writeBarrier = () => new Promise<void>(resolve => { release = () => { state.writeBarrier = null; resolve(); }; });
  return () => release();
}
function remove(type: string) { state.preventRemove!({ data: { action: { type } } }); }

it('shows two status choices first and opens the form only after selection', async () => {
  await mount();
  expect(screen!.root.findAllByType('Pressable' as any).filter(node => node.props.accessibilityRole === 'radio').map(node => node.props.accessibilityLabel)).toEqual(['Исправно', 'Неисправно']);
  expect(comment()).toBeUndefined(); expect(button('Сохранить и продолжить')).toBeUndefined();
  await choose('Исправно');
  expect(comment().props.editable).toBe(true); expect(button('Добавить фото или видео')).toBeDefined();
  expect(state.saveOk).not.toHaveBeenCalled();
});

it('a legacy draft without status waits for explicit choice and retains its text', async () => {
  const persisted = normalizePointDraft({ selectedStatus: null, comment: 'legacy text', issueTypeId: 'Неисправность', photoClientFileIds: [] });
  state.point = { ...state.point, status: 'deferred', ...persisted };
  await mount();
  expect(comment()).toBeUndefined();
  expect(choice('Исправно').props.accessibilityState.checked).toBe(false);
  await choose('Неисправно');
  expect(comment().props.value).toBe('legacy text');
  expect(state.saveIssue).not.toHaveBeenCalled();
});

it('legacy deferred drafts still restore explicit result selection', () => {
  expect(restoreDeferredPointSelection({ deferredReason: 'Заполнить позже', issueTypeId: null })).toBe('ok');
  expect(restoreDeferredPointSelection({ deferredReason: 'Заполнить позже', issueTypeId: 'Неисправность' })).toBe('issue');
  expect(restoreDeferredPointSelection({ deferredReason: 'Метка недоступна', issueTypeId: null })).toBe('skipped');
});

it('changing result preserves comments and attachments, and creates a result only on explicit save', async () => {
  state.files = [{ clientFileId: 'photo', localPath: 'file:///photo.jpg', status: 'pending', mediaKind: 'photo' }];
  await mount();
  await choose('Неисправно');
  await act(async () => { comment().props.onChangeText('Последние символы'); });
  await choose('Исправно');
  
  await choose('Неисправно');
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  expect(comment().props.value).toBe('Последние символы');
  expect(screen!.root.findAllByType('Image' as any).map(node => node.props.source.uri)).toContain('file:///photo.jpg');
  expect(draft()).toMatchObject({ selectedStatus: 'issue', comment: 'Последние символы', photoClientFileIds: ['photo'] });
  expect(state.saveOk).not.toHaveBeenCalled(); expect(state.saveIssue).not.toHaveBeenCalled(); expect(state.skip).not.toHaveBeenCalled();
  await act(async () => { const save = button('Сохранить и продолжить'); save.props.onPress(); save.props.onPress(); });
  expect(state.saveIssue).toHaveBeenCalledTimes(1);
  expect(state.saveIssue).toHaveBeenCalledWith('assignment', 'point', 'Последние символы', 'Неисправность');
  expect(state.replace).toHaveBeenCalledWith('/patrol/assignment/assignment/scan-nfc');
});

it('validation requires a comment but accepts an old required-photo point without attachments', async () => {
  state.point.requiresPhoto = true;
  await mount();
  await choose('Неисправно');
  await act(async () => { await button('Сохранить и продолжить').props.onPress(); });
  expect(state.saveIssue).not.toHaveBeenCalled();
  expect(alerts()).toContain('Опишите неисправность.');
  await act(async () => { comment().props.onChangeText('Требует ремонта'); });
  await act(async () => { await button('Сохранить и продолжить').props.onPress(); });
  expect(state.saveIssue).toHaveBeenCalledOnce();
  expect(state.saveIssue).toHaveBeenCalledWith('assignment', 'point', 'Требует ремонта', 'Неисправность');
  expect(alerts()).not.toContain('Добавьте обязательную фотографию.');
});

it('Back drains characters entered during SQLite saving and retains the first destination', async () => {
  await mount();
  await choose('Исправно');
  await act(async () => { comment().props.onChangeText('first'); });
  const release = delayWrite();
  await act(async () => { remove('BACK'); remove('OTHER'); });
  expect(state.dispatch).not.toHaveBeenCalled();
  expect(comment().props.editable).toBe(true);
  await act(async () => { comment().props.onChangeText('last revision before Back'); release(); });
  expect(draft().comment).toBe('last revision before Back');
  expect(state.dispatch).toHaveBeenCalledExactlyOnceWith({ type: 'BACK' });
});

it('failed leave preserves text and direction; retry saves newer text without a second destination', async () => {
  await mount();
  await choose('Исправно');
  await act(async () => { comment().props.onChangeText('first'); });
  state.failWrite = true;
  await act(async () => { remove('BACK'); });
  expect(state.dispatch).not.toHaveBeenCalled(); expect(button('Повторить сохранение')).toBeDefined();
  await act(async () => { comment().props.onChangeText('edited after error'); });
  state.failWrite = false;
  await act(async () => { button('Повторить сохранение').props.onPress(); });
  expect(draft().comment).toBe('edited after error');
  expect(state.dispatch).toHaveBeenCalledExactlyOnceWith({ type: 'BACK' });
});

it('a tab transition is held until SQLite saves the last revision and retains its first destination', async () => {
  await mount();
  await choose('Исправно');
  await act(async () => { comment().props.onChangeText('before tab'); });
  const first = vi.fn(); const second = vi.fn(); const release = delayWrite();
  await act(async () => { navigateAfterFormSave(first); navigateAfterFormSave(second); });
  expect(first).not.toHaveBeenCalled(); expect(second).not.toHaveBeenCalled();
  await act(async () => { comment().props.onChangeText('latest before tab'); release(); });
  expect(draft().comment).toBe('latest before tab');
  expect(first).toHaveBeenCalledTimes(1); expect(second).not.toHaveBeenCalled();
});

it('camera waits for the latest draft and returns to the same editable result with its photo', async () => {
  await mount();
  await choose('Исправно');
  await act(async () => { comment().props.onChangeText('before camera'); });
  state.camera.mockImplementation(async () => {
    expect(draft().comment).toBe('latest while saving');
    state.files = [{ clientFileId: 'new-photo', localPath: 'file:///new-photo.jpg', status: 'pending', mediaKind: 'photo' }];
    return 'attached';
  });
  const release = delayWrite();
  await mediaAction('Сделать фото');
  expect(state.camera).not.toHaveBeenCalled();
  await act(async () => { comment().props.onChangeText('latest while saving'); release(); });
  expect(state.camera).toHaveBeenCalledTimes(1);
  expect(comment().props.value).toBe('latest while saving');
  expect(screen!.root.findAllByType('Text' as any).some(n => JSON.stringify(n.props.children).includes('Исправно'))).toBe(true);
  expect(screen!.root.findAllByType('Image' as any).map(node => node.props.source.uri)).toContain('file:///new-photo.jpg');
  await act(async () => { comment().props.onChangeText('after camera'); await vi.advanceTimersByTimeAsync(500); });
  expect(draft().comment).toBe('after camera');
  expect(state.saveOk).not.toHaveBeenCalled();
});

it('a saved point retries failed navigation without a second result command or revived timer', async () => {
  state.readiness.mockRejectedValueOnce(new Error('temporary read failure')).mockResolvedValue({ ready: true });
  await mount();
  await choose('Исправно');
  await act(async () => { comment().props.onChangeText('saved'); });
  await act(async () => { await button('Сохранить и продолжить').props.onPress(); });
  expect(state.saveOk).toHaveBeenCalledTimes(1);
  expect(button('Повторить переход')).toBeDefined();
  await act(async () => { button('Повторить переход').props.onPress(); button('Повторить переход').props.onPress(); });
  await act(async () => { await vi.runAllTimersAsync(); });
  expect(state.saveOk).toHaveBeenCalledTimes(1);
  expect(state.replace).toHaveBeenCalledExactlyOnceWith('/patrol/assignment/assignment/submit');
  expect(state.saveDraft).not.toHaveBeenCalled();
});

it('an old form cannot write its draft or navigate after the account changes', async () => {
  await mount();
  await choose('Исправно');
  await act(async () => { comment().props.onChangeText('private'); });
  state.owner = 'next-owner'; state.generation++;
  await act(async () => { remove('BACK'); });
  expect(state.saveDraft).not.toHaveBeenCalled(); expect(state.dispatch).not.toHaveBeenCalled();
  // A superseded session must not publish a retry/error into the next account's UI.
  expect(state.db.prepare('SELECT * FROM draft').all()).toHaveLength(0);
});

it('a failed initial load does not trap tab navigation before a draft controller exists', async () => {
  state.load.mockRejectedValue(new Error('SQLite unavailable'));
  await mount();
  const leave = vi.fn();
  await act(async () => { navigateAfterFormSave(leave); });
  expect(leave).toHaveBeenCalledTimes(1);
});

it('late readiness after the form loses focus cannot navigate back to the previous patrol', async () => {
  let ready!: (value: { ready: boolean }) => void;
  state.readiness.mockImplementation(() => new Promise(resolve => { ready = resolve; }));
  await mount();
  await choose('Исправно');
  await act(async () => { button('Сохранить и продолжить').props.onPress(); });
  expect(state.saveOk).toHaveBeenCalledTimes(1);
  await act(async () => { state.focused = false; screen!.update(React.createElement(PointFillScreen)); });
  await act(async () => { ready({ ready: true }); });
  expect(state.replace).not.toHaveBeenCalled();
});

it('late camera completion does not refresh the previous point after focus has moved elsewhere', async () => {
  let finish!: (value: string) => void;
  state.camera.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await mount();
  await choose('Исправно');
  await act(async () => { comment().props.onChangeText('before photo'); });
  await mediaAction('Сделать фото');
  await act(async () => { state.focused = false; screen!.update(React.createElement(PointFillScreen)); });
  await act(async () => { finish('attached'); });
  expect(state.getPoint).not.toHaveBeenCalled();
  expect(state.replace).not.toHaveBeenCalled();
});

it('an old result write cannot navigate a newly focused form after the session changed', async () => {
  let finish!: () => void;
  state.saveOk.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  await mount();
  await choose('Исправно');
  await act(async () => { button('Сохранить и продолжить').props.onPress(); });
  await act(async () => { state.focused = false; screen!.update(React.createElement(PointFillScreen)); });
  state.generation++;
  await act(async () => { state.focused = true; screen!.update(React.createElement(PointFillScreen)); });
  await act(async () => { finish(); });
  expect(state.replace).not.toHaveBeenCalled();
  await choose('Неисправно');
  expect(screen!.root.findAllByType('Text' as any).some(n => JSON.stringify(n.props.children).includes('Неисправно'))).toBe(true);
});

it('a pending leave from the old form cannot dispatch after blur and a fresh form session', async () => {
  await mount();
  await choose('Исправно');
  await act(async () => { comment().props.onChangeText('old'); });
  const release = delayWrite();
  await act(async () => { remove('OLD_BACK'); });
  await act(async () => { state.focused = false; screen!.update(React.createElement(PointFillScreen)); });
  await act(async () => { state.focused = true; screen!.update(React.createElement(PointFillScreen)); });
  await act(async () => { release(); });
  expect(state.dispatch).not.toHaveBeenCalled();
});

it('the actual repository persists an unselected NFC draft in SQLite without a result command', async () => {
  const repository = await vi.importActual<typeof import('@/db/repositories/patrolRepository')>('@/db/repositories/patrolRepository');
  state.db.exec(`
    CREATE TABLE patrol_assignments (
      assignment_id TEXT PRIMARY KEY, owner_user_id TEXT, contour_id TEXT, employee_id TEXT, request_id TEXT,
      route_id TEXT, status TEXT, started_at_local TEXT, completed_at_local TEXT, revision INTEGER,
      route_version_no INTEGER, snapshot_version INTEGER, snapshot_created_at TEXT, snapshot_source TEXT,
      snapshot_allow_free_order INTEGER, snapshot_nfc_enabled INTEGER, snapshot_qr_fallback_enabled INTEGER
    );
    CREATE TABLE routes (route_id TEXT PRIMARY KEY, name TEXT, allow_free_order INTEGER, nfc_enabled INTEGER, qr_fallback_enabled INTEGER);
    CREATE TABLE patrol_request_board (request_id TEXT PRIMARY KEY, assigned_full_name TEXT, route_name TEXT);
    CREATE TABLE assignment_route_points (
      assignment_id TEXT, point_id TEXT, route_id TEXT, name TEXT, description TEXT, instruction TEXT,
      order_index INTEGER, required INTEGER, requires_photo INTEGER, nfc_uid_hash TEXT, qr_code_hash TEXT
    );
    CREATE TABLE point_results (
      local_result_id TEXT PRIMARY KEY, owner_user_id TEXT, contour_id TEXT, assignment_id TEXT, point_id TEXT,
      status TEXT, comment TEXT, issue_type_id TEXT, severity TEXT, deferred_reason TEXT, completed_at_local TEXT,
      sync_status TEXT, confirmation_type TEXT, nfc_uid_hash TEXT, scanned_at_local TEXT,
      photo_client_file_ids_json TEXT, manual_reason TEXT
    );
    CREATE TABLE outbox_commands (client_operation_id TEXT);
    INSERT INTO patrol_assignments VALUES ('assignment','owner','test','employee','request','route','inProgress',NULL,NULL,1,1,1,NULL,'server',1,1,1);
    INSERT INTO routes VALUES ('route','Обход печей',1,1,1);
    INSERT INTO patrol_request_board VALUES ('request','Сотрудник','Обход печей');
    INSERT INTO assignment_route_points VALUES ('assignment','point','route','930 Э',NULL,NULL,1,1,0,'nfc',NULL);
    INSERT INTO point_results VALUES ('result-id','owner','test','assignment','point','scanned',NULL,NULL,NULL,NULL,NULL,'localOnly','nfc','nfc','2026-09-28T12:00:00Z','[]',NULL);
  `);
  await repository.savePointDraft('assignment', 'point', {
    selectedStatus: null, comment: 'Черновик до выбора результата', issueTypeId: 'Неисправность', photoClientFileIds: [],
  }, { ownerUserId: 'owner', contourId: 'test', generation: 1 });
  const restored = await repository.getPointForFill('assignment', 'point', 'owner', 'test');
  expect(restored).toMatchObject({ status: 'deferred', comment: 'Черновик до выбора результата', completedAtLocal: null, confirmationType: 'nfc' });
  expect(restoreDeferredPointSelection(restored!)).toBeNull();
  expect(state.db.prepare('SELECT * FROM outbox_commands').all()).toHaveLength(0);
  expect(state.db.prepare('SELECT sync_status FROM point_results').get()!.sync_status).toBe('localOnly');
});

it('gallery batch shows progress, blocks duplicate picks and then displays attached files', async () => {
  let finish!: (result: any) => void;
  state.gallery.mockImplementation(async (_assignment: string, _point: string, progress: any) => {
    progress({ progress: 0.45, processedBytes: 9, totalBytes: 10, fileIndex: 1, fileCount: 2 });
    return new Promise(resolve => { finish = resolve; });
  });
  await mount(); await choose('Исправно');
  await mediaAction('Выбрать фото и видео с телефона');
  expect(button('Добавить фото или видео').props.disabled).toBe(true);
  expect(screen!.root.findByProps({ accessibilityRole: 'progressbar' }).props.accessibilityValue.now).toBe(45);
  state.files = [{ clientFileId: 'photo', localPath: 'file:///one.jpg', status: 'pending', mediaKind: 'photo' }, { clientFileId: 'video', localPath: 'file:///two.mp4', status: 'uploaded', mediaKind: 'video' }];
  await act(async () => finish({ status: 'attached', attachedCount: 2, photoCount: 1, videoCount: 1, errors: [] }));
  expect(button('Добавить фото или видео').props.disabled).toBe(false);
  const text = screen!.root.findAllByType('Text' as any).map(n => n.props.children);
  expect(text).not.toContain('Прикреплено · на телефоне'); expect(text).not.toContain('Прикреплено · на сервере');
  expect(screen!.root.findAllByType('Image' as any)).toHaveLength(1);
  expect(state.saveOk).not.toHaveBeenCalled();
});

it('coalesces a burst of delivery events into one local attachment read', async () => {
  const { emitSyncEvent } = await import('@/sync/syncEvents');
  await mount();
  state.fileReads = 0;
  await act(async () => {
    for (let i = 0; i < 20; i++) emitSyncEvent({ acceptedOperationIds: [], completedAssignmentIds: [], deliveryChangedAssignmentIds: ['assignment'] });
  });
  expect(state.fileReads).toBe(1);
});

it('background delivery updates preserve the mounted form, chosen result and unsaved comment', async () => {
  const { emitSyncEvent } = await import('@/sync/syncEvents');
  await mount(); await choose('Неисправно');
  await act(async () => comment().props.onChangeText('Пишу комментарий во время отправки'));
  const originalInput = comment();
  const pointLoads = state.getPoint.mock.calls.length;
  state.files = [{ clientFileId: 'photo', localPath: 'file:///photo.jpg', status: 'uploaded', mediaKind: 'photo' }];
  await act(async () => emitSyncEvent({ acceptedOperationIds: ['report'], completedAssignmentIds: [], deliveryChangedAssignmentIds: ['assignment'] }));
  expect(comment()).toBe(originalInput);
  expect(comment().props.value).toBe('Пишу комментарий во время отправки');
  expect(screen!.root.findAllByType('Text' as any).some(node => node.children.includes('Неисправно'))).toBe(true);
  expect(state.getPoint).toHaveBeenCalledTimes(pointLoads);
  expect(screen!.root.findAllByType('Image' as any).map(node => node.props.source.uri)).toContain('file:///photo.jpg');
});

it('attachment failure releases the picker and save lock', async () => {
  state.gallery.mockRejectedValueOnce(Error('Storage full'));
  await mount(); await choose('Исправно');
  await mediaAction('Выбрать фото и видео с телефона');
  expect(button('Добавить фото или видео').props.disabled).toBe(false);
  expect(screen!.root.findAllByProps({ accessibilityRole: 'progressbar' })).toHaveLength(0);
  expect(state.saveOk).not.toHaveBeenCalled();
});

it('unmount discards a queued delivery read and removes the listener', async () => {
  const { emitSyncEvent } = await import('@/sync/syncEvents');
  await mount();
  await act(async () => { screen!.unmount(); });
  screen = undefined; state.fileReads = 0;
  await act(async () => emitSyncEvent({ acceptedOperationIds: [], completedAssignmentIds: [], deliveryChangedAssignmentIds: ['assignment'] }));
  expect(state.fileReads).toBe(0);
});

it('the actual attachment repository rejects another owner before touching SQLite', async () => {
  const repository = await vi.importActual<typeof import('@/db/repositories/patrolRepository')>('@/db/repositories/patrolRepository');
  await expect(repository.attachPhotoToPoint('assignment', 'point', { ownerUserId: 'other', clientFileId: 'file' } as any,
    { ownerUserId: 'owner', contourId: 'test', generation: 1 })).rejects.toThrow('другому аккаунту');
});
