import type { PercoDiagnosticsDto, PercoIntegrationLogDto, PercoIntegrationSettingsDto, PercoUnmatchedEmployeeDto } from "../../src/api/contracts";

// Synthetic records for frontend checks. No PERCo server is contacted.
export const percoSettings: PercoIntegrationSettingsDto = {
  isEnabled: true, authMode: "LoginPassword", baseUrl: "http://perco.example.test", username: "patrol",
  hasPassword: true, hasToken: false, timezone: "Asia/Yekaterinburg", employeesSyncMinutes: 60, eventsSyncMinutes: 5,
  shiftStartToleranceMinutes: 30, shiftEndToleranceMinutes: 30, devPath: "/dev",
  employeesEndpoint: "/api/users/staff/fullList", eventsEndpoint: "/api/accessReports/events", lastDiscoverySummary: "",
  lastConnectionCheckAt: "2026-10-13T10:20:00+05:00", lastConnectionStatus: "success", lastConnectionError: null,
  secretStatus: { apiStatus: "OK", apiCheckedAt: null, apiError: null, workerStatus: "OK", workerCheckedAt: null, workerError: null },
};
const names = ["Иванов Иван Иванович", "Петров Андрей Сергеевич", "Смирнов Дмитрий Павлович", "Кузнецова Анна Викторовна", "Волков Сергей Николаевич", "Соколов Алексей Михайлович", "Орлов Михаил Анатольевич"];
export const percoDiagnostics: PercoDiagnosticsDto = {
  generatedAt: "2026-10-13T10:24:00+05:00", windowStart: "2026-10-12T00:00:00+05:00", windowEnd: "2026-10-13T10:24:00+05:00",
  recentEventsCount: 8, openPresenceCount: 4, closedPresenceCount: 2, oldOpenPresenceCount: 1, unmatchedEventsCount: 2,
  presenceIntervals: names.map((employeeName, index) => ({
    id: `interval-${index}`, employeeId: `emp-${index + 1}`, employeeName, personnelNo: `10${index + 1}`,
    startedAt: index === 6 ? "2026-10-09T08:00:00+05:00" : "2026-10-13T08:00:00+05:00",
    endedAt: index === 3 || index === 4 ? "2026-10-13T09:00:00+05:00" : null,
    durationMinutes: index === 6 ? 5904 : index === 3 || index === 4 ? 60 : 144,
    source: "perco", state: index === 6 ? "Старый вход" : index === 5 ? "Спорный" : index === 3 || index === 4 ? "Закрыт" : "Открыт",
    stateCode: index === 6 ? "old_open" : index === 5 ? "stale" : index === 3 || index === 4 ? "outside" : "inside",
    needsReview: index >= 5, analysisReason: index >= 5 ? "Не найден подтверждённый выход" : "", suggestedAction: "Проверить проходы", analysisConfidence: 1,
  })),
  recentEvents: Array.from({ length: 8 }, (_, index) => ({
    id: `event-${index}`, percoEventId: `external-event-${index}`, percoEmployeeId: `external-${index}`,
    employeeId: index < 6 ? `emp-${index + 1}` : null, employeeName: names[index] || "Несопоставленный сотрудник", personnelNo: `10${index + 1}`,
    deviceName: "КПП-1 · Турникет", direction: index === 3 || index === 4 ? "OUT" : "IN", directionLabel: index === 3 || index === 4 ? "Выход" : "Вход",
    zoneTransition: index === 3 || index === 4 ? "Завод → Неконтролируемая зона" : "Неконтролируемая зона → Завод",
    shiftMarker: "День", eventAt: `2026-10-13T${index === 3 || index === 4 ? "09" : "08"}:00:00+05:00`,
  })),
};
export const percoLogs: PercoIntegrationLogDto[] = [{
  id: "log-1", operation: "sync_events", status: "success", message: "Проходы синхронизированы", details: "loaded=8; duplicates=0",
  startedAt: "2026-10-13T10:20:00+05:00", finishedAt: "2026-10-13T10:20:02+05:00", createdByUserId: null,
}];
export const percoUnmatched: PercoUnmatchedEmployeeDto[] = [
  { percoEmployeeId: "external-6", fullName: "Иванов Иван Иванович", personnelNo: "101", cardNumber: "009105", department: "Производственный участок", suggestedEmployeeId: "emp-1", suggestedEmployeeName: names[0] },
  { percoEmployeeId: "external-7", fullName: "Зайцев Николай Петрович", personnelNo: "108", cardNumber: "009106", department: "Производственный участок", suggestedEmployeeId: null, suggestedEmployeeName: "" },
];
