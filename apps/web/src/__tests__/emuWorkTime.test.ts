import { describe, expect, it } from "vitest";
import type { EmuWorkSessionDto } from "../api/contracts";
import { calculateLiveWorkSessionMinutes } from "../domain/emuWorkTime";

describe("EMU live work time", () => {
  it("counts active work from arrival to current time", () => {
    const work = createWork({
      employees: [
        createEmployee({
          arrivedAt: "2026-05-26T06:00:00.000Z",
          workMinutes: 5,
        }),
      ],
    });

    const result = calculateLiveWorkSessionMinutes(work, new Date("2026-05-26T06:20:00.000Z"));

    expect(result.workMinutes).toBe(20);
    expect(result.waitingMinutes).toBe(0);
    expect(result.otherWorkMinutes).toBe(0);
  });

  it("keeps stored work time and grows waiting time during pause", () => {
    const work = createWork({
      employees: [
        createEmployee({
          arrivedAt: "2026-05-26T06:00:00.000Z",
          status: "В ожидании",
          waitingMinutes: 3,
          workMinutes: 12,
        }),
      ],
    });

    const result = calculateLiveWorkSessionMinutes(work, new Date("2026-05-26T06:20:00.000Z"));

    expect(result.workMinutes).toBe(12);
    expect(result.waitingMinutes).toBe(8);
  });

  it("uses participation status over legacy employee status for live pause time", () => {
    const work = createWork({
      employees: [
        createEmployee({
          arrivedAt: "2026-05-26T06:00:00.000Z",
          participationStatus: "В ожидании",
          status: "Работает",
          waitingMinutes: 3,
          workMinutes: 12,
        }),
      ],
    });

    const result = calculateLiveWorkSessionMinutes(work, new Date("2026-05-26T06:20:00.000Z"));

    expect(result.workMinutes).toBe(12);
    expect(result.waitingMinutes).toBe(8);
    expect(result.employeesById.get("employee-1")?.personalPauseMinutes).toBe(8);
  });

  it("adds live pause minutes to other work when employee is assigned elsewhere", () => {
    const work = createWork({
      employees: [
        createEmployee({
          arrivedAt: "2026-05-26T06:00:00.000Z",
          otherWorkMinutes: 2,
          status: "На другой работе",
          workMinutes: 10,
        }),
      ],
    });

    const result = calculateLiveWorkSessionMinutes(work, new Date("2026-05-26T06:18:00.000Z"));

    expect(result.workMinutes).toBe(10);
    expect(result.otherWorkMinutes).toBe(8);
  });

  it("uses stored values for finished work", () => {
    const work = createWork({
      completedAt: "2026-05-26T06:30:00.000Z",
      employees: [
        createEmployee({
          finishedAt: "2026-05-26T06:30:00.000Z",
          waitingMinutes: 4,
          workMinutes: 22,
        }),
      ],
      waitingMinutes: 4,
      workMinutes: 22,
    });

    const result = calculateLiveWorkSessionMinutes(work, new Date("2026-05-26T07:00:00.000Z"));

    expect(result.workMinutes).toBe(22);
    expect(result.waitingMinutes).toBe(4);
  });

  it("counts session time by merged employee intervals and keeps personal minutes separately", () => {
    const work = createWork({
      employees: [
        createEmployee({
          employeeId: "employee-1",
          intervals: [
            createInterval("interval-1", "participant-1", "employee-1", "Работает", "2026-05-26T06:00:00.000Z", "2026-05-26T06:10:00.000Z"),
          ],
        }),
        createEmployee({
          employeeId: "employee-2",
          id: "participant-2",
          intervals: [
            createInterval("interval-2", "participant-2", "employee-2", "Работает", "2026-05-26T06:00:00.000Z", "2026-05-26T06:10:00.000Z"),
          ],
        }),
      ],
    });

    const result = calculateLiveWorkSessionMinutes(work, new Date("2026-05-26T06:20:00.000Z"));

    expect(result.workMinutes).toBe(10);
    expect(result.employeesById.get("employee-1")?.personalWorkMinutes).toBe(10);
    expect(result.employeesById.get("employee-2")?.personalWorkMinutes).toBe(10);
  });
});

function createWork(overrides: Partial<EmuWorkSessionDto> = {}): EmuWorkSessionDto {
  return {
    arrivedAt: "2026-05-26T06:00:00.000Z",
    completedAt: null,
    createdAt: "2026-05-26T06:00:00.000Z",
    deletedAt: null,
    deleteReason: "",
    employees: [createEmployee()],
    id: "work-1",
    isCarriedOver: false,
    operationalStatus: "В работе",
    otherWorkMinutes: 0,
    planTaskId: null,
    resultComment: "",
    resultStatus: "",
    rowVersion: 1,
    sectionId: "section-1",
    sectionName: "Прочее",
    status: "В работе",
    taskDescription: "Проверка",
    updatedAt: "2026-05-26T06:00:00.000Z",
    waitingMinutes: 0,
    workDate: "2026-05-26",
    workMinutes: 0,
    workNumber: "EMU-1",
    ...overrides,
  };
}

function createEmployee(overrides: Partial<EmuWorkSessionDto["employees"][number]> = {}): EmuWorkSessionDto["employees"][number] {
  return {
    arrivedAt: "2026-05-26T06:00:00.000Z",
    employeeId: "employee-1",
    finishedAt: null,
    fullNameSnapshot: "Иванов Иван Иванович",
    id: "participant-1",
    otherWorkMinutes: 0,
    positionSnapshot: "Слесарь",
    status: "Работает",
    waitingMinutes: 0,
    workMinutes: 0,
    ...overrides,
  };
}

function createInterval(
  id: string,
  workSessionEmployeeId: string,
  employeeId: string,
  status: string,
  startedAt: string,
  endedAt: string | null,
): NonNullable<EmuWorkSessionDto["employees"][number]["intervals"]>[number] {
  return {
    createdAt: startedAt,
    createdByName: "test",
    employeeId,
    endedAt,
    id,
    reason: "",
    startedAt,
    status,
    workSessionEmployeeId,
    workSessionId: "work-1",
  };
}
