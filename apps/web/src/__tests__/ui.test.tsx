import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MobileAccountCreateDrawer, MobileAccountLinkPanel } from "../components/accounts/MobileAccountCreateDrawer";
import { MobileAccountListPanel } from "../components/accounts/MobileAccountListPanel";
import { MobileAccountSecurityPanels } from "../components/accounts/MobileAccountSecurityPanels";
import { DashboardRequestsPanel } from "../components/dashboard/DashboardRequestsPanel";
import { SiteUserFormPanel } from "../components/site-users/SiteUserFormPanel";
import { Chip, EmptyState, ProgressBar } from "../components/ui";

describe("shared UI primitives", () => {
  it("renders chip content", () => {
    render(<Chip tone="green">Активен</Chip>);

    expect(screen.getByText("Активен")).toBeInTheDocument();
  });

  it("clamps progress bar width", () => {
    render(<ProgressBar value={125} />);

    const bar = screen.getByLabelText("Прогресс 125%");
    expect(bar.querySelector("span")).toHaveStyle({ width: "100%" });
  });

  it("renders empty state description", () => {
    render(<EmptyState title="Нет данных" description="Создайте первую запись" />);

    expect(screen.getByText("Нет данных")).toBeInTheDocument();
    expect(screen.getByText("Создайте первую запись")).toBeInTheDocument();
  });

  it("does not generate fixed site user password in the UI", async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();

    render(<SiteUserFormPanel onNotify={onNotify} />);

    await user.click(screen.getByText("Запросить сброс пароля"));

    expect(screen.queryByText("tmp-Patrol-360")).not.toBeInTheDocument();
    expect(screen.getByText("Пароль не генерируется в UI")).toBeInTheDocument();
    expect(onNotify).toHaveBeenCalledWith("Сброс пароля будет выполнен через backend");
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

    expect(screen.getByText("Заявки загружаются")).toBeInTheDocument();
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

    expect(screen.getByText("Заявки API не загружены")).toBeInTheDocument();
    expect(screen.getByText("Backend unavailable")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Повторить загрузку" }));

    expect(onRetry).toHaveBeenCalledOnce();
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

    expect(screen.getByText("Мобильные аккаунты загружаются")).toBeInTheDocument();
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

    expect(screen.getByText("Мобильные аккаунты API не загружены")).toBeInTheDocument();
    expect(screen.getByText("Accounts endpoint unavailable")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Повторить загрузку" }));

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

    await user.click(screen.getByRole("button", { name: "Обновить" }));

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

    expect(screen.getAllByRole("combobox")).toHaveLength(2);
    expect(screen.queryByText(/автоматический выход/i)).not.toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "Создать" }));

    expect(onCreateAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        bindEmployee: false,
        employee: "",
        employeeScope: "selected",
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
            zone: "Север",
            status: "Активен",
            routesDone: 0,
            routesTotal: 0,
            mobileStatus: "Не привязан",
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
          status: "Активен",
          session: "Офлайн",
          lastSeen: "18.05.2026 12:00",
          device: "-",
          version: "-",
        }}
        onAttachEmployee={vi.fn()}
        onNotify={vi.fn()}
      />,
    );

    expect(screen.getByText(/Лимит - 5 сотрудников/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Привязать" })).toBeDisabled();
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
            status: "Активен",
            session: "Онлайн",
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
            status: "Активен",
            session: "Офлайн",
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

    await user.type(screen.getByPlaceholderText("Поиск по логину или сотруднику..."), "петров");

    expect(screen.queryByText("atom")).not.toBeInTheDocument();
    expect(screen.getByText("mobile_02")).toBeInTheDocument();
  });
});
