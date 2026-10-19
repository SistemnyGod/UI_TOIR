import { ChevronLeft, ChevronRight, FileText, Image as ImageIcon, Video, ZoomIn, ZoomOut, Maximize, RefreshCw } from "lucide-react";
import type { PatrolResultAttachment } from "../../../types";
import { isImageAttachment, isVideoAttachment } from "./resultMedia";
import { usePhotoViewport } from "./usePhotoViewport";

export function ResultAttachmentStage({ attachment, url, error, onRetry, onError, onPrevious, onNext, hasMultipleFiles = false }: {
  attachment: PatrolResultAttachment; url: string; error: string; onRetry: () => void; onError: (message: string) => void;
  onPrevious?: () => void; onNext?: () => void; hasMultipleFiles?: boolean;
}) {
  const image = isImageAttachment(attachment);
  const video = isVideoAttachment(attachment);
  const { zoom, stageRef, changeZoom, fit, pointerDown, pointerMove, pointerEnd } = usePhotoViewport(image && Boolean(url), `${attachment.id}:${url}`, onPrevious, onNext);
  const Icon = image ? ImageIcon : video ? Video : FileText;
  return <>
    {image && url ? <div className="result-photo-tools" aria-label="Масштаб фотографии">
      <button type="button" aria-label="Уменьшить фото" disabled={zoom <= 1} onClick={() => changeZoom(zoom - .5)}><ZoomOut size={18} /></button>
      <output aria-live="polite" aria-label="Масштаб фото">{Math.round(zoom * 100)}%</output>
      <button type="button" aria-label="Увеличить фото" disabled={zoom >= 4} onClick={() => changeZoom(zoom + .5)}><ZoomIn size={18} /></button>
      <button type="button" onClick={fit}><Maximize size={17} />По размеру окна</button>
      <span className="result-photo-desktop-hint">Колесо — масштаб · Перетаскивание — перемещение</span>
      <span className="result-photo-touch-hint">Два пальца — масштаб · Свайп — следующий снимок</span>
    </div> : null}
    <div className="result-photo-viewport">
    <div className={`result-photo-stage ${zoom > 1 ? "is-zoomed" : ""}`} ref={stageRef} tabIndex={image && url ? 0 : undefined} role="region" aria-label={image ? "Фотография: масштаб и перемещение" : video ? "Видео точки обхода" : "Файл точки обхода"}
      style={image && url ? { touchAction: zoom > 1 ? "none" : "pan-y" } : undefined}
      onDoubleClick={event => image && url && (zoom === 1 ? changeZoom(2, { x: event.clientX - event.currentTarget.getBoundingClientRect().left, y: event.clientY - event.currentTarget.getBoundingClientRect().top }) : fit())}
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}
      onKeyDown={event => {
        if (!image || !url || event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.key === "+" || event.key === "=") { event.preventDefault(); changeZoom(zoom + .5); }
        else if (event.key === "-") { event.preventDefault(); changeZoom(zoom - .5); }
        else if (event.key === "0") { event.preventDefault(); fit(); }
        else if (zoom > 1 && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
          event.preventDefault();
          if (event.key === "ArrowLeft") event.currentTarget.scrollLeft -= 60;
          if (event.key === "ArrowRight") event.currentTarget.scrollLeft += 60;
          if (event.key === "ArrowUp") event.currentTarget.scrollTop -= 60;
          if (event.key === "ArrowDown") event.currentTarget.scrollTop += 60;
        }
      }}>
      {url && image ? <div className="result-photo-canvas" style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}>
        <img key={`${attachment.id}:${url}`} draggable={false} alt={attachment.fileName || "Фото точки обхода"} src={url} onError={() => onError("Не удалось открыть изображение. Повторите загрузку.")} />
      </div> : url && video ? <video key={`${attachment.id}:${url}`} controls playsInline preload="metadata" src={url} onError={() => onError("Не удалось воспроизвести видео. Повторите загрузку или скачайте оригинал.")} /> :
        <div className="result-photo-placeholder" role={error ? "alert" : "status"}><Icon size={38} />
          <strong>{error ? "Вложение не открылось" : image || video ? "Загружаем вложение…" : "Предпросмотр недоступен"}</strong>
          <p>{error || (image || video ? "Получаем файл с сервера" : "Скачайте оригинал, чтобы открыть файл в подходящей программе.")}</p>
          {error ? <button type="button" onClick={onRetry}><RefreshCw size={17} />Повторить загрузку</button> : null}
        </div>}
    </div>
    {hasMultipleFiles ? <><button className="result-photo-arrow is-previous" type="button" aria-label="Предыдущий снимок" disabled={!onPrevious} onClick={onPrevious}><ChevronLeft size={24} /></button>
      <button className="result-photo-arrow is-next" type="button" aria-label="Следующий снимок" disabled={!onNext} onClick={onNext}><ChevronRight size={24} /></button></> : null}
    </div>
  </>;
}
