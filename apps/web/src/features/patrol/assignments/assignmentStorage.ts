import type { ShiftTimeSettings } from "./assignmentTypes";

const assignmentFavoriteEmployeesStorageKey = "patrol360.patrolEmployees.favoriteIds.v1";
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
      const legacyIds = Array.isArray(legacyParsed) ? legacyParsed.filter((id): id is string => typeof id === "string") : [];
      if (legacyIds.length > 0) {
        window.localStorage.setItem(assignmentFavoriteEmployeesStorageKey, JSON.stringify(legacyIds));
      }

      return legacyIds;
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function saveAssignmentFavoriteEmployeeIds(ids: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(assignmentFavoriteEmployeesStorageKey, JSON.stringify(ids));
  window.localStorage.removeItem(legacyAssignmentFavoriteEmployeesStorageKey);
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
