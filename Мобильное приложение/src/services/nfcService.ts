import NfcManager, { NfcTech } from "react-native-nfc-manager";

const nfcTechFallbackOrder = [
  NfcTech.Ndef,
  NfcTech.NfcA,
  NfcTech.NfcB,
  NfcTech.NfcV,
  NfcTech.IsoDep
];

export async function initializeNfc() {
  const isSupported = await NfcManager.isSupported();

  if (!isSupported) {
    return { supported: false };
  }

  await NfcManager.start();

  return { supported: true };
}

export async function readNfcTag() {
  let lastError: unknown = null;

  for (const tech of nfcTechFallbackOrder) {
    try {
      await NfcManager.requestTechnology(tech);
      return await NfcManager.getTag();
    } catch (error) {
      lastError = error;
    } finally {
      await NfcManager.cancelTechnologyRequest().catch(() => undefined);
    }
  }

  throw lastError ?? new Error("NFC tag is not available.");
}

export function getNfcCode(tag: unknown) {
  if (!tag || typeof tag !== "object") {
    return null;
  }

  const ndefCode = getNdefTextCode(tag);
  if (ndefCode) {
    return normalizeNfcCode(ndefCode);
  }

  const candidate = "id" in tag ? (tag as { id?: unknown }).id : null;

  if (typeof candidate === "string" && candidate.trim().length > 0) {
    return normalizeNfcCode(candidate);
  }

  if (Array.isArray(candidate) && candidate.every((item) => typeof item === "number")) {
    return normalizeNfcCode(bytesToHex(candidate));
  }

  if (candidate instanceof Uint8Array) {
    return normalizeNfcCode(bytesToHex(Array.from(candidate)));
  }

  return null;
}

// MVP compatibility: the API field is still named nfcUidHash, but it carries this raw normalized code.
export function normalizeNfcCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[‐‑‒–—]/g, "-");
}

export function getNfcCodeCandidates(value: string) {
  const normalized = normalizeNfcCode(value);
  if (!normalized) {
    return [];
  }

  const candidates = new Set<string>([normalized]);
  const compact = normalized.replace(/[-_:]/g, "");
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
  const records = "ndefMessage" in tag ? (tag as { ndefMessage?: unknown }).ndefMessage : null;
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
  if (!record || typeof record !== "object") {
    return null;
  }

  const payloadValue = "payload" in record ? (record as { payload?: unknown }).payload : null;
  const payload = bytesFromUnknown(payloadValue);
  if (!payload || payload.length === 0) {
    return null;
  }

  const typeValue = "type" in record ? (record as { type?: unknown }).type : null;
  const type = bytesFromUnknown(typeValue);
  const isTextRecord = type ? bytesToAscii(type) === "T" : true;
  if (!isTextRecord) {
    return null;
  }

  const languageCodeLength = payload[0] & 0x3f;
  const textBytes = payload.slice(1 + languageCodeLength);
  const text = bytesToUtf8(textBytes).trim();
  return text.length > 0 ? text : null;
}

function bytesFromUnknown(value: unknown) {
  if (Array.isArray(value) && value.every((item) => typeof item === "number")) {
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
        .map((byte) => `%${byte.toString(16).padStart(2, "0")}`)
        .join("")
    );
  } catch {
    return bytesToAscii(bytes);
  }
}

function bytesToHex(bytes: number[]) {
  return bytes
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function reverseHexBytes(value: string) {
  if (value.length % 2 !== 0) {
    return null;
  }

  const bytes = value.match(/../g);
  if (!bytes || bytes.length < 2) {
    return null;
  }

  return bytes.reverse().join("");
}
