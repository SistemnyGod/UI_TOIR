import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const screenSource = readFileSync(
  new URL("../src/features/settings/DiagnosticsSettingsScreen.tsx", import.meta.url),
  "utf8"
);

// Queueing a manual upload behind an active one, forcing it, and turning preparation
// errors into a "failed" result are behavior-tested in diagnosticUploadQueue.vitest.test.ts.
test("diagnostic upload results are shown to the user", () => {
  assert.match(screenSource, /catch \(caught\)[\s\S]*Не удалось отправить отчёт/);
  assert.match(screenSource, /case "unauthenticated":[\s\S]*Нужно войти в приложение/);
  assert.match(screenSource, /case "queued":[\s\S]*будет отправлен автоматически/);
});
