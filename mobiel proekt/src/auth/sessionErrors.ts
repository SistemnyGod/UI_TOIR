const explicitRevocationMarkers = [
  "mobile session is invalid",
  "session revoked",
  "device revoked",
  "account disabled",
  "refresh session expired",
  "refresh token reuse",
  "device reenrollment required",
  "device session not found",
  "device mismatch",
  "мобильная сессия явно отозвана",
  "это устройство явно отозвано",
  "учётная запись заблокирована",
  "сессия явно отозвана",
  "устройство явно отозвано"
];

const ownerMismatchMarkers = [
  "session owner mismatch",
  "different user",
  "сессия другого пользователя",
  "другого пользователя",
  "авторизация сброшена"
];

const temporaryAuthRejectionMarkers = [
  "temporarily rejected",
  "временно отклонено",
  "временно не принял"
];

const missingMobileSessionKeyMarkers = [
  "mobile session key is unavailable",
  "\u043a\u043b\u044e\u0447 \u043c\u043e\u0431\u0438\u043b\u044c\u043d\u043e\u0439 \u0441\u0435\u0441\u0441\u0438\u0438 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d"
];

export function isSessionExpiredError(message: string | null | undefined) {
  if (!message) return false;
  const normalized = normalizeMessage(message);
  if (temporaryAuthRejectionMarkers.some((marker) => normalized.includes(marker))) return false;
  return explicitRevocationMarkers.some((marker) => normalized.includes(marker));
}

export function isReauthenticationRequiredError(message: string | null | undefined) {
  if (!message) return false;
  const normalized = normalizeMessage(message);
  if (temporaryAuthRejectionMarkers.some((marker) => normalized.includes(marker))) return false;
  return isSessionExpiredError(message)
    || ownerMismatchMarkers.some((marker) => normalized.includes(marker))
    || missingMobileSessionKeyMarkers.some((marker) => normalized.includes(marker));
}

export function isMobileSessionKeyUnavailableError(message: string | null | undefined) {
  if (!message) return false;
  const normalized = normalizeMessage(message);
  return missingMobileSessionKeyMarkers.some((marker) => normalized.includes(marker));
}

function normalizeMessage(message: string) {
  return message.trim().toLocaleLowerCase("ru-RU");
}