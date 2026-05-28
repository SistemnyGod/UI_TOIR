import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

const deviceIdKey = "patrol360.deviceId";

export async function getOrCreateDeviceId() {
  const existing = await SecureStore.getItemAsync(deviceIdKey);

  if (existing) {
    return existing;
  }

  const deviceId = Crypto.randomUUID();
  await SecureStore.setItemAsync(deviceIdKey, deviceId);

  return deviceId;
}
