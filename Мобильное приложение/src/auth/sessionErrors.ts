const expiredSessionMarkers = [
  "mobile session is invalid",
  "session expired",
  "refresh token",
  "сессия истекла",
  "сессия не восстановлена",
  "войдите в аккаунт повторно",
  "требуется повторный вход"
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
  "временно отклонил",
  "временно не принял"
];

export function isSessionExpiredError(message: string | null | undefined) {
  if (!message) {
    return false;
  }

  const normalized = normalizeMessage(message);
  if (temporaryAuthRejectionMarkers.some((marker) => normalized.includes(marker))) {
    return false;
  }

  return expiredSessionMarkers.some((marker) => normalized.includes(marker));
}

export function isReauthenticationRequiredError(message: string | null | undefined) {
  if (!message) {
    return false;
  }

  const normalized = normalizeMessage(message);
  if (temporaryAuthRejectionMarkers.some((marker) => normalized.includes(marker))) {
    return false;
  }

  return isSessionExpiredError(message)
    || ownerMismatchMarkers.some((marker) => normalized.includes(marker));
}

function normalizeMessage(message: string) {
  return message.trim().toLocaleLowerCase("ru-RU");
}
