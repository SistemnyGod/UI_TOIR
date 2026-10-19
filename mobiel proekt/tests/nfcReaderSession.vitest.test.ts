import { beforeEach, expect, it, vi } from 'vitest';

// The scan screen reads tags through one foreground reader-mode session: Android hands the tag
// to the app instead of the system Tags application, and the same tag can be read again
// without re-arming. A tag is identified by its NDEF text and by its physical UID.
const native = vi.hoisted(() => ({
  setEventListener: vi.fn(), isSupported: vi.fn(), start: vi.fn(), isEnabled: vi.fn(),
  registerTagEvent: vi.fn(), unregisterTagEvent: vi.fn(), requestTechnology: vi.fn(), cancelTechnologyRequest: vi.fn()
}));
vi.mock('react-native-nfc-manager', () => ({
  default: native,
  NfcAdapter: {
    FLAG_READER_NFC_A: 0x1, FLAG_READER_NFC_B: 0x2, FLAG_READER_NFC_F: 0x4, FLAG_READER_NFC_V: 0x8,
    FLAG_READER_SKIP_NDEF_CHECK: 0x80, FLAG_READER_NO_PLATFORM_SOUNDS: 0x100
  },
  NfcEvents: { StateChanged: 'state', DiscoverTag: 'tag' }
}));

import { getNfcCodes, startNfcReaderSession, stopNfcReaderSession } from '@/services/nfcService';

beforeEach(() => {
  vi.clearAllMocks();
  native.registerTagEvent.mockResolvedValue(undefined);
  native.unregisterTagEvent.mockResolvedValue(undefined);
});

const tagListener = () => native.setEventListener.mock.calls.filter(([event]) => event === 'tag').at(-1)?.[1];

it('a scan session uses reader mode for NFC-A and NFC-V tags and keeps reading after the first tag', async () => {
  const onTag = vi.fn();
  await startNfcReaderSession(onTag);

  expect(native.registerTagEvent).toHaveBeenCalledOnce();
  const options = native.registerTagEvent.mock.calls[0][0] as { isReaderModeEnabled: boolean; invalidateAfterFirstRead: boolean; readerModeFlags: number };
  expect(options).toMatchObject({ isReaderModeEnabled: true, invalidateAfterFirstRead: false });
  expect(options.readerModeFlags & 0x1).toBe(0x1);
  expect(options.readerModeFlags & 0x8).toBe(0x8);
  expect(tagListener()).toBe(onTag);
  // The system tag dispatch (technology requests) is never involved.
  expect(native.requestTechnology).not.toHaveBeenCalled();

  await stopNfcReaderSession();
  expect(native.unregisterTagEvent).toHaveBeenCalledOnce();
  expect(tagListener()).toBeNull();
});

it('a tag yields both its normalized NDEF text and its physical UID', () => {
  const text = [...new TextEncoder().encode('\u0002ru point-7 ')];
  const tag = { id: '04a1b2c3', ndefMessage: [{ type: [84], payload: text }] };

  expect(getNfcCodes(tag)).toEqual(['POINT-7', '04A1B2C3']);
  expect(getNfcCodes({ id: [0x04, 0xa1, 0xb2] })).toEqual(['04A1B2']);
  expect(getNfcCodes(null)).toEqual([]);
});
