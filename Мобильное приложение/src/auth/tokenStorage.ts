import * as SecureStore from "expo-secure-store";

const accessTokenKey = "patrol360.accessToken";
const refreshTokenKey = "patrol360.refreshToken";
const ownerUserIdKey = "patrol360.ownerUserId";

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

export async function clearAuthTokens() {
  await SecureStore.deleteItemAsync(accessTokenKey);
  await SecureStore.deleteItemAsync(refreshTokenKey);
}

export async function clearTokens() {
  await clearAuthTokens();
  await SecureStore.deleteItemAsync(ownerUserIdKey);
}
