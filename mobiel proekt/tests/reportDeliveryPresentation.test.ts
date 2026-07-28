import assert from "node:assert/strict";
import test from "node:test";

import { getReportDeliveryPresentation } from "../src/features/patrol/reportDeliveryPresentation.ts";

test("retryable report stays saved and offers an explicit retry", () => {
  const view = getReportDeliveryPresentation("retryLater", "Сервер временно недоступен");
  assert.equal(view.action, "retry");
  assert.equal(view.buttonLabel, "Проверить отправку");
  assert.match(view.detail, /временно недоступен/);
});

test("temporary authorization failure keeps the report queued", () => {
  const view = getReportDeliveryPresentation("retryLater", "Mobile session is temporarily unavailable");
  assert.equal(view.action, "retry");
  assert.match(view.detail, /temporarily unavailable/);
});

test("explicit revocation asks for sign-in", () => {
  const view = getReportDeliveryPresentation("retryLater", "Session revoked by administrator");
  assert.equal(view.action, "signIn");
});

test("a session reset for another account asks to sign in", () => {
  const view = getReportDeliveryPresentation("retryLater", "Сервер вернул сессию другого пользователя. Авторизация сброшена.");
  assert.equal(view.action, "signIn");
});

test("sending report waits for its current request", () => {
  const view = getReportDeliveryPresentation({ status: "sending", clientOperationId: "operation-1" });
  assert.equal(view.action, "wait");
  assert.equal(view.buttonLabel, "Отправка уже выполняется");
});

test("a permanent rejection asks for correction instead of blind retry", () => {
  assert.equal(getReportDeliveryPresentation("rejected", "Неверная точка").action, "repair");
  assert.equal(getReportDeliveryPresentation("conflict", null).action, "repair");
});

test("accepted and duplicate responses are terminal success", () => {
  assert.equal(getReportDeliveryPresentation("accepted", null).action, "done");
  assert.equal(getReportDeliveryPresentation("duplicate", null).action, "done");
});

test("a conflicting point blocks the complete report delivery state", () => {
  const view = getReportDeliveryPresentation({
    status: "conflict",
    blockingOperationId: "point-operation",
    blockingCommandType: "markPatrolPointIssue",
    lastError: "Состояние точки изменилось на сервере."
  });
  assert.equal(view.action, "repair");
  assert.equal(view.title, "Отправка отчёта остановлена");
  assert.doesNotMatch(view.detail, /автоматически отправ/i);
});
