import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
