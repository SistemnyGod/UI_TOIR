import assert from "node:assert/strict";
import test from "node:test";

import {
  diagnosticReportIntervalMs,
  isDailyDiagnosticReportDue,
  sanitizeDiagnosticMessage
} from "../src/services/diagnosticReportPolicy.ts";

test("daily diagnostics are not generated more than once per 24 hours", () => {
  const periodStart = new Date("2026-07-15T00:00:00.000Z");
  assert.equal(isDailyDiagnosticReportDue(periodStart, new Date(periodStart.getTime() + diagnosticReportIntervalMs - 1)), false);
  assert.equal(isDailyDiagnosticReportDue(periodStart, new Date(periodStart.getTime() + diagnosticReportIntervalMs)), true);
});

test("diagnostic messages redact authorization secrets and stay brief", () => {
  const jwt = `${"a".repeat(24)}.${"b".repeat(24)}.${"c".repeat(24)}`;
  const sanitized = sanitizeDiagnosticMessage(`Bearer secret-token request failed ${jwt} ${"x".repeat(600)}`);
  assert.doesNotMatch(sanitized, /secret-token/);
  assert.doesNotMatch(sanitized, new RegExp(jwt.replaceAll(".", "\\.")));
  assert.ok(sanitized.length <= 500);
});

test("diagnostic messages redact opaque credentials and URL secrets", () => {
  const opaqueToken = "opaque-refresh-token-value-123456789";
  const password = "NeverLogThisPassword";
  const sanitized = sanitizeDiagnosticMessage(
    `refreshToken=${opaqueToken} password: ${password} https://user:pass@example.test/path?api_key=top-secret`
  );

  assert.doesNotMatch(sanitized, new RegExp(opaqueToken));
  assert.doesNotMatch(sanitized, new RegExp(password));
  assert.doesNotMatch(sanitized, /user:pass/);
  assert.doesNotMatch(sanitized, /top-secret/);
  assert.match(sanitized, /\[redacted]/);
});
