import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { clearApiGetCache } from "../api/client";
import { usePatrolDataSource } from "../hooks/usePatrolDataSource";
import type { PatrolDataDemand } from "../repositories/patrolDataRepository";

afterEach(() => {
  clearApiGetCache();
  vi.unstubAllGlobals();
});

it("does not apply an older screen response after the demanded data changes", async () => {
  let resolveRoutes: ((response: Response) => void) | undefined;
  const fetcher = vi.fn<typeof fetch>((input) => {
    const url = String(input);
    if (url.includes("/routes")) {
      return new Promise<Response>((resolve) => { resolveRoutes = resolve; });
    }
    return Promise.resolve(jsonResponse([employeeDto("employee-current")]));
  });
  vi.stubGlobal("fetch", fetcher);

  const view = render(<Probe demand={{ routes: true }} scope="user-1" />);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  view.rerender(<Probe demand={{ employees: true }} scope="user-1" />);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));

  resolveRoutes?.(jsonResponse([routeDto("route-stale")]));

  await waitFor(() => expect(screen.getByTestId("employees")).toHaveTextContent("employee-current"));
  expect(screen.getByTestId("routes")).toBeEmptyDOMElement();
});

it("clears the previous account response when the session scope changes", async () => {
  let resolveFirst: ((response: Response) => void) | undefined;
  let routeCalls = 0;
  const fetcher = vi.fn<typeof fetch>(() => {
    routeCalls += 1;
    if (routeCalls === 1) return new Promise<Response>((resolve) => { resolveFirst = resolve; });
    return Promise.resolve(jsonResponse([routeDto("route-user-2")]));
  });
  vi.stubGlobal("fetch", fetcher);

  const view = render(<Probe demand={{ routes: true }} scope="user-1" />);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  view.rerender(<Probe demand={{ routes: true }} scope="user-2" />);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));

  resolveFirst?.(jsonResponse([routeDto("route-user-1")]));
  await waitFor(() => expect(screen.getByTestId("routes")).toHaveTextContent("route-user-2"));
  expect(screen.getByTestId("routes")).not.toHaveTextContent("route-user-1");
});

it("renders dashboard data while an unrelated directory is still loading", async () => {
  let resolveRoutes: ((response: Response) => void) | undefined;
  const fetcher = vi.fn<typeof fetch>((input) => {
    const url = String(input);
    if (url.includes("/dashboards/summary")) return Promise.resolve(jsonResponse(dashboardSummary()));
    if (url.includes("/dashboards/active-patrols")) return Promise.resolve(jsonResponse([]));
    return new Promise<Response>((resolve) => { resolveRoutes = resolve; });
  });
  vi.stubGlobal("fetch", fetcher);

  render(<Probe demand={{ dashboard: true, routes: true }} scope="user-1" />);

  await waitFor(() => expect(screen.getByTestId("metrics")).toHaveTextContent("Активные обходы сейчас"));
  expect(screen.getByTestId("routes")).toBeEmptyDOMElement();
  resolveRoutes?.(jsonResponse([routeDto("route-ready")]));
  await waitFor(() => expect(screen.getByTestId("routes")).toHaveTextContent("route-ready"));
});

function Probe({ demand, scope }: { demand: PatrolDataDemand; scope: string }) {
  const data = usePatrolDataSource("api", { dashboard: true, employees: true, routes: true }, demand, scope);
  return <>
    <output data-testid="employees">{data.snapshot.employees.map((employee) => employee.id).join(",")}</output>
    <output data-testid="metrics">{data.snapshot.dashboardMetrics.map((metric) => metric.label).join(",")}</output>
    <output data-testid="routes">{data.snapshot.routeDirectory.map((route) => route.id).join(",")}</output>
  </>;
}

function dashboardSummary() {
  return {
    activePatrols: 1,
    delayedPatrols: 0,
    issues: 0,
    completedToday: 1,
    shiftCoveragePercent: 100,
    completedPoints: 1,
    totalPoints: 1,
    onlineEmployees: 1,
    totalEmployees: 1,
  };
}

function employeeDto(id: string) {
  return {
    id,
    fullName: "Иванов Иван",
    personnelNo: "001",
    position: "Инспектор",
    department: "Север",
    status: "Активен",
    hasMobileAccount: false,
    lastSeenAt: "2026-09-08T10:00:00Z",
    shift: "День",
  };
}

function routeDto(id: string) {
  return {
    id,
    versionNo: 1,
    name: "Северный маршрут",
    territory: "Север",
    status: "Активен",
    description: "",
    duration: "30 мин",
    distance: "1 км",
    periodicity: "Ежедневно",
    points: [],
  };
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}
