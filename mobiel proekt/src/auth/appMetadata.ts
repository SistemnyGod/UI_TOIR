import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";

import { createLoginPayload, resolveRuntimeMetadata } from "@/auth/appMetadataPolicy";

export function getAppRuntimeMetadata() {
  return resolveRuntimeMetadata({
    expoVersion: Constants.expoConfig?.version,
    nativeAppVersion: Constants.nativeAppVersion,
    nativeBuildVersion: Constants.nativeBuildVersion,
    androidVersionCode: Constants.expoConfig?.android?.versionCode,
    platformName: Device.osName ?? Platform.OS,
    osVersion: Device.osVersion,
    manufacturer: Device.manufacturer,
    modelName: Device.modelName,
    modelId: Device.modelId,
    productName: Device.productName,
    deviceName: Device.deviceName
  });
}

export { createLoginPayload };
