export function isSessionExpiredError(message: string | null | undefined) {
  if (!message) {
    return false;
  }

  const normalized = message.toLocaleLowerCase("ru-RU");
  return normalized.includes("mobile session is invalid")
    || normalized.includes("сессия истекла");
}

export function isReauthenticationRequiredError(message: string | null | undefined) {
  if (!message) {
    return false;
  }

  const normalized = message.toLocaleLowerCase("ru-RU");
  return isSessionExpiredError(message)
    || normalized.includes("сессию другого пользователя")
    || normalized.includes("авторизация сброшена");
}
