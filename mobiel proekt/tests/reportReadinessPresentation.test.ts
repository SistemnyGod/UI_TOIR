import assert from "node:assert/strict";
import test from "node:test";

import { groupReportProblems } from "../src/features/patrol/reportReadinessPresentation.ts";

test("multiple validation reasons are grouped under one patrol point", () => {
  const groups = groupReportProblems([
    { pointId: "gallery", pointName: "Галерея", orderIndex: 1, reason: "Обязательная метка не заполнена" },
    { pointId: "gallery", pointName: "Галерея", orderIndex: 1, reason: "Для метки требуется фотофиксация" }
  ]);

  assert.deepEqual(groups, [{
    pointId: "gallery",
    pointName: "Галерея",
    orderIndex: 1,
    reasons: ["Обязательная метка не заполнена", "Для метки требуется фотофиксация"]
  }]);
});

test("duplicate validation reasons are shown only once and points keep route order", () => {
  const groups = groupReportProblems([
    { pointId: "second", pointName: "Вторая", orderIndex: 2, reason: "Не заполнена" },
    { pointId: "first", pointName: "Первая", orderIndex: 1, reason: "Не заполнена" },
    { pointId: "first", pointName: "Первая", orderIndex: 1, reason: "Не заполнена" }
  ]);

  assert.deepEqual(groups.map((group) => [group.pointId, group.reasons.length]), [
    ["first", 1],
    ["second", 1]
  ]);
});
