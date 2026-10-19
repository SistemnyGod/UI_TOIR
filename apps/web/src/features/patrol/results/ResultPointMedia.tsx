import { useRef, useState } from "react";
import { Camera, ChevronLeft, ChevronRight, RefreshCw, ZoomIn } from "lucide-react";
import type { PatrolResultAttachment } from "../../../types";
import { isImageAttachment, isVideoAttachment } from "./resultMedia";
import { useAttachmentPreview } from "./useAttachmentPreview";

export function ResultPointMedia({ attachments, expectedCount, pointName, onEnlarge, metadataError, onRetryMetadata }: {
  attachments?: PatrolResultAttachment[]; expectedCount: number; pointName: string;
  onEnlarge: (element: HTMLElement, index: number) => void;
  metadataError?: string; onRetryMetadata?: () => void;
}) {
  const [index, setIndex] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const items = attachments ?? [];
  const safeIndex = Math.min(index, Math.max(0, items.length - 1));
  const attachment = items[safeIndex];
  const { url, error, retry, fail } = useAttachmentPreview(attachment);
  return <section className="result-point-media" aria-label="Вложения выбранной точки">
    <div className="result-point-media-heading"><Camera size={18} />Вложения · {Math.max(items.length, expectedCount)}</div>
    {attachment ? <>
      <div className="result-point-media-stage" ref={stageRef}>
        {url && isImageAttachment(attachment) ? <img key={`${attachment.id}:${url}`} alt={`Фото точки ${pointName}`} src={url} onError={() => fail("Не удалось открыть изображение. Повторите загрузку.")} /> : url && isVideoAttachment(attachment) ? <video key={`${attachment.id}:${url}`} src={url} controls playsInline preload="metadata" onError={() => fail("Не удалось воспроизвести видео. Повторите загрузку или откройте оригинал.")} /> :
          <div className="result-point-media-empty"><Camera size={32} /><p>{error || (isImageAttachment(attachment) || isVideoAttachment(attachment) ? "Загружаем вложение…" : "Файл доступен в окне вложений")}</p>{error ? <button onClick={retry} type="button"><RefreshCw size={16} />Повторить</button> : null}</div>}
        <button className="result-point-enlarge" type="button" onClick={(event) => { stageRef.current?.querySelector("video")?.pause(); onEnlarge(event.currentTarget, safeIndex); }}><ZoomIn size={17} />Увеличить</button>
      </div>
      <div className="result-point-media-caption"><span>{isVideoAttachment(attachment) ? "Видео" : isImageAttachment(attachment) ? "Фото" : "Файл"} {safeIndex + 1} из {items.length}</span>
        {items.length > 1 ? <div><button type="button" aria-label="Предыдущее вложение" disabled={safeIndex === 0} onClick={() => setIndex(safeIndex - 1)}><ChevronLeft size={18} /></button><button type="button" aria-label="Следующее вложение" disabled={safeIndex >= items.length - 1} onClick={() => setIndex(safeIndex + 1)}><ChevronRight size={18} /></button></div> : null}
      </div>
    </> : <div className="result-point-media-empty"><Camera size={30} /><p>{metadataError || (expectedCount > 0 ? attachments === undefined ? "Получаем сведения о вложениях…" : "В отчёте указаны вложения, но файлы пока недоступны." : "К этой точке вложения не приложены.")}</p>{metadataError && onRetryMetadata ? <button type="button" onClick={onRetryMetadata}><RefreshCw size={16} />Повторить загрузку точки</button> : null}</div>}
  </section>;
}
