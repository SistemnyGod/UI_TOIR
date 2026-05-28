import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MobileAccountCreateDrawer, MobileAccountLinkPanel } from "../components/accounts/MobileAccountCreateDrawer";
import { MobileAccountListPanel } from "../components/accounts/MobileAccountListPanel";
import { MobileAccountSecurityPanels } from "../components/accounts/MobileAccountSecurityPanels";
import { DashboardRequestsPanel } from "../components/dashboard/DashboardRequestsPanel";
import { RequestCreateModal } from "../components/requests/RequestCreateModal";
import { SiteUserFormPanel } from "../components/site-users/SiteUserFormPanel";
import { Chip, EmptyState, ProgressBar } from "../components/ui";
import { LoginScreen } from "../screens/LoginScreen";

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
    render(<EmptyState title="No data" description="Create first record" />);

    expect(screen.getByText("No data")).toBeInTheDocument();
    expect(screen.getByText("Create first record")).toBeInTheDocument();
  });

  it("does not generate fixed site user password in the UI", async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();

    render(<SiteUserFormPanel onNotify={onNotify} />);

    await user.click(screen.getByText("\u0417\u0430\u043f\u0440\u043e\u0441\u0438\u0442\u044c \u0441\u0431\u0440\u043e\u0441 \u043f\u0430\u0440\u043e\u043b\u044f"));

    expect(screen.queryByText("tmp-Patrol-360")).not.toBeInTheDocument();
    expect(screen.getByText("\u041f\u0430\u0440\u043e\u043b\u044c \u043d\u0435 \u0433\u0435\u043d\u0435\u0440\u0438\u0440\u0443\u0435\u0442\u0441\u044f \u0432 UI")).toBeInTheDocument();
    expect(onNotify).toHaveBeenCalledWith("\u0421\u0431\u0440\u043e\u0441 \u043f\u0430\u0440\u043e\u043b\u044f \u0431\u0443\u0434\u0435\u0442 \u0432\u044b\u043f\u043e\u043b\u043d\u0435\u043d \u0447\u0435\u0440\u0435\u0437 backend");
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
            lastSeenAt: "2026-05-18T10:20:00Z",
          },
        ]}
        status="ready"
      />,
    );

    expect(screen.getByText("online")).toBeInTheDocument();
    expect(screen.getByText("Xiaomi / Android / 2.3.0")).toBeInTheDocument();
    expect(screen.getByText("Login accepted")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c" }));

    expect(onRefresh).toHaveBeenCalledOnce();
    expect(onNotify).not.toHaveBeenCalled();
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

  it("creates an unbound mobile account when employees are empty", async () => {
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
    await user.type(screen.getByPlaceholderText("Введите пароль"), "Password1");
    await user.type(screen.getByPlaceholderText("Повторите пароль"), "Password1");
    await user.selectOptions(screen.getByRole("combobox", { name: /Роль/ }), "Инспектор");
    await user.click(screen.getByRole("button", { name: "Создать аккаунт" }));

    expect(onCreateAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        bindEmployee: false,
        employee: "",
        employeeScope: "selected",
        login: "mobile.test",
        password: "Password1",
        role: "Инспектор",
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
