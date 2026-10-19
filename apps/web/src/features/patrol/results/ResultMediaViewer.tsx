import { useEffect, useId, useRef, useState } from "react";
import type { RefObject } from "react";
import type { ApiFileResponse } from "../../../api/client";
import { ChevronLeft, ChevronRight, Download, FileText, Image as ImageIcon, Maximize2, MessageSquare, Minimize2, PanelRightClose, PanelRightOpen, Video } from "lucide-react";
import { ModalShell } from "../../../shared/ui";
import type { PatrolResult, PatrolResultAttachment } from "../../../types";
import { resultDateTime } from "./resultPresentation";
import { attachmentKind, attachmentSize, isImageAttachment, isVideoAttachment } from "./resultMedia";
import { useAttachmentPreview } from "./useAttachmentPreview";
import { ResultAttachmentStage } from "./ResultAttachmentStage";
import { ResultMediaContext } from "./ResultMediaContext";
export { isImageAttachment, isVideoAttachment } from "./resultMedia";

export interface ResultMediaPreviewState {
  result: PatrolResult;
  attachments: PatrolResultAttachment[];
  index: number;
  order?: number;
}
interface ResultMediaViewerProps {
  preview: ResultMediaPreviewState;
  onClose: () => void;
  onDownload: (attachment: PatrolResultAttachment, readyFile?: ApiFileResponse) => void | Promise<void>;
  onSelect: (index: number) => void;
  onPreviousPoint?: () => void;
  onNextPoint?: () => void;
  pointPosition?: { current: number; total: number };
  pointLoading?: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export function ResultMediaViewer({ preview, onClose, onDownload, onSelect, returnFocusRef, onPreviousPoint, onNextPoint, pointPosition, pointLoading = false }: ResultMediaViewerProps) {
  const index = Math.max(0, Math.min(preview.index, preview.attachments.length - 1));
  const attachment = preview.attachments[index];
  const { url, error, retry, fail, file } = useAttachmentPreview(attachment);
  const downloadLock = useRef(false);
  const mounted = useRef(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function downloadOriginal() {
    if (downloadLock.current || !attachment) return;
    downloadLock.current = true; setDownloading(true); setDownloadError("");
    try { await onDownload(attachment, file); }
    catch { if (mounted.current) setDownloadError("Не удалось скачать файл. Повторите попытку."); }
    finally { downloadLock.current = false; if (mounted.current) setDownloading(false); }
  }
  const bodyRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLElement>(null);
  const contextRef = useRef<HTMLElement>(null);
  const contextId = useId();
  const scrollToContextRef = useRef(false);
  const [compact, setCompact] = useState(() => Boolean(typeof window !== "undefined" && window.matchMedia?.("(max-width: 760px)").matches));
  const [contextExpanded, setContextExpanded] = useState(() => typeof window === "undefined" || !window.matchMedia?.("(max-width: 760px)").matches);
  const [windowExpanded, setWindowExpanded] = useState(false);
  const time = resultDateTime(preview.result.actualAt);
  useEffect(() => {
    function navigate(event: KeyboardEvent) {
      const dialog = bodyRef.current?.closest('[role="dialog"]');
      if (pointLoading || event.defaultPrevented || !dialog?.contains(document.activeElement) || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || (event.target as HTMLElement)?.closest("input, textarea, select, video")) return;
      const next = event.key === "ArrowLeft" ? index - 1 : event.key === "ArrowRight" ? index + 1 : -1;
      if (next < 0 || next >= preview.attachments.length) return;
      event.preventDefault(); onSelect(next);
    }
    window.addEventListener("keydown", navigate);
    return () => window.removeEventListener("keydown", navigate);
  }, [index, preview.attachments.length, onSelect, pointLoading]);
  useEffect(() => {
    const query = window.matchMedia?.("(max-width: 760px)");
    if (!query) return;
    const update = () => { scrollToContextRef.current = false; setCompact(query.matches); setContextExpanded(!query.matches); };
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  useEffect(() => {
    if (!scrollToContextRef.current || !contextExpanded) return;
    scrollToContextRef.current = false;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    contextRef.current?.scrollIntoView?.({ block: "nearest", behavior: reducedMotion ? "instant" : "smooth" });
  }, [contextExpanded]);
  function toggleContext() {
    scrollToContextRef.current = compact && !contextExpanded;
    setContextExpanded(!contextExpanded);
  }
  useEffect(() => {
    const strip = stripRef.current;
    const button = strip?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!strip || !button) return;
    if (button.offsetLeft < strip.scrollLeft) strip.scrollLeft = button.offsetLeft;
    else if (button.offsetLeft + button.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = button.offsetLeft + button.offsetWidth - strip.clientWidth;
  }, [index, attachment?.id]);
  if (!attachment) return null;

  const ContextIcon = compact ? MessageSquare : contextExpanded ? PanelRightClose : PanelRightOpen;
  return <ModalShell className={`results-photo-preview results-media-readable${windowExpanded ? " results-media-expanded" : ""}`} onClose={onClose} restoreFocusRef={returnFocusRef}
    title={preview.result.point || "Вложения точки обхода"} subtitle={`${preview.result.route} · ${time.date}, ${time.time}`}
    headerActions={<>
      <button type="button" className="result-media-window-control" aria-controls={contextId} aria-expanded={contextExpanded} aria-label={contextExpanded ? "Скрыть детали точки" : "Показать детали точки"} title={contextExpanded ? "Скрыть детали точки" : "Показать детали точки"} onClick={toggleContext}><ContextIcon size={18} /><span>Детали</span></button>
      <button type="button" className="result-media-window-control" aria-pressed={windowExpanded} aria-label={windowExpanded ? "Обычный размер окна" : "Развернуть окно"} title={windowExpanded ? "Обычный размер окна" : "Развернуть окно"} onClick={() => setWindowExpanded(current => !current)}>{windowExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
    </>}
    actions={<><div className="result-media-file-summary"><strong title={attachment.fileName}>{attachment.fileName || `${attachmentKind(attachment)} ${index + 1}`}</strong><span>{attachmentSize(attachment.sizeBytes)} · {index + 1} из {preview.attachments.length}</span>{downloadError ? <span role="alert">{downloadError}</span> : null}</div>
      <div className="result-media-actions"><button type="button" className="secondary-action" onClick={onClose}>Вернуться к отчёту</button><button type="button" className="secondary-action" disabled={downloading} aria-busy={downloading || undefined} onClick={() => void downloadOriginal()}><Download size={17} />{downloading ? "Скачиваем…" : "Скачать оригинал"}</button></div></>}>
    <div className={`result-media-layout${!contextExpanded && !compact ? " is-context-hidden" : ""}`} ref={bodyRef}>
      <main className="result-media-main">
        <div className="result-media-navigation"><div className="result-media-file-navigation"><strong>{attachmentKind(attachment)} {index + 1} из {preview.attachments.length}</strong>
          <button type="button" aria-label="Предыдущее вложение" disabled={pointLoading || index === 0} onClick={() => onSelect(index - 1)}><ChevronLeft size={19} /></button>
          <button type="button" aria-label="Следующее вложение" disabled={pointLoading || index >= preview.attachments.length - 1} onClick={() => onSelect(index + 1)}><ChevronRight size={19} /></button>
        </div>
        {pointPosition && pointPosition.total > 1 ? <nav className="result-media-point-navigation" aria-label="Точки с вложениями">
          <button type="button" aria-label="Предыдущая точка с вложениями" title="Предыдущая точка с вложениями" disabled={pointLoading || !onPreviousPoint} onClick={onPreviousPoint}><ChevronLeft size={17} /></button>
          <span role="status" aria-label="Точка с вложениями">{pointLoading ? "Загружаем…" : `Точка ${pointPosition.current} / ${pointPosition.total}`}</span>
          <button type="button" aria-label="Следующая точка с вложениями" title="Следующая точка с вложениями" disabled={pointLoading || !onNextPoint} onClick={onNextPoint}><ChevronRight size={17} /></button>
        </nav> : null}
        <span className="result-media-keys">← → переключают вложения</span></div>
        <ResultAttachmentStage attachment={attachment} url={url} error={error} onRetry={retry} onError={fail}
          hasMultipleFiles={preview.attachments.length > 1} onPrevious={!pointLoading && index > 0 ? () => onSelect(index - 1) : undefined} onNext={!pointLoading && index < preview.attachments.length - 1 ? () => onSelect(index + 1) : undefined} />
        <nav className="result-media-file-strip" aria-label="Список вложений" ref={stripRef}>
          {preview.attachments.map((item, itemIndex) => <button key={item.id} type="button" disabled={pointLoading} aria-pressed={index === itemIndex} title={item.fileName} onClick={() => onSelect(itemIndex)}>
            {isVideoAttachment(item) ? <Video size={19} /> : isImageAttachment(item) ? <ImageIcon size={19} /> : <FileText size={19} />}<span>{attachmentKind(item)} {itemIndex + 1}<small>{item.fileName || "Без имени"}</small></span>
          </button>)}
        </nav>
      </main>
      <ResultMediaContext result={preview.result} order={preview.order} compact={compact} expanded={contextExpanded} onExpandedChange={setContextExpanded} contextRef={contextRef} id={contextId} />
    </div>
  </ModalShell>;
}
