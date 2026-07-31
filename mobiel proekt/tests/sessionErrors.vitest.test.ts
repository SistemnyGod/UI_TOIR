import { describe, expect, it } from "vitest";

import { isReauthenticationRequiredError, isSessionExpiredError } from "@/auth/sessionErrors";

describe("классификация ошибок мобильной сессии", () => {
  it("требует подтверждение входа при утрате refresh, не считая это временной сетью", () => {
    expect(isReauthenticationRequiredError("Для серверной синхронизации требуется повторный вход (refresh_expired)."))
      .toBe(true);
    expect(isSessionExpiredError("Для серверной синхронизации требуется повторный вход (refresh_expired)."))
      .toBe(false);
  });

  it("не завершает локальную сессию при временном отказе сервера", () => {
    expect(isReauthenticationRequiredError("Обновление мобильной сессии временно отклонено."))
      .toBe(false);
  });

  it("распознаёт только явный отзыв как завершение сессии", () => {
    expect(isSessionExpiredError("Мобильная сессия явно отозвана. Локальные отчёты сохранены."))
      .toBe(true);
  });
});