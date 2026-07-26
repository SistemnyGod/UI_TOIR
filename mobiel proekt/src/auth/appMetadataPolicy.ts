export type RuntimeMetadataSource = {
  expoVersion?: string | null;
  nativeAppVersion?: string | null;
  nativeBuildVersion?: string | null;
  androidVersionCode?: string | number | null;
  platformName?: string | null;
  osVersion?: string | null;
  manufacturer?: string | null;
  modelName?: string | null;
  modelId?: string | null;
  productName?: string | null;
  deviceName?: string | null;
};

export type AppRuntimeMetadata = {
  appVersion: string;
  buildVersion: string;
  deviceName: string;
  platform: string;
};

export type LoginMetadataInput = {
  login: string;
  password: string;
  deviceId: string;
};

export type LoginPayload = LoginMetadataInput & {
  deviceName: string;
  platform: string;
  appVersion: string;
};

export function resolveRuntimeMetadata(source: RuntimeMetadataSource): AppRuntimeMetadata {
  const appVersion = clean(source.expoVersion) ?? clean(source.nativeAppVersion) ?? "unknown";
  const buildVersion = clean(source.nativeBuildVersion)
    ?? clean(source.androidVersionCode === null || source.androidVersionCode === undefined
      ? null
      : String(source.androidVersionCode))
    ?? "unknown";
  const platformName = clean(source.platformName) ?? "unknown";
  const model = clean(source.modelName) ?? clean(source.productName) ?? clean(source.modelId);
  const manufacturer = clean(source.manufacturer);
  const configuredDeviceName = clean(source.deviceName);
  const deviceName = combineDeviceName(manufacturer, model)
    ?? configuredDeviceName
    ?? (platformName + " device");
  const platform = [platformName, clean(source.osVersion), "build " + buildVersion]
    .filter(Boolean)
    .join(" ");

  return { appVersion, buildVersion, deviceName, platform };
}

export function createLoginPayload(
  credentials: LoginMetadataInput,
  metadata: Pick<AppRuntimeMetadata, "appVersion" | "deviceName" | "platform">
): LoginPayload {
  return {
    ...credentials,
    deviceName: metadata.deviceName,
    platform: metadata.platform,
    appVersion: metadata.appVersion
  };
}

function combineDeviceName(manufacturer: string | null, model: string | null) {
  if (!manufacturer && !model) {
    return null;
  }
  if (!manufacturer) {
    return model;
  }
  if (!model || model.toLowerCase().startsWith(manufacturer.toLowerCase())) {
    return model ?? manufacturer;
  }
  return manufacturer + " " + model;
}

function clean(value: string | undefined | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}