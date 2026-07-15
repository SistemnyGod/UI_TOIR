import * as SecureStore from "expo-secure-store";

const accessTokenKey = "patrol360.accessToken";
const refreshTokenKey = "patrol360.refreshToken";
const ownerUserIdKey = "patrol360.ownerUserId";

export type StoredSessionSnapshot = {
  accessToken: string | null;
  refreshToken: string | null;
  ownerUserId: string | null;
};

export async function setTokens(accessToken: string, refreshToken: string) {
  await SecureStore.setItemAsync(accessTokenKey, accessToken);
  await SecureStore.setItemAsync(refreshTokenKey, refreshToken);
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
  const [accessToken, refreshToken, ownerUserId] = await Promise.all([
    getAccessToken(),
    getRefreshToken(),
    getStoredOwnerUserId()
  ]);

  return { accessToken, refreshToken, ownerUserId };
}

export async function restoreStoredSessionSnapshot(snapshot: StoredSessionSnapshot) {
  await clearTokens();

  if (snapshot.accessToken && snapshot.refreshToken) {
    await setTokens(snapshot.accessToken, snapshot.refreshToken);
  }

  if (snapshot.ownerUserId) {
    await setStoredOwnerUserId(snapshot.ownerUserId);
  }
}

export async function clearAuthTokens() {
  await SecureStore.deleteItemAsync(accessTokenKey);
  await SecureStore.deleteItemAsync(refreshTokenKey);
}

export async function clearTokens() {
  await clearAuthTokens();
  await SecureStore.deleteItemAsync(ownerUserIdKey);
}
