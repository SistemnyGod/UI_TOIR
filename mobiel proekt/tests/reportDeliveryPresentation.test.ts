import assert from "node:assert/strict";
import test from "node:test";

import { getReportDeliveryPresentation } from "../src/features/patrol/reportDeliveryPresentation.ts";

test("retryable report stays saved and offers an explicit retry", () => {
  const view = getReportDeliveryPresentation("retryLater", "Сервер временно недоступен");
  assert.equal(view.action, "retry");
  assert.equal(view.buttonLabel, "Повторить отправку сейчас");
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

test("sending report can be checked and retried manually", () => {
  const view = getReportDeliveryPresentation("sending", null);
  assert.equal(view.action, "retry");
  assert.equal(view.buttonLabel, "Проверить и повторить");
});

test("a permanent rejection asks for correction instead of blind retry", () => {
  assert.equal(getReportDeliveryPresentation("rejected", "Неверная точка").action, "resubmit");
  assert.equal(getReportDeliveryPresentation("conflict", null).action, "repair");
});

test("accepted and duplicate responses are terminal success", () => {
  assert.equal(getReportDeliveryPresentation("accepted", null).action, "done");
  assert.equal(getReportDeliveryPresentation("duplicate", null).action, "done");
});
