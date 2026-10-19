import { useEffect, useRef, useState } from "react";
import type { InventoryPpeNormSetDetailDto } from "../../../api/contracts";
import { useInventoryRepository } from "../../../repositories/inventoryRepositoryContext";
import type { DraftLine } from "./documentWorkflow";
import { ppeErrorMessage } from "./ppeErrors";

type Mode = "current" | "select";
type NormTransitionLine = Pick<DraftLine, "id" | "normRowId" | "itemName" | "unitSymbol"> & { quantity: number | string };
export type NormChoice = { context: string; id: string; detail: InventoryPpeNormSetDetailDto | null; mode: Mode; removed: NormTransitionLine[] };
type Props = {
  contextKey: string; normSetId: string; enabled: boolean; canManage: boolean; lines: NormTransitionLine[];
  onCommit: (id: string, detail: InventoryPpeNormSetDetailDto | null, mode: Mode, removeMissing: boolean) => void;
};
/** A candidate norm never becomes part of a save payload before its contents are accepted. */
export function usePpeNormTransition(props: Props) {
  const repository = useInventoryRepository(), live = useRef(props); live.current = props;
  const revision = useRef(0), mounted = useRef(true), verified = useRef("");
  const context = useRef(props.contextKey);
  if (context.current !== props.contextKey) { context.current = props.contextKey; verified.current = ""; revision.current++; }
  const [verifiedKey, setVerifiedKey] = useState("");
  const [request, setRequest] = useState<{ context: string; id: string } | null>(null);
  const [choice, setChoice] = useState<NormChoice | null>(null);
  const [failure, setFailure] = useState<{ context: string; id: string; mode: Mode; message: string } | null>(null);
  const [notice, setNotice] = useState("");
  const currentKey = `${props.contextKey}|${props.normSetId}`;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; revision.current++; }; }, []);

  function commit(candidate: NormChoice) {
    if (candidate.context !== live.current.contextKey || !mounted.current) return false;
    if (candidate.mode === "select" && !live.current.canManage) return false;
    const key = `${candidate.context}|${candidate.id}`;
    verified.current = key; setVerifiedKey(key);
    setRequest(null); setChoice(null); setFailure(null); setNotice("");
    live.current.onCommit(candidate.id, candidate.detail, candidate.mode, live.current.canManage && candidate.removed.length > 0);
    return true;
  }
  async function load(id: string, mode: Mode) {
    if (mode === "select" && !live.current.canManage) return;
    const context = live.current.contextKey, token = ++revision.current;
    setRequest({ context, id }); setChoice(null); setFailure(null); setNotice("");
    const owns = () => mounted.current && token === revision.current && context === live.current.contextKey;
    try {
      const detail = id ? await repository.getPpeNormSet(id) : null;
      if (!owns()) return;
      if (detail && detail.normSet.id !== id) throw new Error("Сервер вернул состав другой нормы. Выбор и позиции сохранены.");
      const available = new Set(detail?.rows.filter(row => row.rowType === "item").map(row => row.id) ?? []);
      const candidate: NormChoice = { context, id, detail, mode, removed: live.current.lines.filter(line => !available.has(line.normRowId)) };
      if (candidate.removed.length && live.current.canManage) { setRequest(null); setChoice(candidate); }
      else commit(candidate);
    } catch (reason) {
      if (owns()) { setRequest(null); setFailure({ context, id, mode, message: ppeErrorMessage(reason, "Не удалось загрузить состав нормы. Текущий выбор сохранён.") }); }
    }
  }
  useEffect(() => {
    setRequest(null); setChoice(null); setFailure(null); setNotice("");
    if (!props.enabled || !props.normSetId) return;
    if (verified.current !== currentKey) void load(props.normSetId, "current");
    return () => { revision.current++; };
  // Other values are read from live so typing does not restart the request.
  }, [props.contextKey, props.normSetId, props.enabled, repository]);

  const activeChoice = choice?.context === props.contextKey ? choice : null;
  const activeRequest = request?.context === props.contextKey ? request : null;
  const activeFailure = failure?.context === props.contextKey ? failure : null;
  function select(id: string) {
    if (id === live.current.normSetId) {
      revision.current++; setRequest(null); setChoice(null); setFailure(null); setNotice("");
      if (verified.current !== `${live.current.contextKey}|${id}` && id) void load(id, "current");
      return;
    }
    void load(id, "select");
  }
  function decline() {
    revision.current++; setRequest(null); setChoice(null);
    setNotice(activeChoice?.mode === "current" ? "Актуальный состав не применён. Позиции черновика сохранены; перед записью проверьте норму повторно." : "Смена нормы отменена. Прежняя норма и выбранные позиции сохранены.");
  }
  function invalidate() { revision.current++; verified.current = ""; setVerifiedKey(""); setRequest(null); setChoice(null); setFailure(null); setNotice(""); }
  return {
    pending: Boolean(activeRequest || activeChoice), loading: Boolean(activeRequest), choice: activeChoice,
    displayId: activeChoice?.id ?? activeRequest?.id ?? props.normSetId,
    ready: !props.normSetId || verifiedKey === currentKey && verified.current === currentKey,
    error: activeFailure?.message ?? "", notice,
    select, decline, invalidate,
    accept: () => activeChoice ? commit(activeChoice) : false,
    retry: () => { void load(activeFailure?.id ?? live.current.normSetId, activeFailure?.mode ?? "current"); },
  };
}
