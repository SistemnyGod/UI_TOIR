import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ values: new Map<string, string>(), contour: 'test', write: vi.fn(), read: vi.fn(), remove: vi.fn() }));
vi.mock('expo-secure-store', () => ({ getItemAsync: state.read, setItemAsync: state.write, deleteItemAsync: state.remove, WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only' }));
vi.mock('@/core/environments', () => ({ get currentContourId() { return state.contour; } }));
beforeEach(() => {
  vi.resetModules(); state.values.clear(); state.contour = 'test';
  state.read.mockReset().mockImplementation(async key => state.values.get(key) ?? null);
  state.write.mockReset().mockImplementation(async (key, value) => { state.values.set(key, value); });
  state.remove.mockReset().mockImplementation(async key => { state.values.delete(key); });
});
const service = () => import('@/auth/rememberedCredentials');
it('restores the entire pair after a cold module restart using one SecureStore record', async () => {
  const api = await service(); await api.prepareRememberedCredentialsSave()('operator', '  sample парóль  ');
  expect(state.write).toHaveBeenCalledOnce(); expect(state.write.mock.calls[0][2]).toEqual({ keychainAccessible: 'device-only' });
  vi.resetModules();
  expect(await (await service()).readRememberedCredentials()).toEqual({ remember: true, login: 'operator', password: '  sample парóль  ' });
});
it('keeps legacy saved login available when the previous build discarded its password', async () => {
  state.values.set('patrol360.rememberLogin', 'true'); state.values.set('patrol360.rememberedLogin', 'operator');
  expect(await (await service()).readRememberedCredentials()).toEqual({ remember: true, login: 'operator', password: '' });
});
it('retains an existing legacy password only with an enabled preference and login', async () => {
  state.values.set('patrol360.rememberLogin', 'true'); state.values.set('patrol360.rememberedLogin', 'operator'); state.values.set('patrol360.rememberedPassword', 'legacy-sample');
  const api = await service(); expect(await api.readRememberedCredentials()).toMatchObject({ password: 'legacy-sample' });
  await api.prepareRememberedCredentialsSave()('operator', 'updated-sample');
  expect(state.values.has('patrol360.rememberedPassword')).toBe(false);
  expect(await api.readRememberedCredentials()).toMatchObject({ password: 'updated-sample' });
});
it('an unchecked legacy preference cannot restore stale fields', async () => {
  state.values.set('patrol360.rememberLogin', 'false'); state.values.set('patrol360.rememberedLogin', 'stale'); state.values.set('patrol360.rememberedPassword', 'stale-sample');
  expect(await (await service()).readRememberedCredentials()).toEqual({ remember: false, login: '', password: '' });
});
it('does not offer another contour credentials', async () => {
  const api = await service(); await api.prepareRememberedCredentialsSave()('operator', 'sample');
  state.contour = 'other'; expect(await api.readRememberedCredentials()).toEqual({ remember: true, login: '', password: '' });
  state.contour = 'test'; expect(await api.readRememberedCredentials()).toMatchObject({ login: 'operator', password: 'sample' });
});
it('forgetting prevents restoration even if cleanup of legacy entries fails', async () => {
  const api = await service(); await api.prepareRememberedCredentialsSave()('operator', 'sample');
  state.values.set('patrol360.rememberedPassword', 'legacy-sample'); state.remove.mockRejectedValue(new Error('cleanup unavailable'));
  await api.forgetRememberedCredentials(); vi.resetModules();
  expect(await (await service()).readRememberedCredentials()).toEqual({ remember: false, login: '', password: '' });
  expect([...state.values.values()].some(value => value.includes('"password":"sample"'))).toBe(false);
});
it('a failed replacement retains the previous matching login and password', async () => {
  const api = await service(); await api.prepareRememberedCredentialsSave()('first', 'first-sample');
  state.write.mockRejectedValueOnce(new Error('storage unavailable'));
  await expect(api.prepareRememberedCredentialsSave()('second', 'second-sample')).rejects.toThrow('storage unavailable');
  expect(await api.readRememberedCredentials()).toEqual({ remember: true, login: 'first', password: 'first-sample' });
});
it('a late successful login cannot undo a newer unchecked choice', async () => {
  const api = await service(); const oldLogin = api.prepareRememberedCredentialsSave();
  await api.forgetRememberedCredentials(); await oldLogin('operator', 'sample');
  expect(await api.readRememberedCredentials()).toEqual({ remember: false, login: '', password: '' });
});
it('only the most recent login attempt may commit its credentials', async () => {
  const api = await service(); const first = api.prepareRememberedCredentialsSave(), second = api.prepareRememberedCredentialsSave();
  await second('second', 'second-sample'); await first('first', 'first-sample');
  expect(await api.readRememberedCredentials()).toEqual({ remember: true, login: 'second', password: 'second-sample' });
});
it('malformed data produces a generic error and does not poison subsequent storage operations', async () => {
  const api = await service(); await api.prepareRememberedCredentialsSave()('operator', 'sample');
  const key = state.write.mock.calls[0][0]; state.values.set(key, 'broken password private-sample');
  await expect(api.readRememberedCredentials()).rejects.toThrow('Не удалось прочитать сохранённые данные для входа.');
  await api.forgetRememberedCredentials(); expect(await api.readRememberedCredentials()).toMatchObject({ remember: false });
});
