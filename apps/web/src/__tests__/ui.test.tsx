import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
});
