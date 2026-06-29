import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, Image as ImageIcon, Video, X } from "lucide-react";
import { downloadResultAttachment } from "../../../repositories/resultsRepository";
import type { PatrolResult, PatrolResultAttachment } from "../../../types";

export interface ResultMediaPreviewState {
  result: PatrolResult;
  attachments: PatrolResultAttachment[];
  index: number;
  order?: number;
}

interface ResultMediaViewerProps {
  preview: ResultMediaPreviewState;
  onClose: () => void;
  onDownload: (attachment: PatrolResultAttachment) => void;
  onSelect: (index: number) => void;
}

export function ResultMediaViewer({ preview, onClose, onDownload, onSelect }: ResultMediaViewerProps) {
  const attachment = preview.attachments[preview.index] ?? preview.attachments[0];
  const [objectUrl, setObjectUrl] = useState("");
  const [loadError, setLoadError] = useState("");
  const isImage = attachment ? isImageAttachment(attachment) : false;
  const isVideo = attachment ? isVideoAttachment(attachment) : false;
  const statusMeta = getPointStatusMeta(preview.result);
  const isManual = isManualPointResult(preview.result);

  useEffect(() => {
    let cancelled = false;
    let nextObjectUrl = "";
    setObjectUrl("");
    setLoadError("");

    if (!attachment || (!isImage && !isVideo)) return undefined;

    void downloadResultAttachment(attachment)
      .then((file) => {
        if (cancelled) return;
        nextObjectUrl = URL.createObjectURL(file.blob);
        setObjectUrl(nextObjectUrl);
      })
      .catch((error) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "не удалось загрузить вложение";
        setLoadError(message.toLowerCase().includes("not found")
          ? "Файл не найден на сервере. Нужно проверить хранилище mobile-files."
          : message);
      });

    return () => {
      cancelled = true;
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
    };
  }, [attachment, isImage, isVideo]);

  if (!attachment) return null;

  return (
    <div className="results-photo-preview-backdrop" onMouseDown={onClose}>
      <section className="results-photo-preview" role="dialog" aria-modal="true" aria-label="Просмотр вложений точки обхода" onMouseDown={(event) => event.stopPropagation()}>
        <header className="results-photo-preview-head">
          <div>
            <p>Вложения точки обхода</p>
            <h2>{preview.result.point}</h2>
            <span>{preview.result.route} · {formatPointActualTime(preview.result.actualAt)}</span>
          </div>
          <button type="button" aria-label="Закрыть просмотр" onClick={onClose}><X size={20} /></button>
        </header>

        <div className="results-photo-preview-body">
          <aside className="results-photo-preview-list" aria-label="Список вложений">
            {preview.attachments.map((item, index) => (
              <button key={item.id} type="button" className={index === preview.index ? "is-active" : ""} onClick={() => onSelect(index)}>
                {isVideoAttachment(item) ? <Video size={17} /> : <ImageIcon size={17} />}
                <span>{getAttachmentKindLabel(item)} {index + 1}</span>
                <small>{item.fileName || "без имени"}</small>
              </button>
            ))}
          </aside>

          <main className="results-photo-preview-stage">
            {isImage && objectUrl ? (
              <img alt={attachment.fileName || `Фото точки ${preview.result.point}`} src={objectUrl} />
            ) : isVideo && objectUrl ? (
              <video controls playsInline preload="metadata" src={objectUrl}>
                Ваш браузер не поддерживает просмотр видео.
              </video>
            ) : isImage && !loadError ? (
              <PreviewPlaceholder icon="image" title="Фото загружается" description="Получаем файл с сервера" />
            ) : isVideo && !loadError ? (
              <PreviewPlaceholder icon="video" title="Видео загружается" description="Получаем файл с сервера" />
            ) : (
              <PreviewPlaceholder
                icon="file"
                title={loadError ? "Вложение не открылось" : "Файл нельзя показать в предпросмотре"}
                description={loadError || attachment.contentType || "неизвестный тип файла"}
              />
            )}
          </main>

          <aside className="results-photo-preview-detail" aria-label="Детали точки">
            <div className="results-photo-preview-detail-head">
              <span className={`results-review-point-state is-${statusMeta.key}`}>
                {statusMeta.key === "ok" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
              </span>
              <div>
                <strong>{preview.result.point || "Точка обхода"}</strong>
                <small>Очередность: {preview.order ?? "не указана"}</small>
              </div>
            </div>
            <dl>
              <div>
                <dt>Статус</dt>
                <dd><PointStatusPill result={preview.result} /></dd>
              </div>
              <div>
                <dt>Время фиксации</dt>
                <dd>{formatPointActualTime(preview.result.actualAt)}</dd>
              </div>
              <div>
                <dt>Комментарий</dt>
                <dd>{getPointComment(preview.result)}</dd>
              </div>
              <div>
                <dt>Итог по метке</dt>
                <dd>{statusMeta.detail}</dd>
              </div>
              {isManual ? (
                <div>
                  <dt>Способ фиксации</dt>
                  <dd><span className="results-review-method-badge is-manual">Заполнено вручную без сканирования</span></dd>
                </div>
              ) : null}
            </dl>
          </aside>
        </div>

        <footer className="results-photo-preview-footer">
          <div>
            <strong>{attachment.fileName || `${getAttachmentKindLabel(attachment)} ${preview.index + 1}`}</strong>
            <span>{formatAttachmentSize(attachment.sizeBytes)} · {attachment.createdAt}</span>
          </div>
          <div className="results-photo-preview-footer-actions">
            <button type="button" className="secondary-action" onClick={onClose}>
              Вернуться к отчету
            </button>
            <button type="button" className="secondary-action" onClick={() => onDownload(attachment)}>
              Скачать оригинал
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function PreviewPlaceholder({ icon, title, description }: { icon: "image" | "video" | "file"; title: string; description: string }) {
  const Icon = icon === "image" ? ImageIcon : icon === "video" ? Video : FileText;
  return (
    <div className="results-photo-preview-placeholder">
      <Icon size={34} />
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}

function PointStatusPill({ result }: { result: PatrolResult }) {
  const meta = getPointStatusMeta(result);
  return <span className={`results-review-status is-${meta.key}`}>{meta.label}</span>;
}

function getPointStatusMeta(result: PatrolResult) {
  if (isUnavailablePointResult(result)) {
    return {
      key: "unavailable",
      label: "Метка недоступна",
      detail: "Метка не была отсканирована: сотрудник подтвердил недоступность.",
    };
  }

  if (hasResultIssue(result)) {
    return {
      key: "issue",
      label: "Неисправно",
      detail: isUsefulText(result.issueType) && result.issueType !== "-" ? result.issueType : "Зафиксирована неисправность.",
    };
  }

  return {
    key: "ok",
    label: "Исправно",
    detail: isManualPointResult(result) ? "Заполнено вручную без сканирования." : "Замечаний нет.",
  };
}

function hasResultIssue(result: PatrolResult) {
  const status = statusKey(result.status);
  return status === "issue" || status === "problem" || status === "failed" || isUsefulText(result.issueType);
}

function isUnavailablePointResult(result: PatrolResult) {
  const text = normalizeText([result.status, result.issueType, result.comment].join(" "));
  return text.includes("skipped")
    || text.includes("unavailable")
    || text.includes("метка недоступна")
    || text.includes("утеряна");
}

function isManualPointResult(result: PatrolResult) {
  const text = normalizeText([result.status, result.issueType, result.comment].join(" "));
  return text.includes("manual")
    || text.includes("вручную")
    || text.includes("без сканирования");
}

function getPointComment(result: PatrolResult) {
  return isUsefulText(result.comment) ? result.comment : "без комментария";
}

function formatPointActualTime(actualAt?: string) {
  if (!actualAt) return "нет данных";
  const parsed = new Date(actualAt);
  if (Number.isNaN(parsed.getTime())) return actualAt;
  return parsed.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function isImageAttachment(attachment: PatrolResultAttachment) {
  return attachment.contentType?.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif)$/i.test(attachment.fileName ?? "");
}

export function isVideoAttachment(attachment: PatrolResultAttachment) {
  return attachment.contentType?.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(attachment.fileName ?? "");
}

function getAttachmentKindLabel(attachment: PatrolResultAttachment) {
  if (isVideoAttachment(attachment)) return "Видео";
  if (isImageAttachment(attachment)) return "Фото";
  return "Файл";
}

function formatAttachmentSize(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return "размер неизвестен";
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} КБ`;
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} МБ`;
}

function statusKey(status?: string) {
  return normalizeText(status).replace(/\s+/g, "");
}

function isUsefulText(value?: string) {
  if (!value) return false;
  const normalized = value.trim();
  return normalized.length > 0 && normalized !== "-" && normalized.toLowerCase() !== "нет";
}

function normalizeText(value?: string) {
  return (value ?? "").trim().toLowerCase();
}
