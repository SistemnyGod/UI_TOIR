import { requireOptionalNativeModule } from "expo";
import type { ExpoSpeechRecognitionModule as SpeechModuleValue } from "expo-speech-recognition";

type SpeechModule = typeof SpeechModuleValue;

// Android's on-device recognizer (Speech Services by Google). Its installed
// locales are the offline language packs.
const onDeviceServicePackage = "com.google.android.as";

let cachedModule: SpeechModule | null | undefined;

/**
 * The native module is looked up lazily and optionally: an APK built before
 * expo-speech-recognition was added has no such module, and the point form
 * must still open there, only without voice input.
 */
function speechModule() {
  if (cachedModule === undefined) cachedModule = requireOptionalNativeModule<SpeechModule>("ExpoSpeechRecognition");
  return cachedModule;
}

export type SpeechStartOptions = { locale: string; onDevice: boolean };
export type SpeechHandlers = {
  onStart: () => void;
  onResult: (transcript: string, isFinal: boolean) => void;
  onError: (code: string) => void;
  onEnd: () => void;
};

export function isSpeechRecognitionAvailable() {
  try {
    return speechModule()?.isRecognitionAvailable() ?? false;
  } catch {
    return false;
  }
}

export async function requestSpeechMicrophonePermission() {
  const module = speechModule();
  if (!module) return { granted: false, canAskAgain: false };
  const result = await module.requestMicrophonePermissionsAsync();
  return { granted: result.granted, canAskAgain: result.canAskAgain };
}

/** Installed offline packs; empty when on-device recognition is unsupported (Android 12 and older). */
export async function listOfflineSpeechLocales() {
  const module = speechModule();
  try {
    if (!module?.supportsOnDeviceRecognition()) return [];
    const { installedLocales } = await module.getSupportedLocales({ androidRecognitionServicePackage: onDeviceServicePackage });
    return installedLocales;
  } catch {
    return [];
  }
}

/** Starts one recognition session and returns its unsubscribe function. */
export function startSpeechRecognition({ locale, onDevice }: SpeechStartOptions, handlers: SpeechHandlers) {
  const module = speechModule();
  if (!module) throw new Error("Speech recognition module is not installed");
  const subscriptions = [
    module.addListener("start", () => handlers.onStart()),
    module.addListener("result", event => handlers.onResult(event.results[0]?.transcript ?? "", event.isFinal)),
    module.addListener("error", event => handlers.onError(event.error)),
    module.addListener("end", () => handlers.onEnd()),
  ];
  const unsubscribe = () => { for (const subscription of subscriptions.splice(0)) subscription.remove(); };
  try {
    module.start({
      lang: locale,
      interimResults: true,
      continuous: false,
      requiresOnDeviceRecognition: onDevice,
      addsPunctuation: onDevice,
      ...(onDevice ? { androidRecognitionServicePackage: onDeviceServicePackage } : {}),
    });
  } catch (caught) {
    unsubscribe();
    throw caught;
  }
  return unsubscribe;
}

export function stopSpeechRecognition() {
  try { speechModule()?.stop(); } catch { /* Nothing is listening. */ }
}

export function abortSpeechRecognition() {
  try { speechModule()?.abort(); } catch { /* Nothing is listening. */ }
}
