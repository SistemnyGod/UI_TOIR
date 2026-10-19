import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CompactTable } from "../shared/ui/CompactTable";

it("does not activate a row when keyboard or double click targets its action", () => {
  const select = vi.fn();
  const open = vi.fn();
  render(<CompactTable columns={[{ key: "action", header: "Действия", render: () => <button>Открыть</button> }]} rows={[{ id: "1" }]} getRowKey={(row) => row.id} onRowClick={select} onRowDoubleClick={open} />);
  const button = screen.getByRole("button", { name: "Открыть" });
  fireEvent.keyDown(button, { key: "Enter" });
  fireEvent.keyDown(button, { key: " " });
  fireEvent.doubleClick(button);
  expect(select).not.toHaveBeenCalled();
  expect(open).not.toHaveBeenCalled();
  fireEvent.keyDown(button.closest("tr")!, { key: "Enter" });
  expect(select).toHaveBeenCalledOnce();
});

it("retains the same row during refresh and reports a failed refresh without replacing it", () => {
  const props = { columns: [{ key: "name", header: "Название", render: (row: { id: string }) => row.id }], rows: [{ id: "Сохранённая строка" }], getRowKey: (row: { id: string }) => row.id };
  const { rerender } = render(<CompactTable {...props} />);
  const row = screen.getByText("Сохранённая строка").closest("tr");
  rerender(<CompactTable {...props} loading />);
  expect(screen.getByText("Сохранённая строка").closest("tr")).toBe(row);
  expect(screen.getByRole("status")).toHaveTextContent("Обновляем данные");
  rerender(<CompactTable {...props} error="Не удалось обновить" />);
  expect(screen.getByText("Сохранённая строка").closest("tr")).toBe(row);
  expect(screen.getByRole("alert")).toHaveTextContent("Не удалось обновить");
});
