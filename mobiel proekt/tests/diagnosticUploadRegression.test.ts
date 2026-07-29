import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const serviceSource = readFileSync(
  new URL("../src/services/diagnosticReportService.ts", import.meta.url),
  "utf8"
);
const screenSource = readFileSync(
  new URL("../src/features/settings/DiagnosticsSettingsScreen.tsx", import.meta.url),
  "utf8"
);

test("manual diagnostics wait for an active background upload and then run forced", () => {
  assert.match(serviceSource, /triggerManualDiagnosticReportUpload\(\)[\s\S]*scheduleDiagnosticUpload\("manual"/);
  assert.match(serviceSource, /const previousUpload = activeUpload;[\s\S]*await previousUpload\.catch/);
  assert.match(serviceSource, /kind !== "manual" \|\| activeUploadKind === "manual"/);
  assert.match(serviceSource, /force: true, includeEmpty: true, respectAutomaticSetting: false/);
});

test("diagnostic preparation failures become visible results", () => {
  assert.match(serviceSource, /try \{[\s\S]*return await upload\(\);[\s\S]*catch \(error\)[\s\S]*status: "failed"/);
  assert.match(screenSource, /catch \(caught\)[\s\S]*Не удалось отправить отчёт/);
  assert.match(screenSource, /case "unauthenticated":[\s\S]*Нужно войти в приложение/);
  assert.match(screenSource, /case "queued":[\s\S]*будет отправлен автоматически/);
});