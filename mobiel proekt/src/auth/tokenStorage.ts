import * as SecureStore from "expo-secure-store";

import type { OfflineSessionState } from "@/auth/offlineSession";
import { lockSession } from "@/auth/sessionGateState";

const accessTokenKey = "patrol360.accessToken";
const refreshTokenKey = "patrol360.refreshToken";
const ownerUserIdKey = "patrol360.ownerUserId";
const offlineSessionKey = "patrol360.offlineSession";

export type StoredSessionSnapshot = {
  accessToken: string | null;
  refreshToken: string | null;
  ownerUserId: string | null;
  offlineSession: OfflineSessionState | null;
};

export async function setTokens(accessToken: string, refreshToken: string) {
  await SecureStore.setItemAsync(accessTokenKey, accessToken);
  await SecureStore.setItemAsync(refreshTokenKey, refreshToken);
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
    if (!parsed.userId || !parsed.fullName || !parsed.lastOnlineLoginAt || !parsed.expiresAt) {
      return null;
    }

    return {
      userId: parsed.userId,
      fullName: parsed.fullName,
      lastOnlineLoginAt: parsed.lastOnlineLoginAt,
      expiresAt: parsed.expiresAt,
      revokedAt: parsed.revokedAt ?? null,
      revocationReason: parsed.revocationReason ?? null
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

export function setStoredOwnerUserId(ownerUserId: string) {
  return SecureStore.setItemAsync(ownerUserIdKey, ownerUserId);
}

export function getStoredOwnerUserId() {
  return SecureStore.getItemAsync(ownerUserIdKey);
}

export async function getStoredSessionSnapshot(): Promise<StoredSessionSnapshot> {
  const [accessToken, refreshToken, ownerUserId, offlineSession] = await Promise.all([
    getAccessToken(),
    getRefreshToken(),
    getStoredOwnerUserId(),
    getOfflineSession()
  ]);

  return { accessToken, refreshToken, ownerUserId, offlineSession };
}

export async function restoreStoredSessionSnapshot(snapshot: StoredSessionSnapshot) {
  await clearTokens();

  if (snapshot.accessToken && snapshot.refreshToken) {
    await setTokens(snapshot.accessToken, snapshot.refreshToken);
  }

  if (snapshot.ownerUserId) {
    await setStoredOwnerUserId(snapshot.ownerUserId);
  }

  if (snapshot.offlineSession) {
    await setOfflineSession(snapshot.offlineSession);
  }
}

export async function clearAuthTokens() {
  await SecureStore.deleteItemAsync(accessTokenKey);
  await SecureStore.deleteItemAsync(refreshTokenKey);
  lockSession();
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
