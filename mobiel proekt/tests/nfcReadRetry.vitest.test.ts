import { expect, it, vi } from 'vitest';

vi.mock('react-native-nfc-manager', () => ({ default: {}, NfcAdapter: {}, NfcEvents: {} }));
vi.mock('react-native', () => ({ Vibration: { vibrate: vi.fn() } }));

import { createNfcReadRetryTracker, nfcReadFailureEventType, nfcReadRetryPolicy, nfcReaderStartRetryDelaysMs } from '@/features/patrol/nfcReadRetryPolicy';
import { getNfcCodes, isIncompleteNdefRead } from '@/services/nfcService';
import { scanVibrationPatterns } from '@/services/scanFeedback';

it('retries two failed reads silently, then reports one error with the hint and starts a fresh burst', () => {
  const tracker = createNfcReadRetryTracker();
  expect(tracker.recordFailure('tagLost')).toEqual({ kind: 'tagLost', attempt: 1, retry: true, delayMs: 250, showHint: false });
  expect(tracker.recordFailure('tagLost')).toEqual({ kind: 'tagLost', attempt: 2, retry: true, delayMs: 600, showHint: false });
  expect(tracker.recordFailure('unreadableTag')).toEqual({ kind: 'unreadableTag', attempt: 3, retry: false, delayMs: 0, showHint: true });
  // The next presentation is retried again, and the hint stays while reads keep failing.
  expect(tracker.recordFailure('tagLost')).toMatchObject({ attempt: 1, retry: true });
  expect(tracker.recordFailure('tagLost')).toMatchObject({ attempt: 2, retry: true });
  expect(tracker.recordFailure('tagLost')).toMatchObject({ attempt: 3, retry: false, showHint: true });
});

it('a good read in between resets both the burst and the hint counter', () => {
  const tracker = createNfcReadRetryTracker();
  tracker.recordFailure('tagLost');
  tracker.recordFailure('tagLost');
  tracker.recordSuccess();
  expect(tracker.recordFailure('tagLost')).toMatchObject({ attempt: 1, retry: true });
  tracker.reset();
  expect(tracker.recordFailure('tagLost')).toMatchObject({ attempt: 1, retry: true });
});

it('a policy without retries shows the error at once and the hint only after repeated failures', () => {
  const tracker = createNfcReadRetryTracker({ maxAutomaticRetries: 0, retryDelaysMs: [], hintAfterFailures: 2 });
  expect(tracker.recordFailure('tagLost')).toMatchObject({ retry: false, showHint: false });
  expect(tracker.recordFailure('tagLost')).toMatchObject({ retry: false, showHint: true });
});

it('keeps the policy bounded and every failure kind visible to the daily diagnostic report', () => {
  expect(nfcReadRetryPolicy.maxAutomaticRetries).toBeLessThanOrEqual(3);
  expect(nfcReadRetryPolicy.retryDelaysMs.reduce((sum, delay) => sum + delay, 0)).toBeLessThan(2000);
  expect(nfcReaderStartRetryDelaysMs.length).toBeGreaterThan(0);
  for (const kind of ['unreadableTag', 'tagLost', 'readerStart'] as const) {
    expect(nfcReadFailureEventType(kind)).toMatch(/failed/);
  }
  expect(new Set(['unreadableTag', 'tagLost', 'readerStart'].map(kind => nfcReadFailureEventType(kind as never))).size).toBe(3);
});

it('flags an NDEF tag delivered without records as an incomplete read, but keeps its UID usable', () => {
  const halfRead = { id: '04A1B2C3', techTypes: ['android.nfc.tech.NfcA', 'android.nfc.tech.Ndef'], ndefMessage: [] };
  expect(isIncompleteNdefRead(halfRead)).toBe(true);
  expect(isIncompleteNdefRead({ id: '04A1B2C3', techTypes: ['android.nfc.tech.Ndef'] })).toBe(true);
  expect(getNfcCodes(halfRead)).toEqual(['04A1B2C3']);

  const text = [...new TextEncoder().encode('\u0002ruPOINT-7')];
  expect(isIncompleteNdefRead({ id: '04A1B2C3', techTypes: ['android.nfc.tech.Ndef'], ndefMessage: [{ type: [84], payload: text }] })).toBe(false);
  expect(isIncompleteNdefRead({ id: '04A1B2C3', techTypes: ['android.nfc.tech.NfcA', 'android.nfc.tech.MifareUltralight'] })).toBe(false);
  expect(isIncompleteNdefRead(null)).toBe(false);
});

it('gives each outcome its own vibration pattern', () => {
  const patterns = Object.values(scanVibrationPatterns).map(pattern => pattern.join(','));
  expect(new Set(patterns).size).toBe(patterns.length);
  expect(scanVibrationPatterns.wrongTag.length).toBeGreaterThan(scanVibrationPatterns.success.length);
});
