import { isPhotoEvidenceRequired } from "../../domain/patrol/photoEvidencePolicy.ts";
import { groupReportProblems, type ReportProblemItem } from "./reportReadinessPresentation.ts";

export type ReportPreviewInput = {
  pointId: string;
  name: string;
  orderIndex: number;
  status: "pending" | "scanned" | "ok" | "issue" | "deferred" | "skipped";
  comment: string | null;
  requiresPhoto: boolean;
  confirmationType?: "nfc" | "qr" | "manual" | null;
  photoCount: number;
  videoCount: number;
  missingAttachmentCount: number;
};

export type ReportPreviewTone = "success" | "danger" | "warning" | "neutral";

export type ReportPreviewRow = {
  pointId: string;
  orderIndex: number;
  name: string;
  resultLabel: string;
  resultTone: ReportPreviewTone;
  commentExcerpt: string | null;
  photoCount: number;
  videoCount: number;
  confirmationLabel: string;
  /** Missing required data. Empty when the point is ready for the report. */
  problems: string[];
};

export const commentExcerptLength = 80;
export const missingPhotoReason = "Нужна фотография";

export function buildReportPreview(points: readonly ReportPreviewInput[], readinessProblems: ReportProblemItem[]) {
  // The readiness policy owns the rules; the preview only shows them per point.
  const problemsByPoint = new Map(groupReportProblems(readinessProblems).map(group => [group.pointId, group.reasons]));
  const rows: ReportPreviewRow[] = [...points].sort((left, right) => left.orderIndex - right.orderIndex).map(point => {
    const problems = [...(problemsByPoint.get(point.pointId) ?? [])];
    if (isPhotoEvidenceRequired(point.requiresPhoto, point.status) && point.photoCount === 0 && !problems.includes(missingPhotoReason)) {
      problems.push(missingPhotoReason);
    }
    if (point.missingAttachmentCount > 0) {
      problems.push(`Вложение не найдено на телефоне: ${point.missingAttachmentCount}. Замените его`);
    }
    const result = resultPresentation(point.status);
    return {
      pointId: point.pointId,
      orderIndex: point.orderIndex,
      name: point.name,
      resultLabel: result.label,
      resultTone: result.tone,
      commentExcerpt: excerpt(point.comment),
      photoCount: point.photoCount,
      videoCount: point.videoCount,
      confirmationLabel: confirmationLabel(point.confirmationType),
      problems
    };
  });
  const pointIds = new Set(points.map(point => point.pointId));
  return {
    rows,
    attentionCount: rows.filter(row => row.problems.length > 0).length,
    /** Route-level problems (snapshot, empty route) that belong to no point. */
    routeProblems: groupReportProblems(readinessProblems).filter(group => !pointIds.has(group.pointId)).flatMap(group => group.reasons)
  };
}

export function excerpt(comment: string | null | undefined, limit = commentExcerptLength) {
  const text = comment?.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
}

export function confirmationLabel(type: ReportPreviewInput["confirmationType"]) {
  switch (type) {
    case "nfc": return "NFC";
    case "qr": return "QR";
    case "manual": return "Вручную";
    default: return "Не подтверждена";
  }
}

export function attachmentSummary(row: Pick<ReportPreviewRow, "photoCount" | "videoCount">) {
  const parts = [`Фото: ${row.photoCount}`];
  if (row.videoCount > 0) parts.push(`Видео: ${row.videoCount}`);
  return parts.join(" · ");
}

function resultPresentation(status: ReportPreviewInput["status"]): { label: string; tone: ReportPreviewTone } {
  switch (status) {
    case "ok": return { label: "Исправно", tone: "success" };
    case "issue": return { label: "Неисправно", tone: "danger" };
    case "skipped": return { label: "Не осмотрено", tone: "warning" };
    case "deferred": return { label: "Отложена", tone: "warning" };
    case "scanned": return { label: "Результат не выбран", tone: "warning" };
    default: return { label: "Не заполнена", tone: "neutral" };
  }
}
