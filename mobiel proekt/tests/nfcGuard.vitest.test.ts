import { beforeEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  setEventListener: vi.fn(), isSupported: vi.fn(), start: vi.fn(), isEnabled: vi.fn(),
  registerTagEvent: vi.fn(), unregisterTagEvent: vi.fn()
}));
vi.mock('react-native-nfc-manager', () => ({
  default: native,
  NfcAdapter: {
    FLAG_READER_NFC_A: 0x1, FLAG_READER_NFC_B: 0x2, FLAG_READER_NFC_F: 0x4, FLAG_READER_NFC_V: 0x8,
    FLAG_READER_SKIP_NDEF_CHECK: 0x80, FLAG_READER_NO_PLATFORM_SOUNDS: 0x100
  },
  NfcEvents: { StateChanged: 'state', DiscoverTag: 'tag' }
}));

import { createNfcReadMemory, nfcDuplicateReadWindowMs } from '@/services/nfcReadMemory';
import { createNfcGuardController, decideGuardTag } from '@/services/nfcGuardService';
import { enableNfcGuard, refreshNfcGuard, startNfcReaderSession, stopNfcReaderSession } from '@/services/nfcService';

const scanFlags = 0x1 | 0x2 | 0x4 | 0x8;
const guardFlags = scanFlags | 0x80 | 0x100;

/** Native reader calls in order, as `register:<flags>` / `unregister`. */
function readerCalls() {
  const calls: { order: number; call: string }[] = [
    ...native.registerTagEvent.mock.calls.map((args, index) => ({
      order: native.registerTagEvent.mock.invocationCallOrder[index],
      call: `register:${(args[0] as { readerModeFlags: number }).readerModeFlags === guardFlags ? 'guard' : 'scan'}`
    })),
    ...native.unregisterTagEvent.mock.invocationCallOrder.map(order => ({ order, call: 'unregister' }))
  ];
  return calls.sort((a, b) => a.order - b.order).map(entry => entry.call);
}

function currentTagListener() {
  const calls = native.setEventListener.mock.calls.filter(([event]) => event === 'tag');
  return calls.at(-1)?.[1] as ((tag: unknown) => void) | null;
}

beforeEach(() => {
  vi.clearAllMocks();
  native.isSupported.mockResolvedValue(true);
  native.start.mockResolvedValue(undefined);
  native.isEnabled.mockResolvedValue(true);
  native.registerTagEvent.mockResolvedValue(undefined);
  native.unregisterTagEvent.mockResolvedValue(undefined);
});

it('treats the same UID inside the window as a duplicate, and a new read after it as fresh', () => {
  const memory = createNfcReadMemory();
  memory.recordRead(['POINT-7', '04A1B2C3'], 1000);
  // The guard reads only the UID; any shared code is the same tag.
  expect(memory.isDuplicate(['04A1B2C3'], 1000 + nfcDuplicateReadWindowMs - 1)).toBe(true);
  expect(memory.isDuplicate(['04A1B2C3'], 1000 + nfcDuplicateReadWindowMs)).toBe(false);
  expect(memory.isDuplicate(['04FFFFFF'], 1500)).toBe(false);
  expect(nfcDuplicateReadWindowMs).toBe(3000);

  memory.forget(['04A1B2C3']);
  expect(memory.isDuplicate(['04A1B2C3'], 1500)).toBe(false);
});

it('remembers marked tags per patrol and forgets them when another patrol opens', () => {
  const memory = createNfcReadMemory();
  memory.setScope('assignment-1');
  memory.markTag(['POINT-7', '04A1B2C3']);
  expect(memory.isMarked(['04A1B2C3'])).toBe(true);
  memory.setScope('assignment-1');
  expect(memory.isMarked(['04A1B2C3'])).toBe(true);
  memory.setScope('assignment-2');
  expect(memory.isMarked(['04A1B2C3'])).toBe(false);
});

it('the guard stays silent on the scan screen and for duplicates, and names marked tags', () => {
  const memory = createNfcReadMemory();
  const tag = { id: '04a1b2c3' };
  expect(decideGuardTag(tag, memory, true, 0)).toBeNull();
  expect(decideGuardTag(tag, memory, false, 0)).toBe('openScan');
  expect(decideGuardTag(tag, memory, false, 1000)).toBeNull();
  memory.markTag(['04A1B2C3']);
  expect(decideGuardTag(tag, memory, false, 5000)).toBe('alreadyMarked');
  expect(decideGuardTag({}, memory, false, 10000)).toBeNull();
});

