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
