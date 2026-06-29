import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Image as ImageIcon, Video } from "lucide-react";
import { downloadResultAttachment } from "../../../repositories/resultsRepository";
import type { PatrolResult, PatrolResultAttachment } from "../../../types";
import type { ResultGroup } from "./resultTypes";

interface PointResultTableProps {
  group: ResultGroup;
  results: PatrolResult[];
  onOpenAttachment: (result: PatrolResult, order?: number) => void;
  photoLoadingResultId: string | null;
}

export function PointResultTable({ group, results, onOpenAttachment, photoLoadingResultId }: PointResultTableProps) {
  return (
    <section className="results-review-modal-points">
      <div className="results-review-point-list">
        <div className="results-review-point-table-head" aria-hidden="true">
          <span>№</span>
          <span>Метка</span>
          <span>Статус</span>
          <span>Время фиксации</span>
          <span>Комментарий</span>
          <span>Итог по метке</span>
          <span>Фото</span>
        </div>
        {results.map((result, index) => {
          const statusMeta = getPointStatusMeta(result);
          const photoCount = getPhotoCount(result);
          const isManual = isManualPointResult(result);
          const StateIcon = statusMeta.key === "ok" ? CheckCircle2 : AlertTriangle;
          const pointOrder = Math.max(1, group.results.findIndex((item) => item.id === result.id) + 1) || index + 1;

          return (
            <article key={result.id} className={`is-${statusMeta.key} results-review-point-row`}>
              <span className="results-review-scan-index">{pointOrder}</span>
              <span className={`results-review-point-state is-${statusMeta.key}`}>
                <StateIcon size={20} />
              </span>
              <div className="results-review-point-name">
                <strong>{result.point || `Точка ${index + 1}`}</strong>
                <small>Очередность: {pointOrder}</small>
                {isManual ? <span className="results-review-method-badge is-manual">Без сканирования</span> : null}
              </div>
              <div className="results-review-point-status">
                <PointStatusPill result={result} />
              </div>
              <div className="results-review-point-cell is-time">
                <span>Время фиксации</span>
                <strong>{formatPointActualTime(result.actualAt)}</strong>
                <small>{getPointDurationLabel(result)}</small>
              </div>
              <div className="results-review-point-cell is-comment">
                <span>Комментарий</span>
                <strong>{getPointComment(result)}</strong>
              </div>
              <div className="results-review-point-cell is-result">
                <span>Итог по метке</span>
                <strong>{statusMeta.detail}</strong>
              </div>
              <div className="results-review-point-photo">
                {photoCount > 0 ? (
                  <PointPhotoThumb
                    isLoading={photoLoadingResultId === result.id}
                    onOpen={() => onOpenAttachment(result, pointOrder)}
                    photoCount={photoCount}
                    result={result}
                  />
                ) : (
                  <span><ImageIcon size={18} />Фото нет</span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PointPhotoThumb({
  isLoading,
  onOpen,
  photoCount,
  result,
}: {
  isLoading: boolean;
  onOpen: () => void;
  photoCount: number;
  result: PatrolResult;
}) {
  const firstMedia = result.attachments?.find((attachment) => isImageAttachment(attachment) || isVideoAttachment(attachment)) ?? result.attachments?.[0];
  const isVideo = firstMedia ? isVideoAttachment(firstMedia) : false;
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    setPreviewUrl("");

    if (!firstMedia || isVideo || !isImageAttachment(firstMedia)) return undefined;

    void downloadResultAttachment(firstMedia)
      .then((file) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(file.blob);
        setPreviewUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setPreviewUrl("");
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [firstMedia, isVideo]);

  return (
    <button type="button" onClick={onOpen} disabled={isLoading} aria-label="Открыть вложения точки">
      {previewUrl ? (
        <img alt={result.point ? `Фото точки ${result.point}` : "Фото точки"} src={previewUrl} />
      ) : (
        <span className="results-review-photo-placeholder">
          {isVideo ? <Video size={18} /> : <ImageIcon size={18} />}
        </span>
      )}
      {isLoading ? "Загрузка..." : `${photoCount} ${isVideo ? "видео" : "фото"}`}
    </button>
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

function getPointDurationLabel(result: PatrolResult) {
  return isUsefulText(result.deviation) ? result.deviation : "на точке";
}

function getPhotoCount(result: PatrolResult) {
  return result.attachments?.length ?? result.photos ?? 0;
}

function isImageAttachment(attachment: PatrolResultAttachment) {
  return attachment.contentType?.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif)$/i.test(attachment.fileName ?? "");
}

function isVideoAttachment(attachment: PatrolResultAttachment) {
  return attachment.contentType?.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(attachment.fileName ?? "");
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
