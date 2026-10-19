import { createRequire } from 'node:module';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ values: new Map<string, string>(), read: vi.fn(), write: vi.fn(), remove: vi.fn(), signIn: vi.fn(), replace: vi.fn(), unlock: vi.fn(), biometric: vi.fn(), offline: null as any, owner: 'a', refresh: 'refresh', restore: vi.fn() }));
vi.mock('expo-secure-store', () => ({ getItemAsync: state.read, setItemAsync: state.write, deleteItemAsync: state.remove, WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only' }));
vi.mock('expo-router', async () => { const R = await import('react'); return { useRouter: () => ({ replace: state.replace, push: vi.fn() }), useFocusEffect: (cb: any) => R.useEffect(cb, [cb]) }; });
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator', ImageBackground: 'ImageBackground', KeyboardAvoidingView: 'KeyboardAvoidingView', SafeAreaView: 'SafeAreaView', ScrollView: 'ScrollView', Platform: { OS: 'android' }, StyleSheet: { create: (s: any) => s }, Alert: { alert: vi.fn() } }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('expo-status-bar', () => ({ StatusBar: 'StatusBar' }));
vi.mock('expo-local-authentication', () => ({ hasHardwareAsync: async () => true, isEnrolledAsync: async () => true, authenticateAsync: state.biometric }));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/core/serverSettings', () => ({ getServerBaseUrl: async () => 'https://server' }));
vi.mock('@/auth/authService', () => ({ signIn: state.signIn, restoreSessionWithRefreshToken: state.restore }));
vi.mock('@/auth/offlineSession', () => ({ isOfflineSessionValid: (session: any) => Boolean(session) }));
vi.mock('@/auth/tokenStorage', () => ({ getOfflineSession: async () => state.offline, getStoredOwnerUserId: async () => state.owner, getRefreshToken: async () => state.refresh }));
vi.mock('@/auth/sessionGateState', () => ({ markSessionUnlocked: state.unlock, consumePendingSessionRoute: () => null }));
vi.mock('@/services/patrolNavigationService', () => ({ resolvePatrolStartPath: async () => '/patrol/request-board' }));
vi.mock('@/sync/syncTriggers', () => ({ triggerForegroundSyncWithRetry: vi.fn() }));
import { forgetRememberedCredentials, prepareRememberedCredentialsSave, readRememberedCredentials } from '@/auth/rememberedCredentials';
import { Alert } from 'react-native';
let LoginScreen: typeof import('@/features/auth/LoginScreen').LoginScreen;
const nativeRequire = createRequire(import.meta.url);
let previousPngLoader: typeof nativeRequire.extensions[string];
beforeAll(async () => {
  previousPngLoader = nativeRequire.extensions['.png'];
  nativeRequire.extensions['.png'] = module => { module.exports = 1; };
  ({ LoginScreen } = await import('@/features/auth/LoginScreen'));
});
afterAll(() => { if (previousPngLoader) nativeRequire.extensions['.png'] = previousPngLoader; else delete nativeRequire.extensions['.png']; });
let screen: ReactTestRenderer | undefined;
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
const field = (label: string) => screen!.root.findByProps({ accessibilityLabel: label });
const checkbox = () => field('Запомнить логин и пароль');
const submit = () => screen!.root.findAllByType('Pressable' as any).find(node => node.findAllByType('Text' as any).some(text => text.children.includes('Войти на сервер')))!;
const mount = async () => { await act(async () => { screen = create(React.createElement(LoginScreen)); }); };
const unmount = async () => { if (screen) await act(() => screen!.unmount()); screen = undefined; };
const fill = async (login = ' operator ', password = '  sample пароль  ') => { await act(async () => { field('Логин').props.onChangeText(login); field('Пароль').props.onChangeText(password); }); };
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; vi.clearAllMocks(); state.values.clear(); state.offline = null; state.refresh = 'refresh';
  state.read.mockReset().mockImplementation(async key => state.values.get(key) ?? null);
  state.write.mockReset().mockImplementation(async (key, value) => { state.values.set(key, value); });
  state.remove.mockReset().mockImplementation(async key => { state.values.delete(key); });
  state.signIn.mockReset().mockResolvedValue(undefined); state.restore.mockResolvedValue(undefined); state.biometric.mockReset().mockResolvedValue({ success: true });
});
afterEach(unmount);
it('a successful checked login restores both fields when the screen is reopened', async () => {
  await mount(); await fill(); await act(async () => submit().props.onPress());
  expect(state.signIn).toHaveBeenCalledExactlyOnceWith('operator', '  sample пароль  '); expect(state.replace).toHaveBeenCalledOnce();
  await unmount(); await mount();
  expect(field('Логин').props.value).toBe('operator'); expect(field('Пароль').props.value).toBe('  sample пароль  ');
  expect(field('Пароль').props.secureTextEntry).toBe(true); expect(checkbox().props.accessibilityState.checked).toBe(true);
});
it('unchecking forgets both fields even without another successful login', async () => {
  await prepareRememberedCredentialsSave()('operator', 'sample'); await mount();
  await act(async () => checkbox().props.onPress()); await unmount(); await mount();
  expect(field('Логин').props.value).toBe(''); expect(field('Пароль').props.value).toBe(''); expect(checkbox().props.accessibilityState.checked).toBe(false);
  await fill(); await act(async () => submit().props.onPress());
  expect(await readRememberedCredentials()).toEqual({ remember: false, login: '', password: '' });
});
it('failed authentication cannot overwrite the previous working credentials', async () => {
  await prepareRememberedCredentialsSave()('previous', 'previous-sample'); state.signIn.mockRejectedValue(new Error('Неверный пароль'));
  await mount(); await fill('new', 'wrong-sample'); await act(async () => submit().props.onPress());
  expect(state.replace).not.toHaveBeenCalled(); await unmount(); await mount();
  expect(field('Логин').props.value).toBe('previous'); expect(field('Пароль').props.value).toBe('previous-sample');
});
it('a late restore does not overwrite credentials already being typed', async () => {
  await prepareRememberedCredentialsSave()('previous', 'previous-sample');
  const raw = [...state.values.values()][0], slow = deferred<string>(); state.read.mockReturnValueOnce(slow.promise);
  await mount(); await fill('new operator', 'new-sample'); await act(async () => slow.resolve(raw));
  expect(field('Логин').props.value).toBe('new operator'); expect(field('Пароль').props.value).toBe('new-sample');
});
it('a late restore cannot re-enable an unchecked preference or repopulate forgotten fields', async () => {
  await prepareRememberedCredentialsSave()('previous', 'previous-sample');
  const raw = [...state.values.values()][0], slow = deferred<string>(); state.read.mockReturnValueOnce(slow.promise);
  await mount(); await act(async () => checkbox().props.onPress()); await act(async () => slow.resolve(raw));
  expect(checkbox().props.accessibilityState.checked).toBe(false); expect(field('Пароль').props.value).toBe('');
  expect(await readRememberedCredentials()).toMatchObject({ remember: false });
});
it('storage failure is reported separately and cannot turn a successful login into an authentication failure', async () => {
  await mount(); await fill(); state.write.mockRejectedValueOnce(new Error('native storage unavailable'));
  await act(async () => submit().props.onPress());
  expect(Alert.alert).toHaveBeenCalledExactlyOnceWith('Данные для входа не сохранены', expect.any(String));
  expect(state.unlock).toHaveBeenCalledOnce(); expect(state.replace).toHaveBeenCalledOnce();
});
it('read failure leaves the fields editable and manual login available', async () => {
  state.read.mockRejectedValueOnce(new Error('storage unavailable')); await mount(); await fill();
  expect(field('Логин').props.editable).toBe(true); await act(async () => submit().props.onPress()); expect(state.replace).toHaveBeenCalledOnce();
});
it('duplicate submit taps issue one login and save only after it succeeds', async () => {
  const slow = deferred<void>(); state.signIn.mockReturnValueOnce(slow.promise); await mount(); await fill();
  const button = submit(); await act(async () => { void button.props.onPress(); void button.props.onPress(); });
  expect(state.signIn).toHaveBeenCalledOnce(); expect(state.write).not.toHaveBeenCalled();
  await act(async () => slow.resolve()); expect(state.write).toHaveBeenCalledOnce();
});
it('biometric login preserves the saved pair and prevents duplicate authentication', async () => {
  await prepareRememberedCredentialsSave()('operator', 'sample'); state.offline = { userId: 'a', fullName: 'Оператор' };
  const slow = deferred<any>(); state.biometric.mockReturnValueOnce(slow.promise); await mount();
  const before = state.remove.mock.calls.length, button = field('Войти с биометрией');
  await act(async () => { void button.props.onPress(); void button.props.onPress(); }); expect(state.biometric).toHaveBeenCalledOnce();
  await act(async () => slow.resolve({ success: true })); expect(state.remove).toHaveBeenCalledTimes(before);
  await unmount(); await mount(); expect(field('Пароль').props.value).toBe('sample');
});
it('biometric refresh does not depend on the remember checkbox', async () => {
  await forgetRememberedCredentials(); await mount(); await act(async () => field('Войти с биометрией').props.onPress());
  expect(state.restore).toHaveBeenCalledOnce(); expect(state.replace).toHaveBeenCalledOnce();
});
it('cancelled biometric authentication allows another biometric attempt and manual login', async () => {
  state.biometric.mockResolvedValue({ success: false, error: 'user_cancel' }); await mount();
  await act(async () => field('Войти с биометрией').props.onPress());
  await act(async () => field('Войти с биометрией').props.onPress());
  expect(state.biometric).toHaveBeenCalledTimes(2); expect(state.replace).not.toHaveBeenCalled();
  await fill(); await act(async () => submit().props.onPress()); expect(state.signIn).toHaveBeenCalledOnce();
});
it('a native biometric failure allows retry', async () => {
  state.biometric.mockRejectedValueOnce(new Error('biometric unavailable')); await mount();
  await act(async () => field('Войти с биометрией').props.onPress());
  await act(async () => field('Войти с биометрией').props.onPress());
  expect(state.biometric).toHaveBeenCalledTimes(2); expect(state.replace).toHaveBeenCalledOnce();
});
it('a late preference restore cannot change the choice already submitted', async () => {
  await forgetRememberedCredentials();
  const raw = [...state.values.values()][0], slow = deferred<string>(); state.read.mockReturnValueOnce(slow.promise);
  await mount(); await fill();
  let attempt!: Promise<void>;
  await act(async () => { attempt = submit().props.onPress(); });
  await act(async () => { slow.resolve(raw); await attempt; });
  expect(checkbox().props.accessibilityState.checked).toBe(true);
  expect(await readRememberedCredentials()).toEqual({ remember: true, login: 'operator', password: '  sample пароль  ' });
});
