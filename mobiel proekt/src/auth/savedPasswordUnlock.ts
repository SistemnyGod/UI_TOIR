import * as LocalAuthentication from "expo-local-authentication";

/**
 * Shift phones are shared, so a remembered password is released only after the
 * phone owner proves presence with the device lock: fingerprint or face, with
 * the device PIN, pattern or password as fallback.
 */
export type SavedPasswordUnlock = "unlocked" | "cancelled" | "no-device-lock" | "failed";

const noLockErrors = new Set(["not_enrolled", "passcode_not_set", "not_available"]);
const cancelErrors = new Set(["user_cancel", "system_cancel", "app_cancel", "user_fallback"]);

/** Whether the phone has a secure lock screen that can protect the saved password. */
export async function hasDeviceLock(): Promise<boolean> {
  try {
    return (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

export async function unlockSavedPassword(): Promise<SavedPasswordUnlock> {
  if (!await hasDeviceLock()) return "no-device-lock";
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Подтвердите вход сохранённым паролем",
      cancelLabel: "Отмена",
      fallbackLabel: "Код устройства",
      disableDeviceFallback: false
    });
    if (result.success) return "unlocked";
    if (noLockErrors.has(result.error)) return "no-device-lock";
    if (cancelErrors.has(result.error)) return "cancelled";
    return "failed";
  } catch {
    return "failed";
  }
}

export const savedPasswordUnlockMessages: Record<Exclude<SavedPasswordUnlock, "unlocked">, string> = {
  "no-device-lock": "На телефоне не настроена блокировка экрана (отпечаток, PIN-код или графический ключ), поэтому сохранённый пароль использовать нельзя. Введите пароль вручную.",
  cancelled: "Вход сохранённым паролем отменён. Подтвердите отпечатком или кодом телефона либо введите пароль.",
  failed: "Не удалось подтвердить личность. Повторите попытку или введите пароль вручную."
};
