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
  return isSessionExpiredError(message) || ownerMismatchMarkers.some((marker) => normalized.includes(marker));
}

function normalizeMessage(message: string) {
  return message.trim().toLocaleLowerCase("ru-RU");
}