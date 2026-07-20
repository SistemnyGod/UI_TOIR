import Constants from "expo-constants";
import { Platform } from "react-native";

export function getDeviceDisplayName() {
  const platformConstants = Platform.constants as typeof Platform.constants & {
    Brand?: string;
    Model?: string;
  };
  const brand = clean(platformConstants.Brand);
  const model = clean(platformConstants.Model);

  if (brand && model && !model.toLowerCase().startsWith(brand.toLowerCase())) {
    return `${brand} ${model}`;
  }

  const configuredDeviceName = clean(Constants.deviceName);
  return model ?? brand ?? configuredDeviceName ?? `${Platform.OS} device`;
}

function clean(value: string | undefined | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
