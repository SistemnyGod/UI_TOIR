import assert from "node:assert/strict";
import test from "node:test";
import { pointSubmissionError } from "../src/domain/patrol/patrolRules.ts";

test("an OK point can be saved without a photo", () => {
  assert.equal(pointSubmissionError("ok", "", true, false), null);
});
test("issue and skipped results require a comment while photos remain voluntary", () => {
  for (const status of ["issue", "skipped"] as const) {
    assert.match(pointSubmissionError(status, " ", true, true)!, /результат осмотра/);
    assert.equal(pointSubmissionError(status, "Описание", true, false), null);
    assert.equal(pointSubmissionError(status, "Описание", true, true), null);
    assert.equal(pointSubmissionError(status, "Описание", false, false), null);
  }
});
test("a result cannot be saved before the user selects its status", () => {
  assert.match(pointSubmissionError(null, "", false, false)!, /Выберите результат/);
});
