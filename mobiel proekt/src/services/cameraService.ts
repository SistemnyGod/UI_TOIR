import { Camera } from "expo-camera";

export async function ensureCameraPermission() {
  const current = await Camera.getCameraPermissionsAsync();

  if (current.granted) {
    return true;
  }

  const requested = await Camera.requestCameraPermissionsAsync();

  return requested.granted;
}
