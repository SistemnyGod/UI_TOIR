import { getAppRuntimeMetadata } from "@/auth/appMetadata";

export function getDeviceDisplayName() {
  return getAppRuntimeMetadata().deviceName;
}