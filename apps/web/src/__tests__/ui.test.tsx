import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileAccountCreateDrawer, MobileAccountEditPanel, MobileAccountLinkPanel } from "../components/accounts/MobileAccountCreateDrawer";
import { MobileAccountListPanel } from "../components/accounts/MobileAccountListPanel";
import { MobileAccountSecurityPanels } from "../components/accounts/MobileAccountSecurityPanels";
import { DashboardRequestsPanel } from "../components/dashboard/DashboardRequestsPanel";
import { RequestCreateModal } from "../components/requests/RequestCreateModal";
import { SiteUserFormPanel } from "../components/site-users/SiteUserFormPanel";
import { SiteUserAccessPanel } from "../components/site-users/SiteUserAccessPanel";
import { SiteUsersTablePanel } from "../components/site-users/SiteUsersTablePanel";
import { Chip, EmptyState, ProgressBar } from "../components/ui";
import { useResultsWorkspace } from "../hooks/useResultsWorkspace";
import { InventoryRepositoryProvider } from "../repositories/inventoryRepositoryContext";
import { createMockInventoryRepository } from "../repositories/mockInventoryRepository";
import { PointResultTable } from "../features/patrol/results/PointResultTable";
import { filterGroups, mapWithConcurrency, ResultsWorkspace } from "../features/patrol/results/ResultsWorkspace";
import { AssignmentScreen } from "../features/patrol/AssignmentScreen";
import { ScheduleScreen } from "../features/patrol/ScheduleScreen";
import {
  loadAssignmentFavoriteEmployeeIds,
  saveAssignmentFavoriteEmployeeIds,
  subscribeAssignmentFavoriteEmployeeIds,
} from "../features/patrol/assignments/assignmentStorage";
import { RequestModals } from "../features/patrol/components/requests/RequestModals";
import { EmployeeDirectoryPanel } from "../features/patrol/components/employees/EmployeeDirectoryPanel";
import { EmployeeProfileDrawer } from "../features/patrol/components/employees/EmployeeProfileDrawer";
import { EmuWorkAccountingScreen } from "../features/emu/EmuWorkAccountingScreen";
import { InventoryPpeScreen } from "../screens/inventory/InventoryPpeScreen";
import { Button, CompactTable, IconButton, KpiStrip, PaginationBar, RouteLoadingBar, SkeletonCards, SkeletonForm, SkeletonList, SkeletonPreview, SkeletonTable, StatusBadge } from "../shared/ui";
import { LoginScreen } from "../screens/LoginScreen";
import type { EmuWorkspace } from "../hooks/useEmuWorkspace";
import type { PatrolResult, SiteUser } from "../types";
import type { ResultGroup } from "../features/patrol/results/resultTypes";

beforeEach(() => {
  if (!window.localStorage?.getItem || !window.localStorage?.setItem || !window.localStorage?.removeItem) {
    Object.defineProperty(window, "localStorage", { configurable: true, value: createMemoryStorage() });
  }
});

afterEach(() => {
  window.localStorage?.removeItem?.("patrol360.results.hiddenGroups.v1");
  window.localStorage?.removeItem?.("patrol360.patrolEmployees.favoriteIds.v1");
  vi.unstubAllGlobals();
});

