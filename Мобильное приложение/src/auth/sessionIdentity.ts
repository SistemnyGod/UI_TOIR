export function assertSessionOwner(expectedOwnerUserId: string | null, actualOwnerUserId: string | undefined) {
  if (!actualOwnerUserId || (expectedOwnerUserId && actualOwnerUserId !== expectedOwnerUserId)) {
    throw new Error("Сервер вернул сессию другого пользователя. Авторизация сброшена, локальные данные сохранены.");
  }
}
