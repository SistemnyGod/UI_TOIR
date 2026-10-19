import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";

import type { OfflineSessionState } from "@/auth/offlineSession";
import { lockSession } from "@/auth/sessionGateState";

const accessTokenKey = "patrol360.accessToken";
const refreshTokenKey = "patrol360.refreshToken";
const ownerUserIdKey = "patrol360.ownerUserId";
const offlineSessionKey = "patrol360.offlineSession";
const refreshOperationIdKey = "patrol360.refreshOperationId";
const accessTokenExpiresAtKey = "patrol360.accessTokenExpiresAt";
const refreshTokenExpiresAtKey = "patrol360.refreshTokenExpiresAt";
const sessionEnvelopeKey = "patrol360.session.v1";
const sessionEnvelopeVersion = 1 as const;

export type StoredTokenMetadata = {
  accessExpiresAt?: string | null;
  refreshExpiresAt?: string | null;
};

export type StoredSessionSnapshot = {
  accessToken: string | null;
  refreshToken: string | null;
  accessExpiresAt: string | null;
  refreshExpiresAt: string | null;
  ownerUserId: string | null;
  offlineSession: OfflineSessionState | null;
  refreshOperationId: string | null;
};

type StoredSessionEnvelope = StoredSessionSnapshot & { version: typeof sessionEnvelopeVersion };
type SessionEnvelopeRead =
  | { state: "missing" | "invalid"; value: null }
  | { state: "valid"; value: StoredSessionEnvelope };
let envelopeMutationQueue: Promise<void> = Promise.resolve();

async function readSessionEnvelope(): Promise<SessionEnvelopeRead> {
  const raw = await SecureStore.getItemAsync(sessionEnvelopeKey);
  if (!raw) return { state: "missing", value: null };
  try {
    const value = JSON.parse(raw) as Partial<StoredSessionEnvelope>;
    if (value.version !== sessionEnvelopeVersion) return { state: "invalid", value: null };
    const stringFields = [value.accessToken, value.refreshToken, value.accessExpiresAt, value.refreshExpiresAt, value.ownerUserId, value.refreshOperationId];
    if (stringFields.some(field => field != null && typeof field !== "string")) return { state: "invalid", value: null };
    const offline = value.offlineSession;
    if (offline != null && (typeof offline !== "object"
      || [offline.userId, offline.fullName, offline.lastOnlineLoginAt, offline.expiresAt].some(field => typeof field !== "string")
      || (value.ownerUserId && offline.userId !== value.ownerUserId))) {
      return { state: "invalid", value: null };
    }
    return { state: "valid", value: {
      version: sessionEnvelopeVersion,
      accessToken: value.accessToken ?? null,
      refreshToken: value.refreshToken ?? null,
      accessExpiresAt: value.accessExpiresAt ?? null,
      refreshExpiresAt: value.refreshExpiresAt ?? null,
      ownerUserId: value.ownerUserId ?? null,
      offlineSession: value.offlineSession ?? null,
      refreshOperationId: value.refreshOperationId ?? null
    } };
  } catch {
    return { state: "invalid", value: null };
  }
}

async function writeSessionEnvelope(snapshot: StoredSessionSnapshot) {
  const envelope: StoredSessionEnvelope = { version: sessionEnvelopeVersion, ...snapshot };
  await SecureStore.setItemAsync(sessionEnvelopeKey, JSON.stringify(envelope));
}

function enqueueSessionMutation<T>(operation: () => Promise<T>): Promise<T> {
  const mutation = envelopeMutationQueue.then(operation);
  envelopeMutationQueue = mutation.then(() => undefined, () => undefined);
  return mutation;
}

export function storeSessionEnvelope(snapshot: StoredSessionSnapshot, assertCurrent?: () => void) {
  return enqueueSessionMutation(async () => {
    assertCurrent?.();
    await writeSessionEnvelope(snapshot);
    assertCurrent?.();
  });
}

export function updateSessionEnvelope(update: (current: StoredSessionSnapshot) => StoredSessionSnapshot, assertCurrent?: () => void) {
  return enqueueSessionMutation(() => applySessionUpdate(update, assertCurrent));
}

async function applySessionUpdate(update: (current: StoredSessionSnapshot) => StoredSessionSnapshot, assertCurrent?: () => void) {
  const current = await getStoredSessionSnapshot();
  assertCurrent?.();
  await writeSessionEnvelope(update(current));
  assertCurrent?.();
}

