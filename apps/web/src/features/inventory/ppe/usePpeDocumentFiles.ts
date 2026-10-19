import { useEffect, useRef, useState } from "react";
import type { InventoryRepository } from "../../../repositories/inventoryRepository";
import { downloadPpeFile } from "./downloadPpeFile";
import { ppeErrorMessage } from "./ppeErrors";

export type PpePrintKind = "norms" | "signature" | "both";
type FileState = { context: string; url: string; type: PpePrintKind; downloadName: string; pendingAction: string; error: string };
const empty = (context: string): FileState => ({ context, url: "", type: "norms", downloadName: "", pendingAction: "", error: "" });

/** Export is read-only; responses and blob URLs belong to one exact document snapshot. */
export function usePpeDocumentFiles(repository: InventoryRepository, context: string, documentId: string | undefined, canExport: boolean) {
  const [state, setState] = useState(() => empty(context));
  const current = useRef({ repository, context, documentId, canExport });
  current.current = { repository, context, documentId, canExport };
  const mounted = useRef(true), url = useRef("");
  const inFlight = useRef<object | null>(null);
  useEffect(() => {
    mounted.current = true; inFlight.current = null;
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = ""; setState(empty(context));
    return () => {
      mounted.current = false; inFlight.current = null;
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = "";
    };
  }, [repository, context]);
  async function execute(type: PpePrintKind, format: "pdf" | "docx", preview: boolean) {
    if (!documentId || !canExport || inFlight.current) return false;
    const token = {}; inFlight.current = token;
    const owns = () => mounted.current && inFlight.current === token && current.current.repository === repository && current.current.context === context && current.current.documentId === documentId && current.current.canExport;
    setState(old => ({ ...(old.context === context ? old : empty(context)), pendingAction: preview ? `preview:${type}` : `download:${type}:${format}`, error: "" }));
    try {
      const file = await repository.printPpeIssueDocument(documentId, type, format);
      if (!owns()) return false;
      if (!file.blob.size || format === "pdf" && file.blob.type && !["application/pdf", "application/x-pdf", "application/octet-stream"].includes(file.blob.type.split(";")[0].toLowerCase()))
        throw new Error("Сервер не вернул готовый файл. Повторите подготовку документа.");
      if (preview) {
        let next: string;
        try { next = URL.createObjectURL(file.blob); }
        catch { throw new Error("Не удалось открыть подготовленный PDF в браузере. Повторите подготовку или скачайте файл."); }
        if (url.current) URL.revokeObjectURL(url.current);
        url.current = next;
        setState(old => ({ ...old, url: next, type, downloadName: file.downloadName }));
      } else {
        try { downloadPpeFile(file.blob, file.downloadName); }
        catch { throw new Error("Не удалось начать скачивание. Проверьте разрешения браузера и повторите попытку."); }
      }
      return true;
    } catch (reason) {
      if (owns()) setState(old => ({ ...old, error: ppeErrorMessage(reason, "Не удалось подготовить файл. Повторите попытку.") }));
      return false;
    } finally {
      if (owns()) { inFlight.current = null; setState(old => ({ ...old, pendingAction: "" })); }
    }
  }
  const visible = state.context === context && canExport ? state : empty(context);
  return { ...visible, prepare: (type: PpePrintKind) => execute(type, "pdf", true), download: (type: PpePrintKind, format: "pdf" | "docx") => execute(type, format, false) };
}
