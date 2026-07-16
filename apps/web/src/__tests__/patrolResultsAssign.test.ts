import { afterEach, describe, expect, it, vi } from "vitest";
import { createAssignmentHistoryEvents, formatAssignmentActionTime } from "../features/patrol/assignments/assignmentDateUtils";
import { assignmentStatusText, isAssignmentCurrent } from "../features/patrol/assignments/assignmentUtils";
import { buildCounters, buildMetrics, buildResultApiFilters, buildResultGroups, filterGroups, summarizeDuration } from "../features/patrol/results/ResultsWorkspace";
import { selectScheduleResultHistory } from "../features/patrol/ScheduleScreen";
import { isImageAttachment, isVideoAttachment } from "../features/patrol/results/ResultMediaViewer";
import { applyLocalAssignmentCommand } from "../hooks/useAssignmentsWorkspace";
import type { ActivePatrol, PatrolResult, PatrolResultAttachment, ScheduleCell } from "../types";

afterEach(() => {
  vi.useRealTimers();
});

describe("patrol results and assignment stabilization", () => {
  it("keeps same-day schedule history authoritative and bounds recent fallback", () => {
    const selected = {
      id: "cell-1",
      employee: "Employee A",
      employeeId: "employee-a",
      route: "Route A",
      routeId: "route-a",
      date: "2026-07-15",
      day: "15",
      shift: "Дневная",
      state: "empty",
      zone: "Zone",
    } as ScheduleCell;
    const sameDay = createResult("same-day", { actualAt: "2026-07-15T08:00:00Z", employeeId: "other", routeId: "other" });
    const authoritative = selectScheduleResultHistory([sameDay], selected);
    expect(authoritative).toMatchObject({ mode: "day", results: [{ id: "same-day" }] });

    const recent = Array.from({ length: 12 }, (_, index) =>
      createResult(`recent-${index}`, {
        actualAt: `2026-07-${String(14 - index).padStart(2, "0")}T08:00:00Z`,
        employee: index === 0 ? "Employee B" : "Employee A",
        employeeId: index === 0 ? "employee-b" : "employee-a",
        route: "Route A",
        routeId: "route-a",
      }),
    );
    const old = createResult("old", { actualAt: "2026-03-01T08:00:00Z", employeeId: "employee-a", routeId: "route-a" });
    const fallback = selectScheduleResultHistory([...recent, old], selected);

    expect(fallback.mode).toBe("recent");
    expect(fallback.results).toHaveLength(10);
    expect(fallback.results[0].id).toBe("recent-1");
    expect(fallback.results.map((result) => result.id)).not.toContain("old");
  });

  it("maps both photo filters to the results API", () => {
    expect(buildResultApiFilters("photos", "all", "")).toMatchObject({ hasPhotos: true });
    expect(buildResultApiFilters("noPhotos", "all", "")).toMatchObject({ hasPhotos: false });
  });

  it("filters late result groups by normalized status and deviation", () => {
    const groups = buildResultGroups([
      createResult("late-status", { assignmentId: "assignment-late", deviation: "+12 мин", status: "Просрочено" }),
      createResult("ok", { assignmentId: "assignment-ok", actualAt: "2026-06-29T08:03:00Z", deviation: "-2 мин", status: "Подтверждено" }),
    ]);

    expect(buildCounters(groups).late).toBe(1);
    expect(filterGroups(groups, "late", "")).toHaveLength(1);
    expect(filterGroups(groups, "late", "")[0].id).toBe("assignment-late");
    expect(filterGroups(groups, "late", "")[0].plannedAt).toBe("2026-06-29T08:00:00Z");
  });

  it("keeps duration empty when actual start or finish is absent", () => {
    expect(summarizeDuration("29.06.2026, 08:00", undefined).label).toBe("нет данных");
    expect(summarizeDuration(undefined, "29.06.2026, 09:00").label).toBe("нет данных");
    expect(summarizeDuration("29.06.2026, 08:00", "29.06.2026, 09:30").label).toBe("1 ч 30 мин");
    expect(summarizeDuration("29.06.2026, 08:00", "29.06.2026, 08:00").tone).toBe("warning");
    expect(summarizeDuration("29.06.2026, 08:00", "29.06.2026, 21:00").tone).toBe("warning");
  });

  it("reports the duration sample size and excluded outliers", () => {
    const groups = buildResultGroups([
      createResult("valid", { assignmentId: "assignment-valid", actualAt: "29.06.2026, 09:30", startedAt: "29.06.2026, 08:00", finishedAt: "29.06.2026, 09:30" }),
      createResult("outlier", { assignmentId: "assignment-outlier", actualAt: "29.06.2026, 21:00", startedAt: "29.06.2026, 08:00", finishedAt: "29.06.2026, 21:00" }),
    ]);

    expect(buildMetrics(groups)).toEqual(expect.objectContaining({
      averageDuration: "1 ч 30 мин",
      durationQualityLabel: "1 из 2; исключено 1",
      excludedDurations: 1,
      validDurationCount: 1,
    }));
  });

  it("detects image and video attachments without treating unknown files as previewable media", () => {
    expect(isImageAttachment(createAttachment("photo.jpg", "application/octet-stream"))).toBe(true);
    expect(isVideoAttachment(createAttachment("clip.webm", "application/octet-stream"))).toBe(true);
    expect(isImageAttachment(createAttachment("report.pdf", "application/pdf"))).toBe(false);
    expect(isVideoAttachment(createAttachment("report.pdf", "application/pdf"))).toBe(false);
  });

  it("separates assignment plan, actual start, finish, and cancel states", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-29T08:10:00Z"));

    const planned = createAssignment();
    const started = applyLocalAssignmentCommand(planned, "start");
    const completed = applyLocalAssignmentCommand(started, "complete", { actualAt: "2026-06-29T09:25:00Z" });
    const cancelled = applyLocalAssignmentCommand(planned, "cancel");

    expect(started.plannedAtIso).toBe(planned.plannedAtIso);
    expect(started.startedAtIso).toBe("2026-06-29T08:10:00.000Z");
    expect(formatAssignmentActionTime(started)).toContain("Начато:");
    expect(completed.finishedAtIso).toBe("2026-06-29T09:25:00Z");
    expect(formatAssignmentActionTime(completed)).toContain("Завершено:");
    expect(assignmentStatusText(cancelled.status)).toBe("Отменено");
    expect(isAssignmentCurrent(cancelled)).toBe(false);
    expect(createAssignmentHistoryEvents(cancelled)[0].title).toBe("Назначение отменено");
  });
});

