/**
 * Unstable NFC reads are retried silently by re-arming the reader: Android re-polls a
 * tag that is still held to the phone. Only after the retries run out does the guard
 * see an error, and after repeated failures the error carries a hold-still hint.
 *
 * - unreadableTag: the tag gave no usable code at all;
 * - tagLost: the tag left the field before its NDEF data was read and its UID alone
 *   matched nothing;
 * - readerStart: Android refused to start the reader (IO error in the NFC service).
 */
export type NfcReadFailureKind = 'unreadableTag' | 'tagLost' | 'readerStart';

export type NfcReadRetryPolicy = {
  /** Silent retries after the first failed read of one tag presentation. */
  maxAutomaticRetries: number;
  retryDelaysMs: number[];
  /** Consecutive failed reads (without a good one in between) before the hint appears. */
  hintAfterFailures: number;
};

export const nfcReadRetryPolicy: NfcReadRetryPolicy = {
  maxAutomaticRetries: 2,
  retryDelaysMs: [250, 600],
  hintAfterFailures: 3
};

/** Reader start (registerTagEvent) is retried with a longer backoff before showing an error. */
export const nfcReaderStartRetryDelaysMs = [400, 1200];

export type NfcReadFailureDecision = {
  kind: NfcReadFailureKind;
  /** 1-based attempt number within the current tag presentation. */
  attempt: number;
  retry: boolean;
  delayMs: number;
  showHint: boolean;
};

export function createNfcReadRetryTracker(policy: NfcReadRetryPolicy = nfcReadRetryPolicy) {
  let burst = 0;
  let consecutive = 0;
  return {
    recordFailure(kind: NfcReadFailureKind): NfcReadFailureDecision {
      burst += 1;
      consecutive += 1;
      const attempt = burst;
      const retry = burst <= policy.maxAutomaticRetries;
      const delayMs = retry ? policy.retryDelaysMs[Math.min(burst - 1, policy.retryDelaysMs.length - 1)] ?? 0 : 0;
      if (!retry) burst = 0;
      return { kind, attempt, retry, delayMs, showHint: !retry && consecutive >= policy.hintAfterFailures };
    },
    recordSuccess() {
      burst = 0;
      consecutive = 0;
    },
    reset() {
      burst = 0;
      consecutive = 0;
    }
  };
}

export type NfcReadRetryTracker = ReturnType<typeof createNfcReadRetryTracker>;

const readFailureEventTypes: Record<NfcReadFailureKind, string> = {
  unreadableTag: 'patrol.nfc.read_failed.unreadable_tag',
  tagLost: 'patrol.nfc.read_failed.tag_lost',
  readerStart: 'patrol.nfc.reader_start_failed'
};

/** Event types contain "failed", so the daily diagnostic report counts them by kind. */
export function nfcReadFailureEventType(kind: NfcReadFailureKind) {
  return readFailureEventTypes[kind];
}
