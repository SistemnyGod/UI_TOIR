import { act, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResultDetailDrawer } from "../features/patrol/components/results/ResultDetailDrawer";
import type { PatrolResult } from "../types";

const mocks = vi.hoisted(() => ({
  downloadResultAttachment: vi.fn(),
}));

vi.mock("../repositories/resultsRepository", () => ({
  downloadResultAttachment: mocks.downloadResultAttachment,
}));

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

afterEach(() => {
  mocks.downloadResultAttachment.mockReset();
  restoreUrlApi("createObjectURL", originalCreateObjectURL);
  restoreUrlApi("revokeObjectURL", originalRevokeObjectURL);
});

describe("ResultDetailDrawer attachment previews", () => {
  it("revokes preview object URLs on unmount", async () => {
    const createObjectURL = vi.fn(() => "blob:preview");
    const revokeObjectURL = vi.fn();
    stubUrlApi("createObjectURL", createObjectURL);
    stubUrlApi("revokeObjectURL", revokeObjectURL);
    mocks.downloadResultAttachment.mockResolvedValue(createFileResponse());

    const { container, unmount } = renderDrawer();

    await waitFor(() => {
      expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:preview");
    });

    unmount();

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });

  it("does not create a preview object URL after unmount", async () => {
    const createObjectURL = vi.fn(() => "blob:late-preview");
    const revokeObjectURL = vi.fn();
    let resolveDownload: (value: ReturnType<typeof createFileResponse>) => void = () => undefined;
    const downloadPromise = new Promise<ReturnType<typeof createFileResponse>>((resolve) => {
      resolveDownload = resolve;
    });
    stubUrlApi("createObjectURL", createObjectURL);
    stubUrlApi("revokeObjectURL", revokeObjectURL);
    mocks.downloadResultAttachment.mockReturnValue(downloadPromise);

    const { unmount } = renderDrawer();
    expect(mocks.downloadResultAttachment).toHaveBeenCalledTimes(1);

    unmount();
    await act(async () => {
      resolveDownload(createFileResponse());
      await downloadPromise;
    });

    expect(createObjectURL).not.toHaveBeenCalled();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });
});

function renderDrawer(result = createResult()) {
  return render(
    <ResultDetailDrawer
      onCreateRequest={vi.fn()}
      onNavigate={vi.fn()}
      onNotify={vi.fn()}
      onOpenRequest={vi.fn()}
      result={result}
    />,
  );
}

function createFileResponse() {
  return {
    blob: new Blob(["image"], { type: "image/jpeg" }),
    contentDisposition: "",
    contentType: "image/jpeg",
    fileName: "photo.jpg",
  };
}

function createResult(): PatrolResult {
  return {
    actualAt: "01.07.2026, 08:05",
    attachments: [
      {
        contentType: "image/jpeg",
        createdAt: "01.07.2026, 08:05",
        downloadUrl: "/api/v1/results/result-1/attachments/attachment-1",
        fileName: "photo.jpg",
        id: "attachment-1",
        sizeBytes: 1024,
      },
    ],
    chronology: ["created"],
    comment: "No issues",
    deviation: "+5m",
    employee: "Employee",
    employeeId: "employee-1",
    id: "result-1",
    issueType: "none",
    photos: 1,
    plannedAt: "01.07.2026, 08:00",
    point: "Point",
    pointId: "point-1",
    route: "Route",
    routeId: "route-1",
    severity: "-",
    shift: "День",
    source: "mobile",
    status: "Подтверждено",
    territory: "Territory",
  };
}

function stubUrlApi(key: "createObjectURL" | "revokeObjectURL", value: typeof URL.createObjectURL | typeof URL.revokeObjectURL) {
  Object.defineProperty(URL, key, {
    configurable: true,
    value,
    writable: true,
  });
}

function restoreUrlApi(key: "createObjectURL" | "revokeObjectURL", value: typeof URL.createObjectURL | typeof URL.revokeObjectURL) {
  if (value) {
    stubUrlApi(key, value);
  } else {
    Reflect.deleteProperty(URL, key);
  }
}