function formatTestRuDate(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

function formatTestDateInput(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function createMemoryStorage(): Storage {
  const rows = new Map<string, string>();
  return {
    clear: () => rows.clear(),
    get length() {
      return rows.size;
    },
    getItem: (key: string) => rows.get(key) ?? null,
    key: (index: number) => Array.from(rows.keys())[index] ?? null,
    removeItem: (key: string) => {
      rows.delete(key);
    },
    setItem: (key: string, value: string) => {
      rows.set(key, value);
    },
  };
}

function createEmuAccessWorkspace(sourceMode: "api" | "mock" = "api"): EmuWorkspace {
  return {
    actions: {} as EmuWorkspace["actions"],
    auditEvents: [],
    dashboard: {
      activeWork: [],
      forgottenWork: [],
      metrics: [],
      recentEvents: [],
      weekPlan: [],
    },
    decisions: [],
    loading: false,
    planTasks: [],
    refreshPlanBoard: vi.fn().mockResolvedValue(undefined),
    refreshWorkBoard: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn().mockResolvedValue(undefined),
    settings: {
      favoriteEmployees: [],
      notCompletedReasons: [],
      sections: [],
      waitReasons: [],
      workTemplates: [],
    },
    shiftRemarks: {
      page: 1,
      pageCount: 1,
      pageSize: 50,
      rows: [],
      total: 0,
    },
    sourceMode,
    workSessions: {
      page: 1,
      pageCount: 1,
      pageSize: 100,
      rows: [],
      total: 0,
    },
  } as EmuWorkspace;
}

describe("shared UI primitives", () => {
  it("submits login credentials from the auth screen", async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn().mockResolvedValue(true);

    render(<LoginScreen isSubmitting={false} onLogin={onLogin} onUseMockMode={vi.fn()} />);

    await user.type(screen.getByLabelText("\u041b\u043e\u0433\u0438\u043d"), "admin");
    await user.type(screen.getByLabelText("\u041f\u0430\u0440\u043e\u043b\u044c"), "Patrol360!");
    await user.click(screen.getByRole("button", { name: "\u0412\u043e\u0439\u0442\u0438" }));

    expect(onLogin).toHaveBeenCalledWith("admin", "Patrol360!", false);
  });

  it("renders chip content", () => {
    render(<Chip tone="green">Active</Chip>);

    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("clamps progress bar width", () => {
    render(<ProgressBar value={125} />);

    const bar = screen.getByLabelText("\u041f\u0440\u043e\u0433\u0440\u0435\u0441\u0441 125%");
    expect(bar.querySelector("span")).toHaveStyle({ width: "100%" });
  });

  it("renders empty state description", () => {
    render(<EmptyState title="No data" description="Create first record" icon="i" tone="orange" />);

    expect(screen.getByText("No data")).toBeInTheDocument();
    expect(screen.getByText("Create first record")).toBeInTheDocument();
    expect(screen.getByText("i")).toBeInTheDocument();
  });

  it("renders shared button states and status badge", () => {
    const { container } = render(
      <>
        <Button variant="primary">Save</Button>
        <Button isLoading variant="danger">Delete</Button>
        <IconButton label="Open menu">...</IconButton>
        <StatusBadge tone="green">Issued</StatusBadge>
      </>,
    );

    expect(screen.getByRole("button", { name: "Save" })).toHaveClass("ui-button", "is-primary");
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass("is-loading");
    expect(screen.getByRole("button", { name: "Delete" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveClass("ui-icon-button");
    expect(screen.getByText("Issued")).toHaveClass("ui-status-badge", "green");
  });

  it("renders shared operational primitives", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();

    render(
      <>
        <KpiStrip items={[{ id: "active", label: "Active", value: 7, hint: "today", tone: "green" }]} />
        <PaginationBar
          page={2}
          pageSize={25}
          total={80}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
        <CompactTable
          columns={[{ key: "name", header: "Name", render: (row: { id: string; name: string }) => row.name }]}
          getRowKey={(row) => row.id}
          rows={[{ id: "row-1", name: "Row one" }]}
        />
      </>,
    );

    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Показано 26-50 из 80")).toBeInTheDocument();
    expect(screen.getByText("Row one")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Вперед" }));
    await user.selectOptions(screen.getByRole("combobox"), "50");

    expect(onPageChange).toHaveBeenCalledWith(3);
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });

  it("renders shared loading primitives", () => {
    const { container } = render(
      <>
        <RouteLoadingBar active />
        <SkeletonCards cards={2} />
        <SkeletonList rows={3} />
        <SkeletonTable rows={2} columns={3} />
        <SkeletonForm fields={2} />
        <SkeletonPreview />
      </>,
    );

    expect(container.querySelector(".route-loading-line.is-active")).toBeInTheDocument();
    expect(container.querySelectorAll(".skeleton-card")).toHaveLength(2);
    expect(container.querySelectorAll(".skeleton-list-row")).toHaveLength(3);
    expect(container.querySelectorAll(".skeleton-table-row")).toHaveLength(8);
    expect(container.querySelectorAll(".skeleton-field")).toHaveLength(2);
    expect(container.querySelector(".skeleton-preview")).toBeInTheDocument();
  });

  it("explains EMU work ownership mode for regular and full-access users", () => {
    const regularUser = {
      displayName: "Operator",
      id: "user-1",
      login: "operator",
      permissions: ["emu.work-accounting.view", "emu.work.create"],
      roles: ["emu_operator"],
    };
    const managerUser = {
      ...regularUser,
      id: "manager-1",
      login: "manager",
      permissions: ["emu.work-accounting.view", "emu.scope.all"],
      roles: ["manager"],
    };

    const { rerender } = render(
      <EmuWorkAccountingScreen
        currentUser={regularUser}
        employeeDirectory={[]}
        onNotify={vi.fn()}
        workspace={createEmuAccessWorkspace("api")}
      />,
    );

    expect(screen.getByText("Мои работы")).toBeInTheDocument();
    expect(screen.getByText(/Показаны только карточки, созданные вашим аккаунтом/)).toBeInTheDocument();

    rerender(
      <EmuWorkAccountingScreen
        currentUser={managerUser}
        employeeDirectory={[]}
        onNotify={vi.fn()}
        workspace={createEmuAccessWorkspace("api")}
      />,
    );

    expect(screen.getByText("Все доступные работы")).toBeInTheDocument();
    expect(screen.getByText(/видят расширенный список/)).toBeInTheDocument();
  });

  it("requires matching initial password when creating a site user", async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    const onCreateUser = vi.fn();

    render(<SiteUserFormPanel onCreateUser={onCreateUser} onNotify={onNotify} />);

    await user.type(screen.getByLabelText("Логин"), "operator");
    await user.type(screen.getByLabelText("ФИО"), "Оператор");
    await user.type(screen.getByLabelText("Временный пароль"), "Password1");
    await user.type(screen.getByLabelText("Подтвердите пароль"), "Password2");

    expect(screen.getByRole("button", { name: "Создать пользователя" })).toBeDisabled();
    expect(onCreateUser).not.toHaveBeenCalled();
    expect(onNotify).not.toHaveBeenCalled();
  });

  it("submits initial password when creating a site user", async () => {
    const user = userEvent.setup();
    const onCreateUser = vi.fn();

    render(<SiteUserFormPanel onCreateUser={onCreateUser} onNotify={vi.fn()} />);

    await user.type(screen.getByLabelText("Логин"), "operator");
    await user.type(screen.getByLabelText("ФИО"), "Оператор");
    await user.type(screen.getByLabelText("Временный пароль"), "Password1");
    await user.type(screen.getByLabelText("Подтвердите пароль"), "Password1");
    await user.click(screen.getByRole("button", { name: "Создать пользователя" }));

    expect(onCreateUser).toHaveBeenCalledWith(expect.objectContaining({
      confirmPassword: "Password1",
      fullName: "Оператор",
      initialPassword: "Password1",
      login: "operator",
    }));
  });

  it("filters site users by role and status", async () => {
    const user = userEvent.setup();
    const users: SiteUser[] = [
      {
        id: "user-1",
        login: "admin",
        fullName: "Администратор",
        role: "Администратор",
        status: "Активен",
        lastLogin: "01.06.2026",
        createdAt: "01.06.2026",
        access: ["site_users.write"],
        directPermissions: [],
        recentSessions: [],
      },
      {
        id: "user-2",
        login: "emu-operator",
        fullName: "Оператор ЭМУ",
        role: "Оператор ЭМУ",
        status: "Заблокирован",
        lastLogin: "—",
        createdAt: "01.06.2026",
        access: ["emu.work-accounting.view"],
        directPermissions: ["emu.work.create"],
        recentSessions: [],
      },
    ];

    render(
      <SiteUsersTablePanel
        users={users}
        selectedUserId="user-1"
        onOpenCreate={vi.fn()}
        onSelectUser={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Роль"), "Оператор ЭМУ");
    await user.selectOptions(screen.getByLabelText("Статус"), "Заблокирован");

    expect(screen.getByText("emu-operator")).toBeInTheDocument();
    expect(screen.queryByText("admin")).not.toBeInTheDocument();
  });

  it("saves EMU section scopes with backend scope type", async () => {
    const user = userEvent.setup();
    const onSaveScopes = vi.fn().mockResolvedValue({
      directPermissions: [],
      effectivePermissions: ["emu.view", "emu.work-accounting.view"],
      roles: ["emu_operator"],
      scopes: [{ id: "scope-1", moduleKey: "emu", scopeType: "emu_section", scopeId: "section-1", scopeName: "Цех 1" }],
      userId: "user-1",
    });
    const siteUser: SiteUser = {
      id: "user-1",
      login: "emu",
      fullName: "Оператор ЭМУ",
      role: "Оператор ЭМУ",
      status: "Активен",
      lastLogin: "нет данных",
      createdAt: "01.06.2026",
      access: ["emu.view", "emu.work-accounting.view"],
      directPermissions: [],
      recentSessions: [],
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { id: "section-1", name: "Цех 1", isActive: true },
    ]), { headers: { "content-type": "application/json" }, status: 200 })));
    const loadAccess = vi.fn().mockResolvedValue({
      directPermissions: [],
      effectivePermissions: ["emu.view", "emu.work-accounting.view"],
      roles: ["emu_operator"],
      scopes: [],
      userId: "user-1",
    });

    render(
      <SiteUserAccessPanel
        canManage
        loadAccess={loadAccess}
        onNotify={vi.fn()}
        onOpenProfile={vi.fn()}
        onSavePermissions={vi.fn()}
        onSaveScopes={onSaveScopes}
        user={siteUser}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Участки" }));
    await waitFor(() => expect(loadAccess).toHaveBeenCalledWith("user-1"));
    await user.click(screen.getByRole("button", { name: "Выбрать все" }));
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(onSaveScopes).toHaveBeenCalledWith("user-1", [
      { moduleKey: "emu", scopeType: "emu_section", scopeId: "section-1" },
    ]);
  });

  it("opens PPE as an employee-centered card with tabs and issue action", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("patrol360.inventory.ppe.employee", "emp-1");
    const repository = createMockInventoryRepository();
    const getPpeWorkspace = vi.spyOn(repository, "getPpeWorkspace");

    render(
      <InventoryRepositoryProvider value={repository}>
        <InventoryPpeScreen
          onNotify={vi.fn()}
        />
      </InventoryRepositoryProvider>,
    );

    await waitFor(() => expect(getPpeWorkspace).toHaveBeenCalledWith("emp-1"));
    expect(screen.getByRole("navigation", { name: "Разделы СИЗ" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Карточки СИЗ" })).toBeInTheDocument();
    expect(screen.getAllByText("Каска защитная").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Нормы/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Выдано/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Печать" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Каска защитная" }));
    expect(await screen.findByRole("region", { name: "Сопоставить норму с номенклатурой" })).toBeInTheDocument();
    expect(screen.getByLabelText("Поиск номенклатуры")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Отмена" }));

    await user.click(screen.getByRole("button", { name: "Выдать" }));
    expect(await screen.findByRole("region", { name: "Выдать СИЗ" })).toBeInTheDocument();
    expect(screen.getAllByText("Пункт норм").length).toBeGreaterThan(0);
    expect(screen.getByText("Способ выдачи")).toBeInTheDocument();
    expect(screen.getByText("Комментарий")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Закрыть" }));
    await user.click(screen.getByRole("button", { name: /Выдано/ }));
    expect(screen.getByText("Модель / артикул")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Печать" }));
    expect(screen.getByText("Личная карточка СИЗ")).toBeInTheDocument();
    expect(screen.getByText("Лист подписи")).toBeInTheDocument();
  });

  it("shows a clear request fallback instead of an empty view modal", () => {
    render(
      <RequestModals
        modal={{ kind: "view", requestId: "missing-request" }}
        request={undefined}
        sourceResult={undefined}
        sourceResultId={undefined}
        employeeOptions={[]}
        routeOptions={[]}
        onClose={vi.fn()}
        onCreateRelated={vi.fn()}
        onSubmitCreate={vi.fn()}
      />,
    );

    expect(screen.getByText("Заявка не найдена")).toBeInTheDocument();
    expect(screen.getByText(/отсутствует в текущем списке заявок/i)).toBeInTheDocument();
  });

  it("does not show request view action for an assignment with a missing request", async () => {
    window.localStorage.setItem("patrol360.patrolEmployees.favoriteIds.v1", JSON.stringify(["employee-1"]));

    render(
      <AssignmentScreen
        activePatrols={[
          {
            id: "assignment-1",
            patrolRequestId: "missing-request",
            employee: "Костарев Илья Сергеевич",
            employeeId: "employee-1",
            routeId: "route-1",
            route: "Обход печей",
            zone: "Импорт atom_obhod",
            shift: "День",
            currentPoint: "КПП-1",
            status: "Ожидает",
            progress: 0,
            eta: "20:20",
            deviation: "0",
            plannedAt: "29.06.2026, 20:20",
          } as never,
        ]}
        assignmentCreateIntent={0}
        canManage={true}
        dataSourceMode="mock"
        employeeDirectory={[
          {
            id: "employee-1",
            fullName: "Костарев Илья Сергеевич",
            initials: "КИ",
            personnelNo: "001",
            position: "Сотрудник подрядной организации",
            department: "ИП Бобровник",
            employeeGroup: "Подрядчик",
            birthDate: "1990-01-01",
            zone: "ИП Бобровник",
            status: "Активен",
            routesDone: 0,
            routesTotal: 0,
            mobileStatus: "Привязан",
            lastSeen: "сейчас",
            phone: "",
            hiredAt: "2026-01-01",
            brigade: "3 смена",
            shift: "day",
            leader: "",
            email: "",
          } as never,
        ]}
        refreshPatrolData={vi.fn().mockResolvedValue(undefined)}
        requestListStatus="ready"
        requests={[]}
        routeDirectory={[
          {
            id: "route-1",
            name: "Обход печей",
            territory: "Импорт atom_obhod",
            status: "Активен",
            description: "",
            duration: "30 мин",
            distance: "0",
            periodicity: "Ежедневно",
            points: [],
          } as never,
        ]}
        selectedEmployeeId="employee-1"
        selectedRouteId="route-1"
        onOpenRequestById={vi.fn()}
        onRefreshRequests={vi.fn()}
        onNavigate={vi.fn()}
        onNotify={vi.fn()}
        onCreatePatrolRequest={vi.fn()}
        onSelectEmployee={vi.fn()}
        onSelectRoute={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getAllByText("Костарев Илья Сергеевич").length).toBeGreaterThan(0));

    expect(screen.queryByText("Просмотр")).not.toBeInTheDocument();
    expect(screen.getByText(/Действующая заявка/i)).toBeInTheDocument();
  });

  it("counts a linked request and assignment as one active employee item", async () => {
    window.localStorage.setItem("patrol360.patrolEmployees.favoriteIds.v1", JSON.stringify(["employee-1"]));

    const { container } = render(
      <AssignmentScreen
        activePatrols={[
          {
            id: "assignment-1",
            patrolRequestId: "request-1",
            employee: "Employee One",
            employeeId: "employee-1",
            routeId: "route-1",
            route: "Route One",
            zone: "Zone",
            shift: "День",
            currentPoint: "Start",
            status: "Ожидает",
            progress: 0,
            eta: "20:20",
            deviation: "0",
            plannedAt: "03.07.2026, 20:20",
          } as never,
        ]}
        assignmentCreateIntent={0}
        canManage={true}
        dataSourceMode="api"
        employeeDirectory={[
          {
            id: "employee-1",
            fullName: "Employee One",
            initials: "EO",
            personnelNo: "001",
            position: "Inspector",
            department: "Patrol",
            employeeGroup: "Primary",
            birthDate: "",
            zone: "Patrol",
            status: "Active",
            routesDone: 0,
            routesTotal: 0,
            mobileStatus: "Linked",
            lastSeen: "",
            phone: "",
            hiredAt: "",
            brigade: "",
            shift: "day",
            leader: "",
            email: "",
          } as never,
        ]}
        refreshPatrolData={vi.fn().mockResolvedValue(undefined)}
        requestListStatus="ready"
        requests={[
          {
            createdAt: "2026-07-02T11:32:15Z",
            description: "Request",
            dueAt: "20:20",
            employee: "Employee One",
            employeeId: "employee-1",
            id: "request-1",
            notificationText: "Notify",
            notifyEmployee: true,
            point: "",
            priority: "Средний",
            requestKind: "patrol-assignment",
            responsible: "Employee One",
            route: "Route One",
            routeId: "route-1",
            scheduledDate: "2026-07-03",
            scheduledTime: "20:20",
            source: "web",
            sourceResultId: "",
            status: "Назначена",
            timeline: [],
            title: "REQ-1",
          } as never,
        ]}
        routeDirectory={[
          {
            id: "route-1",
            name: "Route One",
            territory: "Zone",
            status: "Active",
            description: "",
            duration: "30 min",
            distance: "0",
            periodicity: "Daily",
            points: [],
          } as never,
        ]}
        selectedEmployeeId="employee-1"
        selectedRouteId="route-1"
        onCreatePatrolRequest={vi.fn()}
        onNavigate={vi.fn()}
        onNotify={vi.fn()}
        onOpenRequestById={vi.fn()}
        onRefreshRequests={vi.fn()}
        onSelectEmployee={vi.fn()}
        onSelectRoute={vi.fn()}
      />,
    );

    await waitFor(() => expect(container.querySelector(".assign-am-history-stats strong")?.textContent).toBe("1"));
  });

  it("uses assignment favorite employees in the patrol schedule grid", async () => {
    window.localStorage.setItem("patrol360.patrolEmployees.favoriteIds.v1", JSON.stringify(["employee-favorite"]));
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("[]", { headers: { "content-type": "application/json" }, status: 200 }))),
    );

    render(
      <ScheduleScreen
        dataSourceMode="mock"
        activePatrols={[]}
        canManage={true}
        employeeDirectory={[
          {
            id: "employee-favorite",
            fullName: "Favorite Employee",
            initials: "FE",
            personnelNo: "001",
            position: "Inspector",
            department: "Patrol",
            employeeGroup: "Primary",
            birthDate: "",
            zone: "Patrol",
            status: "Active",
            routesDone: 0,
            routesTotal: 0,
            mobileStatus: "Linked",
            lastSeen: "",
            phone: "",
            hiredAt: "",
            brigade: "",
            shift: "day",
            leader: "",
            email: "",
          } as never,
          {
            id: "employee-other",
            fullName: "Other Employee",
            initials: "OE",
            personnelNo: "002",
            position: "Inspector",
            department: "Patrol",
            employeeGroup: "Primary",
            birthDate: "",
            zone: "Patrol",
            status: "Active",
            routesDone: 0,
            routesTotal: 0,
            mobileStatus: "Linked",
            lastSeen: "",
            phone: "",
            hiredAt: "",
            brigade: "",
            shift: "day",
            leader: "",
            email: "",
          } as never,
        ]}
        mode="week"
        onModeChange={vi.fn()}
        onNotify={vi.fn()}
        onCreateScheduledRequest={vi.fn().mockResolvedValue({} as never)}
        onOpenRequestById={vi.fn()}
        onRunAssignmentCommand={vi.fn()}
        requests={[]}
        routeDirectory={[]}
        selectedCellId=""
        onSelectCell={vi.fn()}
      />,
    );

    expect(await screen.findByText("Favorite Employee")).toBeInTheDocument();
    expect(screen.queryByText("Other Employee")).not.toBeInTheDocument();
  });

  it("shares patrol employee favorites through one storage contract", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAssignmentFavoriteEmployeeIds(listener);

    saveAssignmentFavoriteEmployeeIds(["employee-a", "employee-a", "employee-b"]);

    expect(loadAssignmentFavoriteEmployeeIds()).toEqual(["employee-a", "employee-b"]);
    expect(listener).toHaveBeenCalledWith(["employee-a", "employee-b"]);

    unsubscribe();
  });

  it("opens schedule planning modal from an empty cell and sends notification payload", async () => {
    window.localStorage.setItem("patrol360.patrolEmployees.favoriteIds.v1", JSON.stringify(["employee-favorite"]));
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("[]", { headers: { "content-type": "application/json" }, status: 200 }))),
    );
    const onCreateScheduledRequest = vi.fn().mockResolvedValue({ id: "request-1" } as never);
    const today = new Date();
    const resultDay = new Date(today);
    resultDay.setDate(resultDay.getDate() - ((resultDay.getDay() + 6) % 7));
    const resultDate = formatTestRuDate(resultDay);

    function ScheduleHarness() {
      const [selectedCellId, setSelectedCellId] = useState("");
      return (
        <ScheduleScreen
          dataSourceMode="mock"
          activePatrols={[]}
          canManage={true}
          employeeDirectory={[
            {
              id: "employee-favorite",
              fullName: "Favorite Employee",
              initials: "FE",
              personnelNo: "001",
              position: "Inspector",
              department: "Patrol",
              employeeGroup: "Primary",
              birthDate: "",
              zone: "Patrol",
              status: "Active",
              routesDone: 0,
              routesTotal: 0,
              mobileStatus: "Linked",
              lastSeen: "",
              phone: "",
              hiredAt: "",
              brigade: "",
              shift: "day",
              leader: "",
              email: "",
            } as never,
          ]}
          mode="week"
          patrolResults={[
            {
              id: "result-schedule-history",
              status: "Замечание",
              point: "Point 7",
              pointId: "point-7",
              employee: "Favorite Employee",
              employeeId: "employee-favorite",
               routeId: "route-1",
               route: "Route A",
              territory: "Patrol",
              shift: "День",
              plannedAt: `${resultDate}, 08:00`,
              actualAt: `${resultDate}, 08:20`,
              deviation: "+20m",
              comment: "Needs follow-up",
              photos: 1,
              issueType: "Issue",
              severity: "Средняя",
              chronology: [],
            } satisfies PatrolResult,
          ]}
          onModeChange={vi.fn()}
          onNotify={vi.fn()}
          onCreateScheduledRequest={onCreateScheduledRequest}
          onOpenRequestById={vi.fn()}
          onRunAssignmentCommand={vi.fn()}
          requests={[]}
          routeDirectory={[
            {
              id: "route-1",
              name: "Route A",
              territory: "Patrol",
              status: "Active",
              description: "",
              duration: "30 min",
              distance: "",
              periodicity: "",
              points: [],
            } as never,
            {
              id: "route-2",
              name: "Route B",
              territory: "Patrol",
              status: "Active",
              description: "",
              duration: "45 min",
              distance: "",
              periodicity: "",
              points: [],
            } as never,
          ]}
          selectedCellId={selectedCellId}
          onSelectCell={setSelectedCellId}
        />
      );
    }

    const { container } = render(<ScheduleHarness />);

    await waitFor(() => expect(container.querySelector("button.schedule-cell.empty")).not.toBeNull());
    fireEvent.click(container.querySelector<HTMLButtonElement>("button.schedule-cell.empty")!);

    expect(await screen.findByRole("dialog", { name: "Создание планового обхода" })).toBeInTheDocument();
    expect(screen.getByText("Уведомить сотрудника")).toBeInTheDocument();
    expect(screen.getByText("История результатов за день")).toBeInTheDocument();
    expect(screen.getByText("Point 7")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Назначить по результату" }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить заявку" }));

    await waitFor(() => expect(onCreateScheduledRequest).toHaveBeenCalledOnce());
    expect(onCreateScheduledRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: "employee-favorite",
        employee: "Favorite Employee",
         routeId: "route-1",
         route: "Route A",
        notifyEmployee: true,
        notificationText: expect.stringContaining("Point 7"),
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Создание планового обхода" })).not.toBeInTheDocument());
  });

  it("renders patrol employees as compact roster rows with a structured profile", () => {
    const employee = {
      id: "employee-compact",
      fullName: "Костарев Илья Сергеевич",
      initials: "КИ",
      personnelNo: "PERCO-38925",
      position: "Сотрудник подрядной организации",
      department: "ИП Бобровник",
      employeeGroup: "Подрядчики",
      birthDate: "",
      zone: "ИП Бобровник",
      status: "Активен",
      routesDone: 0,
      routesTotal: 3,
      mobileStatus: "Привязан",
      lastSeen: "03.06.2026, 14:50:26",
      phone: "",
      hiredAt: "",
      brigade: "",
      shift: "День",
      leader: "",
      email: "",
    } as never;
    const { container } = render(
      <>
        <EmployeeDirectoryPanel
          allEmployeesCount={213}
          employees={[employee]}
          selectedEmployeeId="employee-compact"
          onOpenAddFromAccounting={vi.fn()}
          onOpenCreate={vi.fn()}
          onSelectEmployee={vi.fn()}
        />
        <EmployeeProfileDrawer
          employee={employee}
          onDeleteEmployee={vi.fn()}
          onEditEmployee={vi.fn()}
          onNavigate={vi.fn()}
        />
      </>,
    );

    expect(container.querySelector(".employee-roster-row")).not.toBeNull();
    expect(container.querySelector("table")).toBeNull();
    expect(screen.getByText("Основные данные")).toBeInTheDocument();
    expect(screen.getByText("Кадровая информация")).toBeInTheDocument();
    expect(screen.queryByText("Маршруты сегодня")).not.toBeInTheDocument();
    expect(screen.queryByText("Мобильный вход")).not.toBeInTheDocument();
  });

  it("opens patrol result details on result row double click", async () => {
    const user = userEvent.setup();
    const onSelectResult = vi.fn();

    const { container } = render(
      <ResultsWorkspace
        dataSourceMode="mock"
        onSelectResult={onSelectResult}
        onCreateRequest={vi.fn()}
        onOpenRequest={vi.fn()}
      />,
    );

    await waitFor(() => expect(container.querySelectorAll("article.results-review-row").length).toBeGreaterThan(0));
    const row = container.querySelector<HTMLElement>("article.results-review-row");
    expect(row).not.toBeNull();

    await user.dblClick(row!);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(onSelectResult).toHaveBeenCalled();
  });

  it("filters patrol result groups by selected route", () => {
    const baseGroup = {
      id: "route-a",
      status: "ok",
      route: "Маршрут A",
      territory: "Цех",
      employee: "Иванов Иван",
      employeeId: "employee-a",
      shift: "День",
      duration: { label: "10 мин", hint: "", tone: "ok", minutes: 10 },
      photos: 0,
      issues: 0,
      points: 1,
      okPoints: 1,
      issuePoints: 0,
      results: [],
    } as ResultGroup;
    const groups = [
      baseGroup,
      { ...baseGroup, id: "route-b", route: "Маршрут B", employee: "Петров Петр" },
    ];

    expect(filterGroups(groups, "all", "", "Маршрут B")).toEqual([groups[1]]);
  });

  it("renders a route selector in the patrol results toolbar", async () => {
    const { container } = render(
      <ResultsWorkspace
        dataSourceMode="mock"
        onSelectResult={vi.fn()}
        onCreateRequest={vi.fn()}
        onOpenRequest={vi.fn()}
      />,
    );

    await waitFor(() => expect(container.querySelectorAll("article.results-review-row").length).toBeGreaterThan(0));

    expect(screen.getByLabelText("Маршрут")).toBeInTheDocument();
  });

  it("debounces API result search and labels metrics as a loaded sample", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ items: [], page: 1, pageSize: 100, total: 250, totalPages: 3, hasNext: true }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetcher);

    render(
      <ResultsWorkspace
        dataSourceMode="api"
        onSelectResult={vi.fn()}
        onCreateRequest={vi.fn()}
        onOpenRequest={vi.fn()}
      />,
    );

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getAllByText("По 0 загруженным из 250").length).toBeGreaterThan(0));

    fireEvent.change(screen.getByPlaceholderText(/Поиск по маршруту/), { target: { value: "печи" } });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(String(fetcher.mock.calls[1]?.[0])).toContain("query=%D0%BF%D0%B5%D1%87%D0%B8");
  });

  it("opens a dedicated patrol result context panel from right click and hides the row on this device", async () => {
    const addToast = vi.fn();
    const user = userEvent.setup();

    const { container, unmount } = render(
      <ResultsWorkspace
        dataSourceMode="mock"
        onSelectResult={vi.fn()}
        onCreateRequest={vi.fn()}
        onOpenRequest={vi.fn()}
        addToast={addToast}
      />,
    );

    await waitFor(() => expect(container.querySelectorAll("article.results-review-row").length).toBeGreaterThan(0));
    const initialRows = container.querySelectorAll("article.results-review-row").length;
    const row = container.querySelector<HTMLElement>("article.results-review-row");
    expect(row).not.toBeNull();

    fireEvent.contextMenu(row!, { clientX: 320, clientY: 240 });

    await waitFor(() => expect(container.querySelector(".results-review-context-panel")).not.toBeNull());
    expect(container.querySelector(".results-review-row-menu")).toBeNull();
    const archiveButton = container.querySelector<HTMLButtonElement>(".results-review-context-panel [data-action='archive']");
    expect(archiveButton).not.toBeNull();
    await user.click(archiveButton!);

    await waitFor(() => expect(container.querySelectorAll("article.results-review-row")).toHaveLength(initialRows - 1));
    expect(addToast).toHaveBeenCalledWith(expect.any(String), "info");

    unmount();

    const persisted = render(
      <ResultsWorkspace
        dataSourceMode="mock"
        onSelectResult={vi.fn()}
        onCreateRequest={vi.fn()}
        onOpenRequest={vi.fn()}
      />,
    );

    await waitFor(() => expect(persisted.container.querySelectorAll("article.results-review-row")).toHaveLength(initialRows - 1));
  });

  it("opens patrol result row menu from the three-dot button and hides the row on this device", async () => {
    const addToast = vi.fn();
    const user = userEvent.setup();

    const { container, unmount } = render(
      <ResultsWorkspace
        dataSourceMode="mock"
        onSelectResult={vi.fn()}
        onCreateRequest={vi.fn()}
        onOpenRequest={vi.fn()}
        addToast={addToast}
      />,
    );

    await waitFor(() => expect(container.querySelectorAll("article.results-review-row").length).toBeGreaterThan(0));
    const initialRows = container.querySelectorAll("article.results-review-row").length;
    const menuButton = container.querySelector<HTMLButtonElement>(".results-review-row-more");
    expect(menuButton).not.toBeNull();

    await user.click(menuButton!);

    await waitFor(() => expect(container.querySelector(".results-review-row-menu")).not.toBeNull());
    expect(container.querySelector(".results-review-context-panel")).toBeNull();
    const deleteButton = container.querySelector<HTMLButtonElement>(".results-review-row-menu [data-action='delete']");
    expect(deleteButton).not.toBeNull();
    await user.click(deleteButton!);

    await waitFor(() => expect(container.querySelectorAll("article.results-review-row")).toHaveLength(initialRows - 1));
    expect(addToast).toHaveBeenCalledWith(expect.any(String), "success");

    unmount();

    const persisted = render(
      <ResultsWorkspace
        dataSourceMode="mock"
        onSelectResult={vi.fn()}
        onCreateRequest={vi.fn()}
        onOpenRequest={vi.fn()}
      />,
    );

    await waitFor(() => expect(persisted.container.querySelectorAll("article.results-review-row")).toHaveLength(initialRows - 1));
  });

  it("renders issue point status under marker name with a dedicated comment block", () => {
    const result = {
      id: "point-issue-1",
      point: "К14",
      pointId: "point-k14",
      employee: "Костарев Илья Сергеевич",
      employeeId: "employee-1",
      route: "Обход печей",
      routeId: "route-1",
      territory: "Импорт atom_obhod",
      shift: "День",
      plannedAt: "2026-06-28T20:20:00.000Z",
      actualAt: "2026-06-29T01:50:00.000Z",
      deviation: "+331m",
      comment: "Нужна замена заслонки",
      photos: 0,
      issueType: "Неисправность",
      severity: "Средняя",
      status: "Замечание",
      chronology: [],
      source: "mobile",
    } as PatrolResult;
    const group: ResultGroup = {
      id: "group-1",
      status: "issue",
      route: result.route,
      routeId: result.routeId,
      territory: result.territory,
      employee: result.employee,
      employeeId: result.employeeId,
      shift: result.shift,
      duration: { label: "10 ч 52 мин", hint: "", tone: "ok", minutes: 652 },
      photos: 0,
      issues: 1,
      points: 1,
      okPoints: 0,
      issuePoints: 1,
      results: [result],
    };

    const { container } = render(
      <PointResultTable
        group={group}
        results={[result]}
        onOpenAttachment={vi.fn()}
        photoLoadingResultId={null}
      />,
    );
    const row = container.querySelector("article.results-review-point-row.is-issue");

    expect(row).not.toBeNull();
    expect(row?.querySelector(".results-review-point-name .results-review-status.is-issue")).not.toBeNull();
    expect(row?.querySelector(".results-review-point-status")).toBeNull();
    expect(row?.querySelector(".results-review-point-cell.is-result")).toBeNull();
    expect(row?.querySelector(".results-review-point-comment")?.textContent).toContain("Нужна замена заслонки");
  });

  it("does not request API details for a stale mock selected result id", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify([]), { headers: { "content-type": "application/json" }, status: 200 }),
    );
    vi.stubGlobal("fetch", fetcher);

    function Probe() {
      useResultsWorkspace({
        dataSourceMode: "api",
        selectedResultId: "result-smoke-photo",
        onSelectResult: vi.fn(),
        showToast: vi.fn(),
      });
      return <div>results probe</div>;
    }

    render(<Probe />);

    await waitFor(() => expect(fetcher).toHaveBeenCalled());

    const requestedUrls = fetcher.mock.calls.map(([input]) => String(input));
    expect(requestedUrls.some((url) => url.includes("/api/v3/results?page=1&pageSize=100"))).toBe(true);
    expect(requestedUrls.some((url) => url.includes("result-smoke-photo"))).toBe(false);
  });

  it("does not fetch a disabled results workspace", async () => {
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetcher);

    function Probe() {
      useResultsWorkspace({
        dataSourceMode: "api",
        enabled: false,
        selectedResultId: "",
        onSelectResult: vi.fn(),
        showToast: vi.fn(),
      });
      return <div>results probe</div>;
    }

    render(<Probe />);
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(fetcher).not.toHaveBeenCalled();
  });

  it("bounds concurrent result detail loads", async () => {
    let running = 0;
    let peak = 0;

    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => window.setTimeout(resolve, 1));
      running -= 1;
    });

    expect(peak).toBe(3);
  });

  it("renders request list loading state", () => {
    render(
      <DashboardRequestsPanel
        requests={[]}
        status="loading"
        onCreateRequest={vi.fn()}
        onOpenRequestById={vi.fn()}
      />,
    );

    expect(screen.getByText("\u0417\u0430\u044f\u0432\u043a\u0438 \u0437\u0430\u0433\u0440\u0443\u0436\u0430\u044e\u0442\u0441\u044f")).toBeInTheDocument();
    expect(screen.getByText(/backend API/)).toBeInTheDocument();
  });

  it("renders request list error state with retry action", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(
      <DashboardRequestsPanel
        errorMessage="Backend unavailable"
        requests={[]}
        status="error"
        onCreateRequest={vi.fn()}
        onOpenRequestById={vi.fn()}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText("\u0417\u0430\u044f\u0432\u043a\u0438 API \u043d\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043d\u044b")).toBeInTheDocument();
    expect(screen.getByText("Backend unavailable")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "\u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0443" }));

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("submits patrol request modal with selected employee and route ids", async () => {
    const user = userEvent.setup();
    const onSubmitCreate = vi.fn();

    const { container } = render(
      <RequestCreateModal
        employeeOptions={[
          {
            id: "employee-1",
            fullName: "Иванов Иван Иванович",
            initials: "ИИ",
            personnelNo: "001",
            position: "Оператор",
            department: "Обход",
            employeeGroup: "Группа 1",
            birthDate: "",
            zone: "Север",
            status: "Активен",
            routesDone: 0,
            routesTotal: 0,
            mobileStatus: "Привязан",
            lastSeen: "",
            phone: "",
            hiredAt: "",
            brigade: "",
            shift: "День",
            leader: "",
            email: "",
          },
        ]}
        routeOptions={[
          {
            id: "route-1",
            name: "Обход печей",
            territory: "Цех",
            status: "Активен",
            description: "",
            duration: "00:30",
            distance: "",
            periodicity: "",
            points: [],
          },
        ]}
        onClose={vi.fn()}
        onDirtyChange={vi.fn()}
        onSubmitCreate={onSubmitCreate}
      />,
    );

    expect(screen.queryByText("Уведомить сотрудника")).not.toBeInTheDocument();
    expect(screen.getByText("Отправка заявки")).toBeInTheDocument();

    const timeInput = container.querySelector<HTMLInputElement>('input[name="scheduledTime"]');
    expect(timeInput).not.toBeNull();
    fireEvent.change(timeInput!, { target: { value: "09:15" } });
    await user.click(screen.getByRole("button", { name: "Создать заявку" }));

    expect(onSubmitCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: "employee-1",
        employee: "Иванов Иван Иванович",
        routeId: "route-1",
        route: "Обход печей",
        scheduledTime: "09:15",
        notifyEmployee: true,
        notificationText: expect.stringContaining("Иванов Иван Иванович"),
        plannedAt: expect.any(String),
        shift: "День",
      }),
    );
  });

  it("renders mobile account list loading state", () => {
    render(
      <MobileAccountListPanel
        activePanel="create"
        accounts={[]}
        mode="accounts"
        selectedAccountId=""
        status="loading"
        onDeleteAccount={vi.fn()}
        onDetachEmployee={vi.fn()}
        onModeChange={vi.fn()}
        onNotify={vi.fn()}
        onOpenPanel={vi.fn()}
        onSelectAccount={vi.fn()}
        onToggleBlockAccount={vi.fn()}
      />,
    );

    expect(screen.getByText("\u041c\u043e\u0431\u0438\u043b\u044c\u043d\u044b\u0435 \u0430\u043a\u043a\u0430\u0443\u043d\u0442\u044b \u0437\u0430\u0433\u0440\u0443\u0436\u0430\u044e\u0442\u0441\u044f")).toBeInTheDocument();
    expect(screen.getByText(/backend API/)).toBeInTheDocument();
  });

  it("renders mobile account list error state with retry action", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(
      <MobileAccountListPanel
        activePanel="create"
        accounts={[]}
        errorMessage="Accounts endpoint unavailable"
        mode="accounts"
        selectedAccountId=""
        status="error"
        onDeleteAccount={vi.fn()}
        onDetachEmployee={vi.fn()}
        onModeChange={vi.fn()}
        onNotify={vi.fn()}
        onOpenPanel={vi.fn()}
        onRetry={onRetry}
        onSelectAccount={vi.fn()}
        onToggleBlockAccount={vi.fn()}
      />,
    );

    expect(screen.getByText("\u041c\u043e\u0431\u0438\u043b\u044c\u043d\u044b\u0435 \u0430\u043a\u043a\u0430\u0443\u043d\u0442\u044b API \u043d\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043d\u044b")).toBeInTheDocument();
    expect(screen.getByText("Accounts endpoint unavailable")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "\u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0443" }));

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders mobile account sessions and security events", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const onNotify = vi.fn();

    render(
      <MobileAccountSecurityPanels
        onNotify={onNotify}
        onRefresh={onRefresh}
        securityEvents={[
          {
            id: "event-1",
            accountId: "account-1",
            eventType: "mobile.account.login",
            message: "Login accepted",
            createdAt: "2026-05-18T10:30:00Z",
            actor: "operator",
          },
        ]}
        sessions={[
          {
            id: "session-1",
            accountId: "account-1",
            status: "online",
            deviceId: "device-1",
            device: "Xiaomi",
            platform: "Android",
            appVersion: "2.3.0",
            ipAddress: "127.0.0.1",
            startedAt: "2026-05-18T10:00:00Z",
            lastSeenAt: "2026-05-18T10:20:00Z",
          },
        ]}
        status="ready"
      />,
    );

    expect(screen.getAllByText("Сейчас онлайн")).toHaveLength(2);
    expect(screen.getByText("Xiaomi")).toBeInTheDocument();
    expect(screen.getByText("Android · 2.3.0 · 127.0.0.1")).toBeInTheDocument();
    expect(screen.getByText("Вход в приложение")).toBeInTheDocument();
    expect(screen.getByText("Login accepted")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c" })[0]);

    expect(onRefresh).toHaveBeenCalledOnce();
    expect(onNotify).not.toHaveBeenCalled();
  });

  it("edits a mobile account without clipping linked employee names", async () => {
    const user = userEvent.setup();
    const onUpdateAccount = vi.fn();
    const onOpenLink = vi.fn();

    const { container } = render(
      <MobileAccountEditPanel
        onNotify={vi.fn()}
        onOpenLink={onOpenLink}
        onUpdateAccount={onUpdateAccount}
        selected={{
          id: "account-1",
          login: "test1",
          passwordState: "set",
          employee: "Костарев Илья Сергеевич",
          employeeScope: "selected",
          boundEmployeeIds: ["employee-1", "employee-2"],
          boundEmployees: ["Костарев Илья Сергеевич", "Кириллов Иван Петрович"],
          role: "Маршрутный обходчик",
          status: "Активен",
          session: "Онлайн",
          lastSeen: "сейчас",
          device: "Kenshi Armor C1s",
          version: "0.1.24",
        }}
      />,
    );

    expect(screen.getByText("Костарев Илья Сергеевич")).toBeInTheDocument();
    expect(container.querySelector(".employee-token-remove")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Управлять привязками" }));
    expect(onOpenLink).toHaveBeenCalledOnce();

    const loginInput = screen.getByRole("textbox", { name: /Логин/ });
    await user.clear(loginInput);
    await user.type(loginInput, "test2");
    await user.click(screen.getByRole("button", { name: "Сохранить изменения" }));

    expect(onUpdateAccount).toHaveBeenCalledWith({
      login: "test2",
      role: "Маршрутный обходчик",
      status: "Активен",
    });
  });

  it("limits mobile account security events to the latest 7 with readable labels", () => {
    render(
      <MobileAccountSecurityPanels
        onNotify={vi.fn()}
        onRefresh={vi.fn()}
        securityEvents={Array.from({ length: 11 }, (_, index) => ({
          id: `event-${index + 1}`,
          accountId: "account-1",
          eventType: "mobile_account.employee_attached",
          message: `Employee employee-${index + 1} attached.`,
          createdAt: `2026-05-${String(index + 1).padStart(2, "0")}T10:30:00Z`,
          actor: "operator",
        }))}
        sessions={[
          {
            id: "session-1",
            accountId: "account-1",
            status: "online",
            deviceId: "device-1",
            device: "Xiaomi",
            platform: "Android",
            appVersion: "2.3.0",
            ipAddress: "127.0.0.1",
            startedAt: "2026-05-18T10:00:00Z",
            lastSeenAt: "2026-05-18T10:20:00Z",
          },
        ]}
        status="ready"
      />,
    );

    expect(screen.getByText("Последние 7 событий")).toBeInTheDocument();
    expect(screen.getAllByText("Сотрудник привязан")).toHaveLength(7);
    expect(screen.getAllByText("Пользователь: operator · Код: mobile_account.employee_attached")).toHaveLength(7);
  });

  it("does not render mobile account inactivity session policy control", () => {
    render(
      <MobileAccountCreateDrawer
        onCreateAccount={vi.fn()}
        onEmployeeNameDraftChange={vi.fn()}
        onNotify={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("combobox")).toHaveLength(3);
    expect(screen.queryByText(/automatic exit/i)).not.toBeInTheDocument();
  });

  it("creates a mobile account with the default temporary password flow", async () => {
    const user = userEvent.setup();
    const onCreateAccount = vi.fn();

    render(
      <MobileAccountCreateDrawer
        onCreateAccount={onCreateAccount}
        onEmployeeNameDraftChange={vi.fn()}
        onNotify={vi.fn()}
    />,
    );

    await user.type(screen.getByPlaceholderText("Введите логин (например, ivan.petrov)"), "mobile.test");
    await user.click(screen.getByRole("button", { name: "Создать аккаунт" }));

    expect(onCreateAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        bindEmployee: false,
        employee: "",
        employeeScope: "selected",
        login: "mobile.test",
        role: "Маршрутный обходчик",
        status: "Не привязан",
        temporaryPassword: true,
      }),
    );
  });

  it("shows employee limit validation in link account form", () => {
    render(
      <MobileAccountLinkPanel
        employeeDirectory={[
          {
            id: "employee-6",
            fullName: "Петров Петр Петрович",
            initials: "ПП",
            personnelNo: "006",
            position: "Оператор",
            department: "Служба обходов",
            employeeGroup: "",
            birthDate: "",
            zone: "Север",
            status: "\u0410\u043a\u0442\u0438\u0432\u0435\u043d",
            routesDone: 0,
            routesTotal: 0,
            mobileStatus: "\u041d\u0435 \u043f\u0440\u0438\u0432\u044f\u0437\u0430\u043d",
            lastSeen: "-",
            phone: "",
            hiredAt: "",
            brigade: "",
            shift: "День",
            leader: "",
            email: "",
          },
        ]}
        selected={{
          id: "1",
          login: "atom",
          passwordState: "Требует смены пароля",
          employee: "Иванов И.И.",
          employeeScope: "selected",
          boundEmployeeIds: ["employee-1", "employee-2", "employee-3", "employee-4", "employee-5"],
          boundEmployees: ["Иванов И.И.", "Петров П.П.", "Сидоров С.С.", "Кузнецова Е.А.", "Смирнов А.В."],
          role: "Маршрутный обходчик",
          status: "\u0410\u043a\u0442\u0438\u0432\u0435\u043d",
          session: "\u041e\u0444\u043b\u0430\u0439\u043d",
          lastSeen: "18.05.2026 12:00",
          device: "-",
          version: "-",
        }}
        onAttachEmployee={vi.fn()}
        onNotify={vi.fn()}
      />,
    );

    expect(screen.getAllByText((_, element) => element?.textContent?.includes("(5/5)") ?? false).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /^\+/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /\(5\)/ })).toBeEnabled();
  });

  it("filters mobile account rows by employee name", async () => {
    const user = userEvent.setup();

    render(
      <MobileAccountListPanel
        activePanel="create"
        accounts={[
          {
            id: "1",
            login: "atom",
            passwordState: "Требует смены пароля",
            employee: "Иванов Иван Иванович",
            employeeScope: "selected",
            boundEmployeeIds: ["employee-1"],
            boundEmployees: ["Иванов Иван Иванович"],
            role: "Маршрутный обходчик",
            status: "\u0410\u043a\u0442\u0438\u0432\u0435\u043d",
            session: "\u041e\u043d\u043b\u0430\u0439\u043d",
            lastSeen: "18.05.2026 15:24",
            device: "Xiaomi Redmi Note 12",
            version: "Android 13",
          },
          {
            id: "2",
            login: "mobile_02",
            passwordState: "Требует смены пароля",
            employee: "Петров Петр Петрович",
            employeeScope: "selected",
            boundEmployeeIds: ["employee-2"],
            boundEmployees: ["Петров Петр Петрович"],
            role: "Оператор",
            status: "\u0410\u043a\u0442\u0438\u0432\u0435\u043d",
            session: "\u041e\u0444\u043b\u0430\u0439\u043d",
            lastSeen: "18.05.2026 12:45",
            device: "Samsung Galaxy A54",
            version: "Android 14",
          },
        ]}
        mode="accounts"
        selectedAccountId="1"
        status="idle"
        onDeleteAccount={vi.fn()}
        onDetachEmployee={vi.fn()}
        onModeChange={vi.fn()}
        onNotify={vi.fn()}
        onOpenPanel={vi.fn()}
        onSelectAccount={vi.fn()}
        onToggleBlockAccount={vi.fn()}
      />,
    );

    await user.type(screen.getByPlaceholderText("\u041f\u043e\u0438\u0441\u043a \u043f\u043e \u043b\u043e\u0433\u0438\u043d\u0443 \u0438\u043b\u0438 \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u0443..."), "mobile_02");

    expect(screen.queryByText("atom")).not.toBeInTheDocument();
    expect(screen.getByText("mobile_02")).toBeInTheDocument();
  });
});