export async function setTokens(
  accessToken: string,
  refreshToken: string,
  metadata: StoredTokenMetadata = {}
) {
  await updateSessionEnvelope((current) => ({
    ...current, accessToken, refreshToken,
    accessExpiresAt: metadata.accessExpiresAt ?? null,
    refreshExpiresAt: metadata.refreshExpiresAt ?? null,
    refreshOperationId: null
  }));
}

export function setOfflineSession(session: OfflineSessionState) {
  return updateSessionEnvelope((current) => ({ ...current, offlineSession: session }));
}

export async function getOfflineSession(): Promise<OfflineSessionState | null> {
  const envelope = await readSessionEnvelope();
  const raw = envelope.state === "valid"
    ? JSON.stringify(envelope.value.offlineSession)
    : envelope.state === "missing" ? await SecureStore.getItemAsync(offlineSessionKey) : null;
  if (!raw || raw === "null") return null;

  try {
    const parsed = JSON.parse(raw) as Partial<OfflineSessionState>;
    const offlineExpiresAt = typeof parsed.offlineExpiresAt === "string"
      ? parsed.offlineExpiresAt
      : parsed.expiresAt;
    if (!parsed.userId || !parsed.fullName || !parsed.lastOnlineLoginAt || !parsed.expiresAt || !offlineExpiresAt) {
      return null;
    }

    const parsedContourId = typeof parsed.contourId === "string" ? parsed.contourId : undefined;

    return {
      userId: parsed.userId,
      contourId: parsedContourId,
      fullName: parsed.fullName,
      lastOnlineLoginAt: parsed.lastOnlineLoginAt,
      expiresAt: parsed.expiresAt,
      offlineExpiresAt,
      deviceTrusted: typeof parsed.deviceTrusted === "boolean" ? parsed.deviceTrusted : undefined,
      userBlockedAt: parsed.userBlockedAt ?? null,
      deviceBlockedAt: parsed.deviceBlockedAt ?? null,
      revokedAt: parsed.revokedAt ?? null,
      revocationReason: parsed.revocationReason ?? null,
      requiresReenrollment: parsed.requiresReenrollment ?? !parsedContourId
    };
  } catch {
    return null;
  }
}

export function getAccessToken() {
  return readEnvelopeValue("accessToken", accessTokenKey);
}

export function getRefreshToken() {
  return readEnvelopeValue("refreshToken", refreshTokenKey);
}

export function getAccessTokenExpiresAt() {
  return readEnvelopeValue("accessExpiresAt", accessTokenExpiresAtKey);
}

export function getRefreshTokenExpiresAt() {
  return readEnvelopeValue("refreshExpiresAt", refreshTokenExpiresAtKey);
}

async function readEnvelopeValue(key: keyof StoredSessionSnapshot, legacyKey: string) {
  const envelope = await readSessionEnvelope();
  if (envelope.state === "valid") {
    const value = envelope.value[key];
    return typeof value === "string" ? value : null;
  }
  return envelope.state === "missing" ? SecureStore.getItemAsync(legacyKey) : null;
}

export async function getOrCreateRefreshOperationId(assertCurrent?: () => void) {
  return enqueueSessionMutation(async () => {
    assertCurrent?.();
    const current = await getStoredSessionSnapshot();
    assertCurrent?.();
    if (current.refreshOperationId) return current.refreshOperationId;
    const operationId = Crypto.randomUUID();
    await writeSessionEnvelope({ ...current, refreshOperationId: operationId });
    assertCurrent?.();
    return operationId;
  });
}

export function clearRefreshOperationId() {
  return updateSessionEnvelope((current) => ({ ...current, refreshOperationId: null }));
}

export function setStoredOwnerUserId(ownerUserId: string) {
  return updateSessionEnvelope((current) => ({ ...current, ownerUserId }));
}

export function getStoredOwnerUserId() {
  return readEnvelopeValue("ownerUserId", ownerUserIdKey);
}

export async function getStoredSessionSnapshot(): Promise<StoredSessionSnapshot> {
  const envelope = await readSessionEnvelope();
  if (envelope.state === "valid") {
    const { version: _version, ...snapshot } = envelope.value;
    return snapshot;
  }
  if (envelope.state === "invalid") {
    return { accessToken: null, refreshToken: null, accessExpiresAt: null, refreshExpiresAt: null, ownerUserId: null, offlineSession: null, refreshOperationId: null };
  }
  const [accessToken, refreshToken, accessExpiresAt, refreshExpiresAt, ownerUserId, offlineSession, refreshOperationId] = await Promise.all([
    getAccessToken(),
    getRefreshToken(),
    getAccessTokenExpiresAt(),
    getRefreshTokenExpiresAt(),
    getStoredOwnerUserId(),
    getOfflineSession(),
    SecureStore.getItemAsync(refreshOperationIdKey)
  ]);

  return { accessToken, refreshToken, accessExpiresAt, refreshExpiresAt, ownerUserId, offlineSession, refreshOperationId };
}

