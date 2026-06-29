import { describe, expect, it } from "vitest";
import type { EmuFavoriteEmployeeDto, EmuWorkSessionDto } from "../api/contracts";
import {
  buildEmuEmployeeWorkload,
  buildEmuHistoryCsv,
  filterEmuEmployeeWorkload,
  filterEmuWorkBySection,
  groupEmuWorkBySection,
  normalizeEmuText,
  sortEmuHistoryRows,
} from "../domain/emuWorkBoard";

describe("EMU work board helpers", () => {
  it("normalizes EMU text without leaking mojibake", () => {
    expect(normalizeEmuText(" Работает ")).toBe("Работает");
    expect(normalizeEmuText("В работе")).toBe("Работает");
    expect(normalizeEmuText("Пауза")).toBe("На паузе");
    expect(normalizeEmuText("Ожидание")).toBe("В ожидании");
    expect(normalizeEmuText("На другой работе")).toBe("На другой работе");
    expect(normalizeEmuText("Завершено")).toBe("Завершено");
    expect(normalizeEmuText("Выполнено")).toBe("Выполнено");
    expect(normalizeEmuText("Не выполнено")).toBe("Не выполнено");
    expect(normalizeEmuText("Частично выполнено")).toBe("Частично выполнено");
    expect(normalizeEmuText("Прочее")).toBe("Прочее");
    expect(normalizeEmuText("\u0420\u045F\u0421\u0402\u0420\u0455\u0421\u2021\u0420\u00B5\u0420\u00B5")).toBe("");
    expect(normalizeEmuText("\u00D0\u009F\u00D1\u0080\u00D0\u00BE\u00D1\u0087\u00D0\u00B5\u00D0\u00B5")).toBe("");
  });

  it("calculates employee workload states", () => {
    const rows = buildEmuEmployeeWorkload(
      [favorite("emp-free", "Свободный"), favorite("emp-work", "Рабочий"), favorite("emp-wait", "Ожидание"), favorite("emp-conflict", "Конфликт")],
      [
        work("work-1", { employees: [participant("emp-work", "Работает"), participant("emp-conflict", "Работает")] }),
        work("work-2", { employees: [participant("emp-wait", "В ожидании")] }),
        work("work-3", { employees: [participant("emp-conflict", "Работает")] }),
      ],
    );

    expect(Object.fromEntries(rows.map((row) => [row.employeeId, row.status]))).toMatchObject({
      "emp-conflict": "conflict",
      "emp-free": "free",
      "emp-wait": "waiting",
      "emp-work": "working",
    });
  });

  it("filters workload by query, status and section", () => {
    const rows = buildEmuEmployeeWorkload(
      [favorite("emp-1", "Авдеев Андрей"), favorite("emp-2", "Азанов Илья")],
      [work("work-1", { sectionId: "section-a", sectionName: "КИП", employees: [participant("emp-1", "Работает")] })],
      [],
      "section-a",
    );

    expect(filterEmuEmployeeWorkload(rows, "Авдеев", "working").map((row) => row.employeeId)).toEqual(["emp-1"]);
    expect(filterEmuEmployeeWorkload(rows, "", "free").map((row) => row.employeeId)).toEqual(["emp-2"]);
  });

  it("filters and groups cards by section", () => {
    const rows = [
      work("work-b", { sectionId: "b", sectionName: "Энергетика", createdAt: "2026-06-01T08:00:00.000Z" }),
      work("work-a", { sectionId: "a", sectionName: "КИП", createdAt: "2026-06-01T07:00:00.000Z" }),
    ];

    expect(filterEmuWorkBySection(rows, "a").map((row) => row.id)).toEqual(["work-a"]);
    expect(groupEmuWorkBySection(rows).map((group) => group.sectionName)).toEqual(["КИП", "Энергетика"]);
  });

  it("sorts history by selected field", () => {
    const rows = [
      work("a", { sectionName: "Энергетика", completedAt: "2026-06-01T10:00:00.000Z", waitingMinutes: 5, workMinutes: 20 }),
      work("b", { sectionName: "КИП", completedAt: "2026-06-01T12:00:00.000Z", waitingMinutes: 30, workMinutes: 10 }),
    ];

    expect(sortEmuHistoryRows(rows, "date").map((row) => row.id)).toEqual(["b", "a"]);
    expect(sortEmuHistoryRows(rows, "waiting").map((row) => row.id)).toEqual(["b", "a"]);
    expect(sortEmuHistoryRows(rows, "section").map((row) => row.id)).toEqual(["b", "a"]);
  });

  it("builds a semicolon CSV export for history rows", () => {
    const csv = buildEmuHistoryCsv([
      work("csv-1", {
        resultComment: "Проверено; требуется повтор",
        resultStatus: "Выполнено",
        workMinutes: 12,
        waitingMinutes: 3,
      }),
    ]);

    expect(csv).toContain("Дата;Номер;Участок");
    expect(csv).toContain("csv-1");
    expect(csv).toContain('"Проверено; требуется повтор"');
    expect(csv).toContain(";12;3;0;15;");
    expect(csv).not.toContain("\u0420\u045F");
    expect(csv).not.toContain("\u00D0");
  });
});

function favorite(employeeId: string, fullName: string): EmuFavoriteEmployeeDto {
  return {
    createdAt: "2026-06-01T07:00:00.000Z",
    department: "ЭМУ",
    employeeId,
    fullName,
    id: `fav-${employeeId}`,
    isActive: true,
    personnelNo: employeeId,
    position: "Слесарь",
    status: "Активен",
  };
}

function participant(employeeId: string, status: string): EmuWorkSessionDto["employees"][number] {
  return {
    arrivedAt: "2026-06-01T07:00:00.000Z",
    employeeId,
    finishedAt: null,
    fullNameSnapshot: employeeId,
    id: `part-${employeeId}`,
    otherWorkMinutes: 0,
    positionSnapshot: "Слесарь",
    status,
    waitingMinutes: 0,
    workMinutes: 0,
  };
}

function work(id: string, overrides: Partial<EmuWorkSessionDto> = {}): EmuWorkSessionDto {
  return {
    arrivedAt: "2026-06-01T07:00:00.000Z",
    completedAt: null,
    createdAt: "2026-06-01T07:00:00.000Z",
    deletedAt: null,
    deleteReason: "",
    employees: [participant("emp-1", "Работает")],
    id,
    isCarriedOver: false,
    operationalStatus: "В работе",
    otherWorkMinutes: 0,
    planTaskId: null,
    resultComment: "",
    resultStatus: "",
    rowVersion: 1,
    sectionId: "section-a",
    sectionName: "КИП",
    status: "В работе",
    taskDescription: "Проверка",
    updatedAt: "2026-06-01T07:00:00.000Z",
    waitingMinutes: 0,
    workDate: "2026-06-01",
    workMinutes: 0,
    workNumber: id,
    ...overrides,
  };
}
