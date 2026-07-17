import assert from "node:assert/strict";
import test from "node:test";

import { getReportDeliveryPresentation } from "../src/features/patrol/reportDeliveryPresentation.ts";

test("retryable report stays saved and offers an explicit retry", () => {
  const view = getReportDeliveryPresentation("retryLater", "Сервер временно недоступен");
  assert.equal(view.action, "retry");
  assert.equal(view.buttonLabel, "Повторить отправку сейчас");
  assert.match(view.detail, /временно недоступен/);
});

test("expired authorization directs the user to sign in without losing the report", () => {
  const view = getReportDeliveryPresentation("retryLater", "Сессия истекла. Войдите повторно.");
  assert.equal(view.action, "signIn");
  assert.match(view.detail, /сохранен на телефоне/);
});

test("explicit re-authentication messages ask for sign-in", () => {
  const view = getReportDeliveryPresentation("retryLater", "Сервер доступен, требуется повторный вход: http://192.168.2.194");
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