function createResult(id: string, patch: Partial<PatrolResult> = {}): PatrolResult {
  return {
    id,
    actualAt: "2026-06-29T08:12:00Z",
    assignmentId: "assignment-1",
    chronology: [],
    comment: "без комментария",
    deviation: "+12 мин",
    employee: "Иванов Иван",
    employeeId: "employee-1",
    issueType: "нет",
    photos: 0,
    plannedAt: "2026-06-29T08:00:00Z",
    point: "КПП-1",
    pointId: "point-1",
    route: "Периметр",
    routeId: "route-1",
    severity: "-",
    shift: "День",
    status: "Подтверждено",
    territory: "Север",
    ...patch,
  };
}

function createAttachment(fileName: string, contentType: string): PatrolResultAttachment {
  return {
    id: fileName,
    contentType,
    createdAt: "2026-06-29T08:00:00Z",
    downloadUrl: `/files/${fileName}`,
    fileName,
    sizeBytes: 1024,
  };
}

function createAssignment(): ActivePatrol {
  return {
    id: "assignment-1",
    currentPoint: "ожидает старта",
    deviation: "-",
    employee: "Иванов Иван",
    employeeId: "employee-1",
    eta: "29.06.2026, 08:00",
    plannedAt: "29.06.2026, 08:00",
    plannedAtIso: "2026-06-29T08:00:00Z",
    progress: 0,
    route: "Периметр",
    routeId: "route-1",
    shift: "День",
    status: "Ожидает",
    zone: "Север",
  };
}
