import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePpeDocumentFiles } from "../features/inventory/ppe/usePpeDocumentFiles";
import { PreparedPdf } from "../features/inventory/ppe/PreparedPdf";
import { createMockInventoryRepository } from "../repositories/mockInventoryRepository";
import { downloadPpeFile } from "../features/inventory/ppe/downloadPpeFile";
import type { ApiFileResponse } from "../api/client";
vi.mock("../features/inventory/ppe/downloadPpeFile", () => ({ downloadPpeFile: vi.fn() }));
type File = ApiFileResponse;
function file(): File { return { blob: new Blob(["%PDF-1.4 UI fixture"], { type: "application/pdf" }), downloadName: "ppe.pdf", fileName: "ppe.pdf", contentType: "application/pdf", headers: {} }; }
function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
let create: ReturnType<typeof vi.fn<(obj: Blob | MediaSource) => string>>, revoke: ReturnType<typeof vi.fn<(url: string) => void>>;
beforeEach(() => { let id = 0; create = vi.fn(() => "blob:pdf-" + (++id)); revoke = vi.fn(); vi.stubGlobal("URL", class extends URL { static createObjectURL = create; static revokeObjectURL = revoke; }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); vi.useRealTimers(); });
describe("PPE document file ownership and pending state", () => {
  it("locks duplicate preview and download actions until the actual response", async () => {
    const repository = createMockInventoryRepository(), gate = deferred<File>(), print = vi.spyOn(repository, "printPpeIssueDocument").mockReturnValue(gate.promise);
    const { result } = renderHook(() => usePpeDocumentFiles(repository, "owner:document:1", "document", true)); let pending!: Promise<boolean>;
    act(() => { pending = result.current.prepare("both"); }); expect(result.current.pendingAction).toBe("preview:both");
    await act(async () => { expect(await result.current.prepare("both")).toBe(false); expect(await result.current.download("norms", "docx")).toBe(false); }); expect(print).toHaveBeenCalledOnce();
    await act(async () => { gate.resolve(file()); expect(await pending).toBe(true); }); expect(result.current.url).toBe("blob:pdf-1"); expect(result.current.pendingAction).toBe(""); expect(result.current.type).toBe("both");
  });
  it("retains the previous PDF when replacement fails and replaces it only after a successful retry", async () => {
    const repository = createMockInventoryRepository(), print = vi.spyOn(repository, "printPpeIssueDocument").mockResolvedValue(file());
    const { result } = renderHook(() => usePpeDocumentFiles(repository, "context", "document", true)); await act(async () => result.current.prepare("norms")); print.mockRejectedValueOnce(new Error("Конвертер недоступен"));
    await act(async () => result.current.prepare("both")); expect(result.current.error).toBe("Конвертер недоступен"); expect(result.current.url).toBe("blob:pdf-1"); expect(result.current.type).toBe("norms"); expect(revoke).not.toHaveBeenCalled();
    await act(async () => result.current.prepare("both")); expect(result.current.url).toBe("blob:pdf-2"); expect(result.current.type).toBe("both"); expect(result.current.error).toBe(""); expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:pdf-1");
  });
  for (const action of ["preview", "download"] as const) it(`ignores a late ${action} from another document snapshot without unlocking a newer request`, async () => {
    const repository = createMockInventoryRepository(), old = deferred<File>(), next = deferred<File>(); vi.spyOn(repository, "printPpeIssueDocument").mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const { result, rerender } = renderHook(({ context, id }) => usePpeDocumentFiles(repository, context, id, true), { initialProps: { context: "old", id: "document-a" } }); let oldPromise!: Promise<boolean>, nextPromise!: Promise<boolean>;
    act(() => { oldPromise = action === "preview" ? result.current.prepare("norms") : result.current.download("norms", "pdf"); }); rerender({ context: "next", id: "document-b" }); act(() => { nextPromise = result.current.prepare("both"); });
    await act(async () => { old.resolve(file()); expect(await oldPromise).toBe(false); }); expect(result.current.pendingAction).toBe("preview:both"); expect(create).not.toHaveBeenCalled(); expect(downloadPpeFile).not.toHaveBeenCalled();
    await act(async () => { next.resolve(file()); expect(await nextPromise).toBe(true); }); expect(result.current.url).toBe("blob:pdf-1");
  });
  it("does not show another document's late error or download its file after unmount", async () => {
    const repository = createMockInventoryRepository(), gate = deferred<File>(); vi.spyOn(repository, "printPpeIssueDocument").mockReturnValue(gate.promise);
    const { result, unmount } = renderHook(() => usePpeDocumentFiles(repository, "context", "document", true)); let pending!: Promise<boolean>; act(() => { pending = result.current.download("norms", "pdf"); }); unmount(); await act(async () => { gate.reject(new Error("Old failure")); expect(await pending).toBe(false); }); expect(downloadPpeFile).not.toHaveBeenCalled();
  });
  it("revokes the prepared URL when the snapshot changes and when export permission is removed", async () => {
    const repository = createMockInventoryRepository(); vi.spyOn(repository, "printPpeIssueDocument").mockResolvedValue(file());
    const { result, rerender } = renderHook(({ context, allowed }) => usePpeDocumentFiles(repository, context, "document", allowed), { initialProps: { context: "version-1", allowed: true } }); await act(async () => result.current.prepare("norms")); rerender({ context: "version-2", allowed: true }); expect(result.current.url).toBe(""); expect(revoke).toHaveBeenCalledWith("blob:pdf-1");
    await act(async () => result.current.prepare("norms")); rerender({ context: "no-export", allowed: false }); expect(result.current.url).toBe(""); expect(revoke).toHaveBeenCalledWith("blob:pdf-2"); await act(async () => { expect(await result.current.prepare("norms")).toBe(false); });
  });
  it("does not revoke the current PDF if creation of the replacement URL fails", async () => {
    const repository = createMockInventoryRepository(); vi.spyOn(repository, "printPpeIssueDocument").mockResolvedValue(file()); const { result } = renderHook(() => usePpeDocumentFiles(repository, "context", "document", true)); await act(async () => result.current.prepare("norms")); create.mockImplementationOnce(() => { throw new Error("Memory limit"); }); await act(async () => result.current.prepare("both")); expect(result.current.url).toBe("blob:pdf-1"); expect(revoke).not.toHaveBeenCalled(); expect(result.current.pendingAction).toBe(""); expect(result.current.error).toContain("Не удалось открыть подготовленный PDF");
  });
  it("rejects an empty or JSON response instead of presenting it as PDF", async () => {
    const repository = createMockInventoryRepository(); vi.spyOn(repository, "printPpeIssueDocument").mockResolvedValueOnce({ ...file(), blob: new Blob([]), downloadName: "empty.pdf" }).mockResolvedValueOnce({ ...file(), blob: new Blob(["{}"], { type: "application/json" }), downloadName: "error.pdf" }); const { result } = renderHook(() => usePpeDocumentFiles(repository, "context", "document", true));
    await act(async () => result.current.prepare("norms")); expect(result.current.error).toContain("не вернул готовый файл"); await act(async () => result.current.download("norms", "pdf")); expect(create).not.toHaveBeenCalled(); expect(downloadPpeFile).not.toHaveBeenCalled();
  });
});
describe("prepared browser PDF", () => {
  it("enables printing after load and explains a browser print failure with a direct download", () => {
    render(<PreparedPdf url="blob:pdf" downloadName="saved.pdf" label="Обе формы" />); const print = screen.getByRole("button", { name: "Печать подготовленного PDF" }), frame = screen.getByTitle("Печатный PDF") as HTMLIFrameElement;
    expect(print).toBeDisabled(); const printWindow = { focus: vi.fn(), print: vi.fn(() => { throw new Error("Plugin unavailable"); }) }; Object.defineProperty(frame, "contentWindow", { value: printWindow }); fireEvent.load(frame); expect(print).toBeEnabled(); fireEvent.click(print); expect(screen.getByRole("alert")).toHaveTextContent("Браузер не открыл печать PDF"); expect(screen.getByRole("link", { name: "Скачать подготовленный PDF" })).toHaveAttribute("download", "saved.pdf");
  });
  it("offers a readable fallback when iframe loading fails", () => { render(<PreparedPdf url="blob:pdf" downloadName="saved.pdf" label="Форма" />); fireEvent.error(screen.getByTitle("Печатный PDF")); expect(screen.getByRole("alert")).toHaveTextContent("можно скачать"); expect(screen.getByRole("button", { name: "Печать подготовленного PDF" })).toBeDisabled(); });
  it("ends indefinite viewer loading with a download fallback and allows a late successful load", async () => { vi.useFakeTimers(); render(<PreparedPdf url="blob:pdf" downloadName="saved.pdf" label="Форма" />); await act(async () => vi.advanceTimersByTimeAsync(20000)); expect(screen.getByRole("alert")).toHaveTextContent("не ответил"); fireEvent.load(screen.getByTitle("Печатный PDF")); expect(screen.queryByRole("alert")).not.toBeInTheDocument(); expect(screen.getByRole("button", { name: "Печать подготовленного PDF" })).toBeEnabled(); });
});
