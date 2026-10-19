import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiFileResponse } from "../../../api/client";
import { downloadResultAttachment, isBackendResultId } from "../../../repositories/resultsRepository";
import type { DataSourceMode, PatrolResult, PatrolResultAttachment } from "../../../types";
import type { ResultMediaPreviewState } from "./ResultMediaViewer";

interface ResultPreviewOptions {
  ownerKey: string;
  dataSourceMode: DataSourceMode;
  openGroupId: string | null;
  repository: { getResult(id: string): Promise<PatrolResult> };
  addToast?: (message: string, kind?: "success" | "error" | "info") => void;
}

/** The report preview owns its detail cache, pending requests and open media. */
export function useResultPreview({ ownerKey, dataSourceMode, openGroupId, repository, addToast }: ResultPreviewOptions) {
  const [detailedResults, setDetailedResults] = useState<Record<string, PatrolResult>>({});
  const [detailLoadErrors, setDetailLoadErrors] = useState<Record<string, string>>({});
  const [photoLoadingResultId, setPhotoLoadingResultId] = useState<string | null>(null);
  const [mediaPreview, setMediaPreview] = useState<ResultMediaPreviewState | null>(null);
  const mediaTriggerRef = useRef<HTMLElement | null>(null);
  const detailsRef = useRef(detailedResults);
  detailsRef.current = detailedResults;
  const detailRequestsRef = useRef(new Map<string, Promise<PatrolResult>>());
  const ownerRef = useRef(ownerKey);
  ownerRef.current = ownerKey;
  const previousOwnerRef = useRef(ownerKey);
  const openGroupRef = useRef(openGroupId);
  openGroupRef.current = openGroupId;
  const mediaRequestRef = useRef(0);

  const cancelPendingMedia = useCallback(() => {
    mediaRequestRef.current += 1;
    setPhotoLoadingResultId(null);
  }, []);

  useEffect(() => {
    if (previousOwnerRef.current === ownerKey) return;
    previousOwnerRef.current = ownerKey;
    mediaRequestRef.current += 1;
    detailRequestsRef.current.clear();
    detailsRef.current = {};
    setDetailedResults({});
    setDetailLoadErrors({});
    setMediaPreview(null);
    setPhotoLoadingResultId(null);
  }, [ownerKey]);

  useEffect(() => {
    ownerRef.current = ownerKey;
    return () => { ownerRef.current = "unmounted"; mediaRequestRef.current += 1; };
  }, [ownerKey]);

  const loadResultDetails = useCallback(async (result: PatrolResult) => {
    if (ownerKey !== ownerRef.current) return result;
    const cached = detailsRef.current[result.id];
    if (cached?.attachments !== undefined) return cached;
    if (result.attachments !== undefined || dataSourceMode !== "api" || !isBackendResultId(result.id)) return result;

    const inFlight = detailRequestsRef.current.get(result.id);
    if (inFlight) return inFlight;

    setDetailLoadErrors(current => {
      if (!current[result.id]) return current;
      const next = { ...current };
      delete next[result.id];
      return next;
    });
    const request = repository.getResult(result.id)
      .then(detailed => {
        if (ownerKey === ownerRef.current) setDetailedResults(current => ({ ...current, [detailed.id]: detailed }));
        return detailed;
      })
      .catch(error => {
        if (ownerKey === ownerRef.current) setDetailLoadErrors(current => ({ ...current, [result.id]: "Не удалось получить детали точки. Повторите загрузку." }));
        throw error;
      })
      .finally(() => {
        if (detailRequestsRef.current.get(result.id) === request) detailRequestsRef.current.delete(result.id);
      });
    detailRequestsRef.current.set(result.id, request);
    return request;
  }, [ownerKey, dataSourceMode, repository]);

  const forgetDetails = useCallback((results: readonly PatrolResult[]) => {
    setDetailedResults(current => {
      const next = { ...current };
      results.forEach(result => delete next[result.id]);
      return next;
    });
  }, []);

  const openAttachment = useCallback(async (result: PatrolResult, order?: number, attachmentIndex = 0) => {
    const requestId = ++mediaRequestRef.current;
    const isCurrent = () => ownerKey === ownerRef.current && openGroupId === openGroupRef.current && requestId === mediaRequestRef.current;
    setPhotoLoadingResultId(result.id);
    try {
      const detailed = await loadResultDetails(result);
      if (!isCurrent()) return;
      const attachments = detailed.attachments ?? [];
      if (attachments.length === 0) {
        addToast?.("Для этой точки нет вложений", "info");
        return;
      }
      setMediaPreview({ result: detailed, attachments, index: Math.max(0, Math.min(attachmentIndex, attachments.length - 1)), order });
    } catch (error) {
      if (!isCurrent()) return;
      const message = error instanceof Error ? error.message : "не удалось открыть вложение";
      addToast?.(`Не удалось открыть вложение: ${message}`, "error");
    } finally {
      if (requestId === mediaRequestRef.current) setPhotoLoadingResultId(null);
    }
  }, [ownerKey, openGroupId, loadResultDetails, addToast]);

  const closeMedia = useCallback(() => {
    cancelPendingMedia();
    setMediaPreview(null);
  }, [cancelPendingMedia]);

  const selectAttachment = useCallback((index: number) => {
    cancelPendingMedia();
    setMediaPreview(current => current ? { ...current, index } : current);
  }, [cancelPendingMedia]);

  const downloadPreviewAttachment = useCallback(async (attachment: PatrolResultAttachment, readyFile?: ApiFileResponse) => {
    try {
      if (ownerKey !== ownerRef.current) return;
      const file = readyFile ?? await downloadResultAttachment(attachment);
      if (ownerKey !== ownerRef.current) return;
      const href = URL.createObjectURL(file.blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = file.fileName || attachment.fileName || "patrol-result-attachment";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    } catch (error) {
      if (ownerKey !== ownerRef.current) return;
      const message = error instanceof Error ? error.message : "не удалось скачать вложение";
      addToast?.(`Не удалось скачать вложение: ${message}`, "error");
    }
  }, [ownerKey, addToast]);

  return {
    detailedResults, detailLoadErrors, loadResultDetails, forgetDetails,
    mediaPreview, photoLoadingResultId, mediaTriggerRef,
    openAttachment, closeMedia, selectAttachment, cancelPendingMedia, downloadPreviewAttachment,
  };
}

/** Bound concurrent point requests; one failure does not stop the other points. */
export async function mapWithConcurrency<T>(items: readonly T[], concurrency: number, load: (item: T) => Promise<unknown>): Promise<void> {
  const limit = Math.max(1, Math.min(concurrency, items.length));
  let cursor = 0;
  let firstError: unknown;
  async function worker() {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      try { await load(item); } catch (error) { firstError ??= error; }
    }
  }
  await Promise.all(Array.from({ length: limit }, () => worker()));
  if (firstError) throw firstError;
}
