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

export async function setTokens(
  accessToken: string,
  refreshToken: string,
  metadata: StoredTokenMetadata = {}
) {
  await Promise.all([
    SecureStore.setItemAsync(accessTokenKey, accessToken),
    SecureStore.setItemAsync(refreshTokenKey, refreshToken),
    setOptionalSecureValue(accessTokenExpiresAtKey, metadata.accessExpiresAt),
    setOptionalSecureValue(refreshTokenExpiresAtKey, metadata.refreshExpiresAt),
    clearRefreshOperationId()
  ]);
}

async function setOptionalSecureValue(key: string, value: string | null | undefined) {
  if (value) {
    await SecureStore.setItemAsync(key, value);
    return;
  }

  await SecureStore.deleteItemAsync(key);
}

export function setOfflineSession(session: OfflineSessionState) {
  return SecureStore.setItemAsync(offlineSessionKey, JSON.stringify(session));
}

export async function getOfflineSession(): Promise<OfflineSessionState | null> {
  const raw = await SecureStore.getItemAsync(offlineSessionKey);
  if (!raw) {
    return null;
  }

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
  return SecureStore.getItemAsync(accessTokenKey);
}

export function getRefreshToken() {
  return SecureStore.getItemAsync(refreshTokenKey);
}

export function getAccessTokenExpiresAt() {
  return SecureStore.getItemAsync(accessTokenExpiresAtKey);
}

export function getRefreshTokenExpiresAt() {
  return SecureStore.getItemAsync(refreshTokenExpiresAtKey);
}

export async function getOrCreateRefreshOperationId() {
  const existing = await SecureStore.getItemAsync(refreshOperationIdKey);
  if (existing) {
    return existing;
  }

  const operationId = Crypto.randomUUID();
  await SecureStore.setItemAsync(refreshOperationIdKey, operationId);
  return operationId;
}

export function clearRefreshOperationId() {
  return SecureStore.deleteItemAsync(refreshOperationIdKey);
}

export function setStoredOwnerUserId(ownerUserId: string) {
  return SecureStore.setItemAsync(ownerUserIdKey, ownerUserId);
}

export function getStoredOwnerUserId() {
  return SecureStore.getItemAsync(ownerUserIdKey);
}

export async function getStoredSessionSnapshot(): Promise<StoredSessionSnapshot> {
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

export async function restoreStoredSessionSnapshot(snapshot: StoredSessionSnapshot) {
  await clearTokens();

  if (snapshot.accessToken && snapshot.refreshToken) {
    await setTokens(snapshot.accessToken, snapshot.refreshToken, {
      accessExpiresAt: snapshot.accessExpiresAt,
      refreshExpiresAt: snapshot.refreshExpiresAt
    });
  }

  if (snapshot.ownerUserId) {
    await setStoredOwnerUserId(snapshot.ownerUserId);
  }

  if (snapshot.offlineSession) {
    await setOfflineSession(snapshot.offlineSession);
  }

  if (snapshot.refreshOperationId) {
    await SecureStore.setItemAsync(refreshOperationIdKey, snapshot.refreshOperationId);
  }
}

export async function clearVolatileTokens() {
  await Promise.all([
    SecureStore.deleteItemAsync(accessTokenKey),
    SecureStore.deleteItemAsync(refreshTokenKey),
    SecureStore.deleteItemAsync(accessTokenExpiresAtKey),
    SecureStore.deleteItemAsync(refreshTokenExpiresAtKey)
  ]);
}
export async function clearAuthTokens() {
  await Promise.all([
    SecureStore.deleteItemAsync(accessTokenKey),
    SecureStore.deleteItemAsync(refreshTokenKey),
    SecureStore.deleteItemAsync(accessTokenExpiresAtKey),
    SecureStore.deleteItemAsync(refreshTokenExpiresAtKey)
  ]);
  await clearRefreshOperationId();
  lockSession();
}

export async function clearLocalSessionKeepingRefreshToken() {
  await Promise.all([
    SecureStore.deleteItemAsync(accessTokenKey),
    SecureStore.deleteItemAsync(accessTokenExpiresAtKey)
  ]);
  await clearRefreshOperationId();
  await SecureStore.deleteItemAsync(ownerUserIdKey);
  await SecureStore.deleteItemAsync(offlineSessionKey);
  lockSession();

}
export async function markSessionNeedsReenrollment(reason = "device_reenrollment_required") {
  const offlineSession = await getOfflineSession();
  if (offlineSession) {
    await setOfflineSession({
      ...offlineSession,
      revokedAt: null,
      revocationReason: reason,
      requiresReenrollment: true
    });
  }
  await clearAuthTokens();
}

export async function preserveOfflineSessionAfterRefreshFailure(reason: string) {
  const offlineSession = await getOfflineSession();
  if (offlineSession) {
    await setOfflineSession({
      ...offlineSession,
      revokedAt: null,
      revocationReason: reason,
      requiresReenrollment: false
    });
  }
}

export async function revokeStoredSession(reason: string) {
  const offlineSession = await getOfflineSession();
  if (offlineSession) {
    await setOfflineSession({
      ...offlineSession,
      revokedAt: new Date().toISOString(),
      revocationReason: reason
    });
  }
  await clearAuthTokens();
}

export async function clearTokens() {
  await clearAuthTokens();
  await Promise.all([
    SecureStore.deleteItemAsync(ownerUserIdKey),
    SecureStore.deleteItemAsync(offlineSessionKey)
  ]);
}
