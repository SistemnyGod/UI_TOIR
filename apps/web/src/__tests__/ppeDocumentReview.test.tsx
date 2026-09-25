import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DocumentReview } from "../features/inventory/ppe/DocumentReview";

const document = {
  id: "document", version: 1, status: "draft", createdAt: "2026-09-14T00:00:00Z", confirmedAt: null,
  content: {
    employee: { id: "employee", fullName: "Иванов Иван Иванович", personnelNo: "42", department: "Цех", position: "Электромонтер", details: { gender: "муж.", height: "180", clothingSize: "52", shoeSize: "43", headSize: "58", respiratorSize: "M", handProtectionSize: "10" } },
    normSetId: "norm", normSetVersion: 1, normVersionName: "2026", normSourceName: "Нормы", documentDate: "2026-09-14", responsibleName: "Петров П.П.", basis: "Приказ", normRows: [], lines: [],
  },
  validation: { errors: [], warnings: [], entitlements: [], totalMinor: 0 },
} as never;

describe("PPE document review printing", () => {
  it("prepares the selected form or both forms without confirming the issue", async () => {
    const onPreview = vi.fn();
    const onConfirm = vi.fn();
    const confirmDialog = vi.spyOn(window, "confirm");
    render(<DocumentReview busy={false} canExport canManage document={document} hasErrors={false} previewType="norms" previewUrl="" onPreview={onPreview} onConfirm={onConfirm} onDownload={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Подготовить выбранную форму" }));
    await userEvent.click(screen.getByRole("button", { name: "Подготовить обе формы" }));

    expect(onPreview.mock.calls).toEqual([["norms"], ["both"]]);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(confirmDialog).not.toHaveBeenCalled();
  });
});
