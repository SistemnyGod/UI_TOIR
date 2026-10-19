import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MobileDeviceHealthDto, PatrolLateReportDto } from "../api/contracts";
import { LateReportsView, formatAge } from "../features/patrol/results/LateReportsView";
import { ReportDeliveryBadges } from "../features/patrol/results/ReportDeliveryBadges";
import type { PatrolResult } from "../types";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../api/client", () => ({
  ApiClient: class {
    get = api.get;
    post = api.post;
  },
}));

const lateReport: PatrolLateReportDto = {
  id: "late-1",
  assignmentId: "assignment-1",
  requestId: "request-1",
  routeName: "Обход печей",
  employeeName: "Иванов И.И.",
  accountLogin: "pechi",
  reasonCode: "assignmentCancelled",
  assignmentStatusAtReceipt: "Отменено",
  currentAssignmentStatus: "Отменено",
  submissionMode: "auto",
  completedAtLocal: "2026-10-19T08:00:00Z",
  receivedAt: "2026-10-19T09:00:00Z",
  status: "pending",
  pointCount: 4,
  issueCount: 1,
  photoCount: 2,
  pendingPhotoCount: 1,
  canApply: true,
  resolutionComment: "",
};

const stuckPhone: MobileDeviceHealthDto = {
  mobileAccountId: "account-1",
  login: "pechi",
  deviceName: "Pixel",
  appVersion: "0.1.52",
  pushStatus: "registered",
  pendingOutboxCount: 0,
  staleOutboxCount: 0,
  heartbeatAt: "2026-10-19T09:05:00Z",
  heartbeatPendingCount: 3,
  heartbeatFailedCount: 1,
  heartbeatOldestPendingAgeSeconds: 2 * 60 * 60,
};

beforeEach(() => {
  api.get.mockImplementation((path: string) => Promise.resolve(path.startsWith("/api/v1/patrol-late-reports") ? [lateReport] : [stuckPhone]));
  api.post.mockResolvedValue({ ...lateReport, status: "applied" });
});
afterEach(() => { cleanup(); api.get.mockReset(); api.post.mockReset(); });

describe("LateReportsView", () => {
  it("lists pending late reports and phones with unsent commands", async () => {
    render(<LateReportsView dataSourceMode="api" />);
    expect(await screen.findByText("Обход печей · Иванов И.И.")).toBeTruthy();
    expect(screen.getByText(/Обход отменён диспетчером/)).toBeTruthy();
    expect(screen.getByText(/отправлен автоматически/)).toBeTruthy();
    expect(screen.getByText(/ещё не загружено: 1/)).toBeTruthy();
    expect(screen.getByText("2 ч 0 мин")).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith("/api/v1/patrol-late-reports?status=pending&limit=100", expect.anything());
  });

  it("applies a late report with the dispatcher comment", async () => {
    render(<LateReportsView dataSourceMode="api" />);
    await screen.findByText("Обход печей · Иванов И.И.");
    fireEvent.change(screen.getByLabelText("Комментарий к позднему отчёту Обход печей"), { target: { value: "Связь была потеряна" } });
    fireEvent.click(screen.getByRole("button", { name: "Принять отчёт и закрыть обход" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/v1/patrol-late-reports/late-1/resolution", { decision: "apply", comment: "Связь была потеряна" }));
  });

  it("only allows dismissal when the assignment already has a report", async () => {
    api.get.mockImplementation((path: string) => Promise.resolve(path.startsWith("/api/v1/patrol-late-reports") ? [{ ...lateReport, canApply: false }] : []));
    render(<LateReportsView dataSourceMode="api" />);
    await screen.findByText("Обход печей · Иванов И.И.");
    expect((screen.getByRole("button", { name: "Принять отчёт и закрыть обход" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Отклонить" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("formats queue ages", () => {
    expect(formatAge(null)).toBe("—");
    expect(formatAge(45)).toBe("45 с");
    expect(formatAge(5 * 60)).toBe("5 мин");
    expect(formatAge(3 * 24 * 3600)).toBe("3 дн");
  });
});

describe("ReportDeliveryBadges", () => {
  const base = { id: "r", point: "P", pointId: "p", employee: "E", employeeId: "e", route: "R", territory: "T", shift: "День", plannedAt: "", actualAt: "", deviation: "", comment: "", photos: 0, issueType: "-", severity: "-", chronology: [], status: "Подтверждено" } satisfies PatrolResult;

  it("shows auto-sent, late and pending photo markers", () => {
    render(<div><ReportDeliveryBadges results={[{ ...base, submissionMode: "auto", pendingPhotos: 2 }, { ...base, id: "r2", lateReport: true, pendingPhotos: 1 }]} /></div>);
    expect(screen.getByText("автоматически")).toBeTruthy();
    expect(screen.getByText("отчёт")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("renders nothing for an ordinary report", () => {
    const { container } = render(<div><ReportDeliveryBadges results={[base]} /></div>);
    expect(container.textContent).toBe("");
  });
});