export async function restoreStoredSessionSnapshot(snapshot: StoredSessionSnapshot, assertCurrent?: () => void) {
  await storeSessionEnvelope(snapshot, assertCurrent);
}

export async function clearVolatileTokens() {
  await enqueueSessionMutation(async () => {
    await applySessionUpdate((current) => ({
      ...current,
      accessToken: null,
      refreshToken: null,
      accessExpiresAt: null,
      refreshExpiresAt: null
    }));
    await Promise.all([
      SecureStore.deleteItemAsync(accessTokenKey),
      SecureStore.deleteItemAsync(refreshTokenKey),
      SecureStore.deleteItemAsync(accessTokenExpiresAtKey),
      SecureStore.deleteItemAsync(refreshTokenExpiresAtKey)
    ]);
  });
}
export async function clearAuthTokens() {
  await enqueueSessionMutation(async () => {
    await applySessionUpdate((current) => ({
      ...current,
      accessToken: null,
      refreshToken: null,
      accessExpiresAt: null,
      refreshExpiresAt: null,
      refreshOperationId: null
    }));
    await Promise.all([
      SecureStore.deleteItemAsync(accessTokenKey),
      SecureStore.deleteItemAsync(refreshTokenKey),
      SecureStore.deleteItemAsync(accessTokenExpiresAtKey),
      SecureStore.deleteItemAsync(refreshTokenExpiresAtKey),
      SecureStore.deleteItemAsync(refreshOperationIdKey)
    ]);
    lockSession();
  });
}

export async function clearLocalSessionKeepingRefreshToken() {
  await enqueueSessionMutation(async () => {
    await applySessionUpdate((current) => ({
      ...current,
      accessToken: null,
      accessExpiresAt: null,
      ownerUserId: null,
      offlineSession: null,
      refreshOperationId: null
    }));
    await Promise.all([
      SecureStore.deleteItemAsync(accessTokenKey),
      SecureStore.deleteItemAsync(accessTokenExpiresAtKey)
    ]);
    await SecureStore.deleteItemAsync(refreshOperationIdKey);
    await SecureStore.deleteItemAsync(ownerUserIdKey);
    await SecureStore.deleteItemAsync(offlineSessionKey);
    lockSession();
  });
}
export async function markSessionNeedsReenrollment(reason = "device_reenrollment_required") {
  await enqueueSessionMutation(async () => {
    await applySessionUpdate(current => ({
      ...current,
      accessToken: null, refreshToken: null, accessExpiresAt: null, refreshExpiresAt: null, refreshOperationId: null,
      offlineSession: current.offlineSession ? {
        ...current.offlineSession,
        revokedAt: null,
        revocationReason: reason,
        requiresReenrollment: true
      } : null
    }));
    lockSession();
  });
}

export async function preserveOfflineSessionAfterRefreshFailure(reason: string, assertCurrent?: () => void) {
  await updateSessionEnvelope(current => ({
    ...current,
    accessToken: null, refreshToken: null, accessExpiresAt: null, refreshExpiresAt: null, refreshOperationId: null,
    offlineSession: current.offlineSession ? {
      ...current.offlineSession,
      revokedAt: null,
      revocationReason: reason,
      requiresReenrollment: true
    } : null
  }), assertCurrent);
}

export async function revokeStoredSession(reason: string, assertCurrent?: () => void) {
  await enqueueSessionMutation(async () => {
    await applySessionUpdate(current => ({
      ...current,
      accessToken: null, refreshToken: null, accessExpiresAt: null, refreshExpiresAt: null, refreshOperationId: null,
      offlineSession: current.offlineSession ? {
        ...current.offlineSession,
        revokedAt: new Date().toISOString(),
        revocationReason: reason
      } : null
    }), assertCurrent);
    assertCurrent?.();
    lockSession();
  });
}

export async function clearTokens() {
  await enqueueSessionMutation(async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(sessionEnvelopeKey),
      SecureStore.deleteItemAsync(accessTokenKey),
      SecureStore.deleteItemAsync(refreshTokenKey),
      SecureStore.deleteItemAsync(accessTokenExpiresAtKey),
      SecureStore.deleteItemAsync(refreshTokenExpiresAtKey),
      SecureStore.deleteItemAsync(refreshOperationIdKey),
      SecureStore.deleteItemAsync(ownerUserIdKey),
      SecureStore.deleteItemAsync(offlineSessionKey)
    ]);
    lockSession();
  });
}
