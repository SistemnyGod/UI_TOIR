import type { ZodType } from "zod";

export class MobileApiProtocolError extends Error {
  readonly code = "P360-API-PROTOCOL";

  constructor(message = "Сервер вернул несовместимый ответ API. Локальные данные сохранены.") {
    super(message);
    this.name = "MobileApiProtocolError";
  }
}

export function parseMobileResponse<TResponse>(schema: ZodType<TResponse>, value: unknown): TResponse {
  try {
    return schema.parse(value);
  } catch {
    throw new MobileApiProtocolError("Ответ сервера не соответствует версии мобильного API. Локальные данные сохранены.");
  }
}