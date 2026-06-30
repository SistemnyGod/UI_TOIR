import type { ShiftTimeSettings } from "./assignmentTypes";

export const assignmentFavoriteEmployeesStorageKey = "patrol360.patrolEmployees.favoriteIds.v1";
export const assignmentFavoriteEmployeesChangedEvent = "patrol360:patrolEmployeesFavoriteIdsChanged";
const legacyAssignmentFavoriteEmployeesStorageKey = "patrol360.assignment.favoriteEmployees.v1";
const assignmentShiftSettingsStorageKey = "patrol360.assignment.shiftSettings.v1";

export const defaultAssignmentShiftSettings: ShiftTimeSettings = {
  dayEnd: "14:00",
  dayStart: "06:00",
  nightEnd: "06:00",
  nightStart: "22:00",
};

export function loadAssignmentFavoriteEmployeeIds() {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(assignmentFavoriteEmployeesStorageKey);
    if (!raw) {
      const legacyRaw = window.localStorage.getItem(legacyAssignmentFavoriteEmployeesStorageKey);
      if (!legacyRaw) return [];

      const legacyParsed = JSON.parse(legacyRaw);
      const legacyIds = normalizeFavoriteEmployeeIds(legacyParsed);
      if (legacyIds.length > 0) {
        window.localStorage.setItem(assignmentFavoriteEmployeesStorageKey, JSON.stringify(legacyIds));
      }

      return legacyIds;
    }

    const parsed = JSON.parse(raw);
    return normalizeFavoriteEmployeeIds(parsed);
  } catch {
    return [];
  }
}

export function saveAssignmentFavoriteEmployeeIds(ids: string[]) {
  if (typeof window === "undefined") return;
  const normalizedIds = normalizeFavoriteEmployeeIds(ids);
  window.localStorage.setItem(assignmentFavoriteEmployeesStorageKey, JSON.stringify(normalizedIds));
  window.localStorage.removeItem(legacyAssignmentFavoriteEmployeesStorageKey);
  window.dispatchEvent(new CustomEvent(assignmentFavoriteEmployeesChangedEvent, { detail: normalizedIds }));
}

export function hasStoredAssignmentFavoriteEmployeeIds() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(assignmentFavoriteEmployeesStorageKey) !== null;
}

export function subscribeAssignmentFavoriteEmployeeIds(listener: (ids: string[]) => void) {
  if (typeof window === "undefined") return () => undefined;

  const handleLocalChange = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    listener(Array.isArray(detail) ? normalizeFavoriteEmployeeIds(detail) : loadAssignmentFavoriteEmployeeIds());
  };
  const handleStorageChange = (event: StorageEvent) => {
    if (
      event.key === assignmentFavoriteEmployeesStorageKey ||
      event.key === legacyAssignmentFavoriteEmployeesStorageKey
    ) {
      listener(loadAssignmentFavoriteEmployeeIds());
    }
  };

  window.addEventListener(assignmentFavoriteEmployeesChangedEvent, handleLocalChange);
  window.addEventListener("storage", handleStorageChange);

  return () => {
    window.removeEventListener(assignmentFavoriteEmployeesChangedEvent, handleLocalChange);
    window.removeEventListener("storage", handleStorageChange);
  };
}

export function loadAssignmentShiftSettings(): ShiftTimeSettings {
  if (typeof window === "undefined") return defaultAssignmentShiftSettings;

  try {
    const raw = window.localStorage.getItem(assignmentShiftSettingsStorageKey);
    if (!raw) return defaultAssignmentShiftSettings;

    const parsed = JSON.parse(raw) as Partial<ShiftTimeSettings>;
    return normalizeShiftSettings(parsed);
  } catch {
    return defaultAssignmentShiftSettings;
  }
}

export function saveAssignmentShiftSettings(settings: ShiftTimeSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(assignmentShiftSettingsStorageKey, JSON.stringify(normalizeShiftSettings(settings)));
}

export function normalizeShiftSettings(settings: Partial<ShiftTimeSettings>): ShiftTimeSettings {
  return {
    dayEnd: isValidTimeValue(settings.dayEnd) ? settings.dayEnd : defaultAssignmentShiftSettings.dayEnd,
    dayStart: isValidTimeValue(settings.dayStart) ? settings.dayStart : defaultAssignmentShiftSettings.dayStart,
    nightEnd: isValidTimeValue(settings.nightEnd) ? settings.nightEnd : defaultAssignmentShiftSettings.nightEnd,
    nightStart: isValidTimeValue(settings.nightStart) ? settings.nightStart : defaultAssignmentShiftSettings.nightStart,
  };
}

function isValidTimeValue(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

function normalizeFavoriteEmployeeIds(value: unknown) {
  const ids = Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
}
