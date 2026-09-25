import { describe, expect, it } from "vitest";
import { ApiError } from "../api/client";
import { ppeErrorMessage } from "../features/inventory/ppe/ppeErrors";

describe("PPE operation errors", () => {
  it("shows the actionable converter reason instead of the generic validation title", () => {
    const message = "Конвертер PDF недоступен. DOCX можно скачать сразу; PDF повторите позже.";
    const error = new ApiError("One or more validation errors occurred.", 400, { problem: { errors: { "pdf.retryable": [message] } } });
    expect(ppeErrorMessage(error, "Ошибка печати")).toBe(message);
  });
  it("keeps network and non-error fallbacks readable", () => {
    expect(ppeErrorMessage(new Error("Соединение потеряно"), "Ошибка")).toBe("Соединение потеряно");
    expect(ppeErrorMessage(null, "Не удалось сохранить документ")).toBe("Не удалось сохранить документ");
  });
});
