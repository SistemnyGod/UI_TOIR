const PPE_NORM_SETTINGS_INTENT_KEY = "patrol360:inventory-ppe:norm-settings-intent";

export type PpeNormSettingsIntent = {
  position: string;
};

export function savePpeNormSettingsIntent(position: string) {
  window.sessionStorage.setItem(PPE_NORM_SETTINGS_INTENT_KEY, JSON.stringify({ position: position.trim() }));
}

export function readPpeNormSettingsIntent(): PpeNormSettingsIntent | null {
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(PPE_NORM_SETTINGS_INTENT_KEY) ?? "null");
    if (!value || typeof value !== "object") return null;
    const position = (value as Partial<PpeNormSettingsIntent>).position;
    return typeof position === "string" && position.trim() ? { position: position.trim() } : null;
  } catch {
    return null;
  }
}

export function clearPpeNormSettingsIntent() {
  window.sessionStorage.removeItem(PPE_NORM_SETTINGS_INTENT_KEY);
}
