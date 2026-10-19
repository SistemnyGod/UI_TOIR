import * as IntentLauncher from "expo-intent-launcher";
import * as SecureStore from "expo-secure-store";
import { Alert, Platform } from "react-native";

const promptShownKey = "patrol360.batteryOptimizationPrompt.v1";
let inFlight = false;

/**
 * Asked once, the first time a report waits on the phone. Aggressive OEM
 * battery managers (Xiaomi, Huawei, Samsung "deep sleep") kill WorkManager
 * jobs, so a report could otherwise wait until the app is opened again.
 * Opens the system list instead of REQUEST_IGNORE_BATTERY_OPTIMIZATIONS: that
 * needs an extra manifest permission and a native rebuild, and the list works
 * on every Android version.
 */
export async function maybePromptBatteryOptimizationExemption() {
  if (Platform.OS !== "android" || inFlight) return false;
  inFlight = true;
  try {
    if (await SecureStore.getItemAsync(promptShownKey)) return false;
    // Recorded before showing: a crash or a dismissed dialog must not nag again.
    await SecureStore.setItemAsync(promptShownKey, new Date().toISOString());
    Alert.alert(
      "Отправка отчётов в фоне",
      "Чтобы отчёт уходил сам, даже когда приложение закрыто, разрешите Patrol360 работать без ограничений батареи: найдите Patrol360 в списке и выберите «Не экономить».",
      [
        { text: "Позже", style: "cancel" },
        {
          text: "Открыть настройки",
          onPress: () => {
            void IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
              .catch(() => undefined);
          }
        }
      ]
    );
    return true;
  } catch {
    return false;
  } finally {
    inFlight = false;
  }
}
