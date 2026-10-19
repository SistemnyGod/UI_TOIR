import { expect, it, vi } from 'vitest';
import { initializeNfc, startNfcReaderSession, stopNfcReaderSession, subscribeNfcAdapterState } from '@/services/nfcService';

const native = vi.hoisted(() => ({
  setEventListener: vi.fn(), isSupported: vi.fn(), start: vi.fn(), isEnabled: vi.fn(),
  registerTagEvent: vi.fn(), unregisterTagEvent: vi.fn()
}));
vi.mock('react-native-nfc-manager', () => ({ default: native, NfcAdapter: {}, NfcEvents: { StateChanged: 'state', DiscoverTag: 'tag' } }));

it('adapter listener cleanup cannot remove a listener owned by a newer screen', () => {
  const oldChange = vi.fn();
  const newChange = vi.fn();
  const removeOld = subscribeNfcAdapterState(oldChange);
  const oldListener = native.setEventListener.mock.calls.at(-1)![1];
  const removeNew = subscribeNfcAdapterState(newChange);
  const newListener = native.setEventListener.mock.calls.at(-1)![1];
  removeOld();
  expect(native.setEventListener.mock.calls.at(-1)![1]).toBe(newListener);
  oldListener({ state: 'on' });
  expect(oldChange).not.toHaveBeenCalled();
  newListener({ state: 'off' }); newListener({ state: 'turning_on' }); newListener({ state: 'unknown' }); newListener({ state: 'on' });
  expect(newChange.mock.calls).toEqual([[false], [true]]);
  removeNew();
  expect(native.setEventListener).toHaveBeenLastCalledWith('state', null);
});

it('failed adapter state lookup does not pretend NFC is enabled', async () => {
  native.isSupported.mockResolvedValue(true);
  native.start.mockResolvedValue(undefined);
  native.isEnabled.mockRejectedValue(new Error('Adapter unavailable'));
  await expect(initializeNfc()).rejects.toThrow('Adapter unavailable');
});

it('a delayed old stop completes before the new reader is registered, and cannot stop it again', async () => {
  native.unregisterTagEvent.mockResolvedValue(undefined);
  native.registerTagEvent.mockResolvedValue(undefined);
  const stopOld = await startNfcReaderSession(vi.fn());
  let release!: () => void;
  native.unregisterTagEvent.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  const stopping = stopOld();
  await vi.waitFor(() => expect(release).toBeDefined());
  const registering = startNfcReaderSession(vi.fn());
  await Promise.resolve();
  expect(native.registerTagEvent).toHaveBeenCalledTimes(1);
  release();
  await stopping;
  await registering;
  expect(native.registerTagEvent).toHaveBeenCalledTimes(2);
  const stops = native.unregisterTagEvent.mock.calls.length;
  await stopOld();
  expect(native.unregisterTagEvent).toHaveBeenCalledTimes(stops);
  await stopNfcReaderSession();
});
