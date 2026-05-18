import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MobileAccountListPanel } from "../components/accounts/MobileAccountListPanel";
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
        accounts={[]}
        employeeName=""
        mode="accounts"
        selectedAccountId=""
        status="loading"
        onAttachEmployee={vi.fn()}
        onDeleteAccount={vi.fn()}
        onModeChange={vi.fn()}
        onNotify={vi.fn()}
        onResetPassword={vi.fn()}
        onSelectAccount={vi.fn()}
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
        accounts={[]}
        employeeName=""
        errorMessage="Accounts endpoint unavailable"
        mode="accounts"
        selectedAccountId=""
        status="error"
        onAttachEmployee={vi.fn()}
        onDeleteAccount={vi.fn()}
        onModeChange={vi.fn()}
        onNotify={vi.fn()}
        onResetPassword={vi.fn()}
        onRetry={onRetry}
        onSelectAccount={vi.fn()}
      />,
    );

    expect(screen.getByText("Мобильные аккаунты API не загружены")).toBeInTheDocument();
    expect(screen.getByText("Accounts endpoint unavailable")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Повторить загрузку" }));

    expect(onRetry).toHaveBeenCalledOnce();
  });
});