it('a tag that followed a scan into the next screen is swallowed without a hint', () => {
  const memory = createNfcReadMemory();
  memory.recordRead(['POINT-7', '04A1B2C3'], 1000);
  memory.markTag(['POINT-7', '04A1B2C3']);
  expect(decideGuardTag({ id: '04A1B2C3' }, memory, false, 1800)).toBeNull();
});

it('hands the reader from guard to scan and back without unregistering in between', async () => {
  const guardTag = vi.fn();
  const disableGuard = await enableNfcGuard(guardTag);
  expect(readerCalls()).toEqual(['register:guard']);
  expect(currentTagListener()).toBe(guardTag);

  const scanTag = vi.fn();
  const stopScan = await startNfcReaderSession(scanTag);
  expect(readerCalls()).toEqual(['register:guard', 'register:scan']);
  expect(currentTagListener()).toBe(scanTag);

  await stopScan();
  expect(readerCalls()).toEqual(['register:guard', 'register:scan', 'register:guard']);
  expect(currentTagListener()).toBe(guardTag);

  // A screen that already lost its session cannot take the reader from the guard.
  await stopScan();
  expect(native.registerTagEvent).toHaveBeenCalledTimes(3);

  await refreshNfcGuard();
  expect(readerCalls().at(-1)).toBe('register:guard');

  await disableGuard();
  expect(readerCalls().at(-1)).toBe('unregister');
  expect(currentTagListener()).toBeNull();
});

it('a scan started while the guard registers waits for it, and a stop without a guard turns reader mode off', async () => {
  let release!: () => void;
  native.registerTagEvent.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  const enabling = enableNfcGuard(vi.fn());
  await vi.waitFor(() => expect(release).toBeDefined());
  const starting = startNfcReaderSession(vi.fn());
  await Promise.resolve();
  expect(native.registerTagEvent).toHaveBeenCalledTimes(1);
  release();
  const disableGuard = await enabling;
  await starting;
  expect(readerCalls()).toEqual(['register:guard', 'register:scan']);

  // The scan owns the reader; dropping the guard leaves it alone.
  await disableGuard();
  expect(readerCalls()).toEqual(['register:guard', 'register:scan']);
  await stopNfcReaderSession();
  expect(readerCalls().at(-1)).toBe('unregister');
});

it('a scan that fails to register falls back to the guard', async () => {
  const guardTag = vi.fn();
  const disableGuard = await enableNfcGuard(guardTag);
  native.registerTagEvent.mockRejectedValueOnce(new Error('reader busy'));
  await expect(startNfcReaderSession(vi.fn())).rejects.toThrow('reader busy');
  expect(readerCalls()).toEqual(['register:guard', 'register:scan', 'register:guard']);
  expect(currentTagListener()).toBe(guardTag);
  await disableGuard();
});

it('the controller runs the guard while signed in, refreshes it on resume and clears reads on sign-out', async () => {
  const memory = createNfcReadMemory();
  const disable = vi.fn(async () => undefined);
  let handler: ((tag: unknown) => void) | null = null;
  const enable = vi.fn(async (onTag: (tag: unknown) => void) => { handler = onTag; return disable; });
  const refresh = vi.fn(async () => undefined);
  let scanScreen = false;
  const controller = createNfcGuardController({ enable, refresh, memory, isScanScreenActive: () => scanScreen, now: () => 0 });
  const notices: string[] = [];
  controller.subscribe(notice => notices.push(notice));

  await controller.onAppStateChange('active');
  expect(refresh).not.toHaveBeenCalled();
  await controller.setSignedIn(true);
  await controller.setSignedIn(true);
  expect(enable).toHaveBeenCalledTimes(1);

  await controller.onAppStateChange('background');
  expect(refresh).not.toHaveBeenCalled();
  await controller.onAppStateChange('active');
  expect(refresh).toHaveBeenCalledTimes(1);

  scanScreen = true;
  handler!({ id: '04A1' });
  scanScreen = false;
  handler!({ id: '04B2' });
  expect(notices).toEqual(['openScan']);

  await controller.setSignedIn(false);
  expect(disable).toHaveBeenCalledTimes(1);
  expect(memory.isDuplicate(['04B2'], 0)).toBe(false);
  handler!({ id: '04C3' });
  expect(notices).toEqual(['openScan']);
});
