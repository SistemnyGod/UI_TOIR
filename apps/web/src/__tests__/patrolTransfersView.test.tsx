import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PatrolAssignmentTransferDto } from "../api/contracts";
import { PatrolTransfersView } from "../features/patrol/results/PatrolTransfersView";

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../api/client", () => ({
  ApiClient: class {
    get = api.get;
  },
}));

const transfer: PatrolAssignmentTransferDto = {
  id: "transfer-1",
  assignmentId: "assignment-1",
  patrolRequestId: "request-1",
  requestNumber: "PR-0042",
  routeName: "Обход печей",
  fromEmployeeId: "employee-1",
  fromEmployeeName: "Иванов И.И.",
  toEmployeeId: "employee-2",
  toEmployeeName: "Петров П.П.",
  mode: "otherDevice",
  reason: "Конец смены",
  accountLogin: "pechi",
  statusBefore: "В работе",
  statusAfter: "Приостановлено",
  carriedPointCount: 3,
  currentAssignmentStatus: "Приостановлено",
  transferredAtLocal: "2026-10-19T08:00:00Z",
  receivedAt: "2026-10-19T08:01:00Z",
};

afterEach(() => { cleanup(); api.get.mockReset(); });

describe("PatrolTransfersView", () => {
  it("shows who handed the patrol over, to whom and how many points were already filled", async () => {
    api.get.mockResolvedValue([transfer]);
    render(<PatrolTransfersView dataSourceMode="api" />);
    expect(await screen.findByText("Петров П.П.")).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith("/api/v1/patrol-transfers?limit=100", expect.anything());
    expect(screen.getByText("Иванов И.И.")).toBeTruthy();
    expect(screen.getByText("На другой телефон")).toBeTruthy();
    expect(screen.getByText("Конец смены")).toBeTruthy();
    expect(screen.getByText("PR-0042")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("explains an empty journal and the mock mode", async () => {
    api.get.mockResolvedValue([]);
    const view = render(<PatrolTransfersView dataSourceMode="api" />);
    expect(await screen.findByText("Передач обходов пока не было.")).toBeTruthy();
    view.rerender(<PatrolTransfersView dataSourceMode="mock" />);
    expect(screen.getByText("История передач доступна при подключении к серверу.")).toBeTruthy();
  });
});
