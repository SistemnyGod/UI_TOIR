import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiFileResponse } from "../api/client";
import type { PatrolResultAttachment } from "../types";
import { useAttachmentPreview } from "../features/patrol/results/useAttachmentPreview";

const download = vi.hoisted(() => vi.fn());
vi.mock("../repositories/resultsRepository", () => ({ downloadResultAttachment: download }));
const attachment = (id: string): PatrolResultAttachment => ({ id, downloadUrl: `/file/${id}`, contentType: "image/jpeg", fileName: `${id}.jpg`, sizeBytes: 100, createdAt: "2026-10-17" });
const file: ApiFileResponse = { blob: new Blob(["photo"]), fileName: "original.jpg", downloadName: "original.jpg", contentType: "image/jpeg", headers: {} };
beforeEach(() => { download.mockResolvedValue(file); vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:photo"), revokeObjectURL: vi.fn() }); });
afterEach(() => { cleanup(); download.mockReset(); vi.unstubAllGlobals(); });

describe("attachment request ownership", () => {
  it("aborts a file on selection change and aborts the next file on close", async () => {
    download.mockImplementation(() => new Promise(() => {}));
    const view = renderHook(({ item }) => useAttachmentPreview(item), { initialProps: { item: attachment("one") } });
    const firstSignal = download.mock.calls[0][1].signal as AbortSignal;
    view.rerender({ item: attachment("two") });
    expect(firstSignal.aborted).toBe(true);
    const nextSignal = download.mock.calls[1][1].signal as AbortSignal;
    expect(nextSignal.aborted).toBe(false);
    view.unmount(); expect(nextSignal.aborted).toBe(true);
  });

  it("ignores a late decoder failure even after returning to the same file", async () => {
    const view = renderHook(({ item }) => useAttachmentPreview(item), { initialProps: { item: attachment("one") } });
    await waitFor(() => expect(view.result.current.url).toBe("blob:photo"));
    const oldFailure = view.result.current.fail;
    view.rerender({ item: attachment("two") });
    await waitFor(() => expect(view.result.current.file).toBe(file));
    view.rerender({ item: attachment("one") });
    await waitFor(() => expect(view.result.current.file).toBe(file));
    act(() => oldFailure("Ошибка старого изображения"));
    expect(view.result.current.url).toBe("blob:photo"); expect(view.result.current.error).toBe("");
  });

  it("retries decoding, releases the URL and keeps the original blob available for download", async () => {
    const view = renderHook(() => useAttachmentPreview(attachment("one")));
    await waitFor(() => expect(view.result.current.file).toBe(file));
    const staleFailure = view.result.current.fail;
    act(() => view.result.current.fail("Не удалось открыть изображение"));
    expect(view.result.current.error).toContain("изображение"); expect(view.result.current.file).toBe(file);
    act(() => view.result.current.retry());
    await waitFor(() => expect(download).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(view.result.current.file).toBe(file));
    act(() => staleFailure("Поздняя ошибка"));
    expect(view.result.current.error).toBe(""); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:photo");
  });

  it("does not start another request when only the point comment is refreshed", async () => {
    const view = renderHook(({ item }) => useAttachmentPreview(item), { initialProps: { item: attachment("one") } });
    await waitFor(() => expect(view.result.current.file).toBe(file));
    view.rerender({ item: { ...attachment("one") } });
    expect(download).toHaveBeenCalledTimes(1);
  });
});
