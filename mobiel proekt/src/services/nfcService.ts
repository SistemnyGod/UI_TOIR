import NfcManager, { NfcAdapter, NfcEvents } from 'react-native-nfc-manager';

type NfcTagHandler = (tag: unknown) => void | Promise<void>;

let activeReaderStop: (() => Promise<void>) | null = null;
let readerOperation: Promise<void> = Promise.resolve();

export async function initializeNfc() {
  const isSupported = await NfcManager.isSupported();

  if (!isSupported) {
    return { supported: false, enabled: false };
  }

  await NfcManager.start();

  const enabled = await NfcManager.isEnabled().catch(() => true);

  return { supported: true, enabled };
}

/**
 * Starts one foreground Android reader session. Reader mode consumes the tag
 * inside the app, so Android does not route the same tag to the system Tags
 * storage application when the patrol screen is active.
 */
export async function startNfcReaderSession(onTag: NfcTagHandler) {
  return withReaderOperation(() => startNfcReaderSessionUnsafe(onTag));
}

async function startNfcReaderSessionUnsafe(onTag: NfcTagHandler) {
  await stopNfcReaderSessionUnsafe();

  const readerFlags =
    NfcAdapter.FLAG_READER_NFC_A
    | NfcAdapter.FLAG_READER_NFC_B
    | NfcAdapter.FLAG_READER_NFC_F
    | NfcAdapter.FLAG_READER_NFC_V;

  NfcManager.setEventListener(NfcEvents.DiscoverTag, onTag);

  try {
    await NfcManager.registerTagEvent({
      alertMessage: 'Поднесите телефон к NFC-метке',
      invalidateAfterFirstRead: false,
      isReaderModeEnabled: true,
      readerModeFlags: readerFlags,
      readerModeDelay: 250
    });
  } catch (error) {
    NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
    throw error;
  }

  let stopped = false;
  const stop = async () => {
    if (stopped) {
      return;
    }

    stopped = true;
    NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
    await NfcManager.unregisterTagEvent().catch(() => undefined);
  };

  activeReaderStop = stop;
  return stop;
}

export async function stopNfcReaderSession() {
  return withReaderOperation(stopNfcReaderSessionUnsafe);
}

async function stopNfcReaderSessionUnsafe() {
  const stop = activeReaderStop;
  activeReaderStop = null;

  if (stop) {
    await stop();
    return;
  }

  NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
  await NfcManager.unregisterTagEvent().catch(() => undefined);
}

async function withReaderOperation<T>(operation: () => Promise<T>) {
  const previous = readerOperation;
  let release: () => void = () => undefined;
  readerOperation = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

// Kept as a compatibility alias for existing callers.
export async function cancelNfcRead() {
  await stopNfcReaderSession();
}

export function getNfcCode(tag: unknown) {
  return getNfcCodes(tag)[0] ?? null;
}

export function getNfcCodes(tag: unknown) {
  if (!tag || typeof tag !== 'object') {
    return [];
  }

  const codes = new Set<string>();
  const ndefCode = getNdefTextCode(tag);
  if (ndefCode) {
    codes.add(normalizeNfcCode(ndefCode));
  }

  const candidate = 'id' in tag ? (tag as { id?: unknown }).id : null;

  if (typeof candidate === 'string' && candidate.trim().length > 0) {
    codes.add(normalizeNfcCode(candidate));
  }

  if (Array.isArray(candidate) && candidate.every((item) => typeof item === 'number')) {
    codes.add(normalizeNfcCode(bytesToHex(candidate)));
  }

  if (candidate instanceof Uint8Array) {
    codes.add(normalizeNfcCode(bytesToHex(Array.from(candidate))));
  }

  return Array.from(codes).filter(Boolean);
}

// MVP compatibility: the API field is still named nfcUidHash, but it carries this raw normalized code.
export function normalizeNfcCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[‘’”]/g, '-');
}

export function getNfcCodeCandidates(value: string) {
  const normalized = normalizeNfcCode(value);
  if (!normalized) {
    return [];
  }

  const candidates = new Set<string>([normalized]);
  const compact = normalized.replace(/[-_:]/g, '');
  if (compact) {
    candidates.add(compact);
  }

  const reversed = /^[0-9A-F]+$/.test(compact) ? reverseHexBytes(compact) : null;
  if (reversed) {
    candidates.add(reversed);
  }

  return Array.from(candidates);
}

function getNdefTextCode(tag: object) {
  const records = 'ndefMessage' in tag ? (tag as { ndefMessage?: unknown }).ndefMessage : null;
  if (!Array.isArray(records)) {
    return null;
  }

  for (const record of records) {
    const text = readNdefTextRecord(record);
    if (text) {
      return text;
    }
  }

  return null;
}

function readNdefTextRecord(record: unknown) {
  if (!record || typeof record !== 'object') {
    return null;
  }

  const payloadValue = 'payload' in record ? (record as { payload?: unknown }).payload : null;
  const payload = bytesFromUnknown(payloadValue);
  if (!payload || payload.length === 0) {
    return null;
  }

  const typeValue = 'type' in record ? (record as { type?: unknown }).type : null;
  const type = bytesFromUnknown(typeValue);
  const isTextRecord = type ? bytesToAscii(type) === 'T' : true;
  if (!isTextRecord) {
    return null;
  }

  const languageCodeLength = payload[0] & 0x3f;
  const textBytes = payload.slice(1 + languageCodeLength);
  const text = bytesToUtf8(textBytes).trim();
  return text.length > 0 ? text : null;
}

function bytesFromUnknown(value: unknown) {
  if (Array.isArray(value) && value.every((item) => typeof item === 'number')) {
    return value;
  }

  if (value instanceof Uint8Array) {
    return Array.from(value);
  }

  return null;
}

function bytesToAscii(bytes: number[]) {
  return String.fromCharCode(...bytes);
}

function bytesToUtf8(bytes: number[]) {
  try {
    return decodeURIComponent(
      bytes
        .map((byte) => `%${byte.toString(16).padStart(2, '0')}`)
        .join('')
    );
  } catch {
    return bytesToAscii(bytes);
  }
}

function bytesToHex(bytes: number[]) {
  return bytes
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function reverseHexBytes(value: string) {
  if (value.length % 2 !== 0) {
    return null;
  }

  const bytes = value.match(/../g);
  if (!bytes || bytes.length < 2) {
    return null;
  }

  return bytes.reverse().join('');
}
