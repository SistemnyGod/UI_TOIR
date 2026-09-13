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
