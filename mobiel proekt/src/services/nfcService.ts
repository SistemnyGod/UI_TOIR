import NfcManager, { NfcAdapter, NfcEvents } from 'react-native-nfc-manager';

type NfcTagHandler = (tag: unknown) => void | Promise<void>;
type ReaderMode = 'scan' | 'guard';

/**
 * Android hands a tag to other apps (Tags, a browser for URL records) whenever
 * reader mode is off while our activity is in front, which minimizes Patrol360.
 * So reader mode stays on all the time the app is signed in: the scan screen's
 * session reads tags, and between sessions a quiet "guard" reader swallows them.
 * Switching modes re-registers reader mode in place, never through an
 * unregistered gap. The native module disables reader mode on pause and
 * re-enables it on resume by itself.
 */
let activeScanSession: object | null = null;
let guardOwner: { onTag: NfcTagHandler } | null = null;
let readerOperation: Promise<void> = Promise.resolve();
let adapterListenerOwner: object | null = null;

const scanReaderFlags =
  NfcAdapter.FLAG_READER_NFC_A
  | NfcAdapter.FLAG_READER_NFC_B
  | NfcAdapter.FLAG_READER_NFC_F
  | NfcAdapter.FLAG_READER_NFC_V;
// The scan keeps the NDEF check (points are matched by the NDEF text too) and the
// platform beep, the only sound a read makes. The guard needs only the UID and
// must stay silent: the tag is not processed there.
const guardReaderFlags = scanReaderFlags
  | NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK
  | NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS;

export function subscribeNfcAdapterState(onChange: (enabled: boolean) => void) {
  const owner = {};
  adapterListenerOwner = owner;
  NfcManager.setEventListener(NfcEvents.StateChanged, ({ state }: { state: string }) => {
    if (adapterListenerOwner !== owner) return;
    if (state === 'on') onChange(true);
    else if (state === 'off' || state === 'turning_off') onChange(false);
  });
  return () => {
    if (adapterListenerOwner !== owner) return;
    adapterListenerOwner = null;
    NfcManager.setEventListener(NfcEvents.StateChanged, null);
  };
}

export async function openNfcSettings() {
  await NfcManager.goToNfcSetting();
}

/** Lightweight fallback for devices that miss the adapter broadcast. */
export async function isNfcEnabled() {
  return NfcManager.isEnabled();
}

export async function initializeNfc() {
  const isSupported = await NfcManager.isSupported();

  if (!isSupported) {
    return { supported: false, enabled: false };
  }

  await NfcManager.start();

  const enabled = await NfcManager.isEnabled();

  return { supported: true, enabled };
}

/**
 * Starts one foreground Android reader session. Reader mode consumes the tag
 * inside the app, so Android does not route the same tag to the system Tags
 * storage application when the patrol screen is active. Stopping the session
 * hands the reader back to the guard when one is enabled.
 */
export async function startNfcReaderSession(onTag: NfcTagHandler) {
  const stop = await withReaderOperation(() => startNfcReaderSessionUnsafe(onTag));
  // A late screen owns only this session. Serialize its cleanup so it cannot
  // unregister a newer reader while Android is still completing the old stop.
  return () => withReaderOperation(stop);
}

async function startNfcReaderSessionUnsafe(onTag: NfcTagHandler) {
  const session = {};
  // A previous session's stop becomes a no-op; the reader is re-registered in place.
  activeScanSession = session;

  try {
    await registerReader('scan', onTag);
  } catch (error) {
    if (activeScanSession === session) {
      activeScanSession = null;
      await restoreIdleReader();
    }
    throw error;
  }

  return async () => {
    if (activeScanSession !== session) {
      return;
    }

    activeScanSession = null;
    await restoreIdleReader();
  };
}

export async function stopNfcReaderSession() {
  return withReaderOperation(async () => {
    activeScanSession = null;
    await restoreIdleReader();
  });
}

/**
 * Keeps reader mode on outside scan sessions so a tag touched by accident is
 * consumed by the app instead of opening another app. Returns the disable call.
 */
export async function enableNfcGuard(onTag: NfcTagHandler) {
  const owner = { onTag };
  await withReaderOperation(async () => {
    const nfc = await initializeNfc().catch(() => null);
    if (!nfc?.supported) return;
    guardOwner = owner;
    if (!activeScanSession) await restoreIdleReader();
  });

  return () => withReaderOperation(async () => {
    if (guardOwner !== owner) return;
    guardOwner = null;
    if (!activeScanSession) await restoreIdleReader();
  });
}

/** Re-applies the guard, e.g. after the app returns to the foreground. */
export async function refreshNfcGuard() {
  await withReaderOperation(async () => {
    if (guardOwner && !activeScanSession) await restoreIdleReader();
  });
}

async function restoreIdleReader() {
  const guard = guardOwner;
  if (guard) {
    try {
      await registerReader('guard', guard.onTag);
      return;
    } catch {
      // Fall through: a half-registered guard must not keep a stale listener.
    }
  }

  NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
  await NfcManager.unregisterTagEvent().catch(() => undefined);
}

async function registerReader(mode: ReaderMode, onTag: NfcTagHandler) {
  // Tags already in flight with the old flags go to the old owner: the guard
  // takes over at once, the scan only after its own flags are active, so a
  // UID-only guard read is never treated as a scan.
  if (mode === 'guard') NfcManager.setEventListener(NfcEvents.DiscoverTag, onTag);

  try {
    await NfcManager.registerTagEvent({
      alertMessage: 'Поднесите телефон к NFC-метке',
      invalidateAfterFirstRead: false,
      isReaderModeEnabled: true,
      readerModeFlags: mode === 'scan' ? scanReaderFlags : guardReaderFlags,
      readerModeDelay: 250
    });
  } catch (error) {
    NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
    throw error;
  }

  if (mode === 'scan') NfcManager.setEventListener(NfcEvents.DiscoverTag, onTag);
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

/**
 * Reader mode reports a tag that left the field before its NDEF data was read as an
 * NDEF tag without records; only the UID is usable then. The screen still tries the
 * UID, and treats a miss as an unstable read worth retrying rather than a foreign tag.
 */
export function isIncompleteNdefRead(tag: unknown) {
  if (!tag || typeof tag !== 'object') {
    return false;
  }

  const techTypes = 'techTypes' in tag ? (tag as { techTypes?: unknown }).techTypes : null;
  const hasNdefTech = Array.isArray(techTypes) && techTypes.some((tech) => tech === 'android.nfc.tech.Ndef');
  const records = 'ndefMessage' in tag ? (tag as { ndefMessage?: unknown }).ndefMessage : null;
  return hasNdefTech && (!Array.isArray(records) || records.length === 0);
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
