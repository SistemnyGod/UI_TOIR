import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  PlusCircle,
  ScanLine,
  X,
} from "lucide-react";
import type { PatrolResult } from "../../../types";
import { PointResultTable } from "./PointResultTable";
import type { ResultGroup } from "./resultTypes";

interface PatrolResultDetailsProps {
  group: ResultGroup;
  onClose: () => void;
  onCreateRequest: () => void;
  onExport: () => void;
  onOpenRequest: () => void;
  onOpenAttachment: (result: PatrolResult, order?: number) => void;
  photoLoadingResultId: string | null;
  exportInProgress?: boolean;
}

export function PatrolResultDetails({
  group,
  onClose,
  onCreateRequest,
  onExport,
  onOpenRequest,
  onOpenAttachment,
  photoLoadingResultId,
  exportInProgress = false,
}: PatrolResultDetailsProps) {
  const [pointMode, setPointMode] = useState<"all" | "issues" | "photos">("all");
  const [pointQuery, setPointQuery] = useState("");
  const issueResults = group.results.filter(hasResultIssue);
  const mediaResults = group.results.filter((result) => getAttachmentCount(result) > 0);
  const plannedAt = group.plannedAt ?? "нет данных";
  const startedAt = group.startedAt ?? group.firstScanAt ?? "нет данных";
  const finishedAt = group.finishedAt ?? group.lastScanAt ?? "нет данных";
  const hasAttention = group.issuePoints > 0 || issueResults.length > 0;
  const completionPercent = getCompletionPercent(group);
  const filteredResults = useMemo(() => {
    const normalizedQuery = normalizeText(pointQuery);
    return group.results.filter((result) => {
      const matchesMode =
        pointMode === "all" ||
        (pointMode === "issues" && hasResultIssue(result)) ||
        (pointMode === "photos" && getAttachmentCount(result) > 0);
      const haystack = normalizeText([result.point, result.comment, result.issueType, result.actualAt].join(" "));
      return matchesMode && (!normalizedQuery || haystack.includes(normalizedQuery));
    });
  }, [group.results, pointMode, pointQuery]);

  return (
    <div className="results-review-modal-backdrop" onMouseDown={onClose}>
      <section
        className="results-review-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Просмотр результата обхода"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="results-review-modal-head">
          <div>
            <h3>Детальный просмотр обхода</h3>
            <p>
              {group.route} · {group.employee} · {group.territory}
            </p>
          </div>
          <div className="results-review-modal-head-actions">
            {hasAttention ? (
              <span className="results-review-modal-alert">
                <AlertTriangle size={16} />
                Есть замечания
              </span>
            ) : (
              <span className="results-review-modal-ok">
                <CheckCircle2 size={16} />
                Подтверждено
              </span>
            )}
            <button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть">
              <X size={20} />
            </button>
          </div>
        </header>

        <div className="results-review-modal-toolbar">
          <div className="results-review-tabs">
            <button
              type="button"
              className={pointMode === "all" ? "active" : ""}
              onClick={() => setPointMode("all")}
            >
              Все точки <span>{group.results.length}</span>
            </button>
            <button
              type="button"
              className={pointMode === "issues" ? "active" : ""}
              onClick={() => setPointMode("issues")}
            >
              С замечаниями <span>{issueResults.length}</span>
            </button>
            <button
              type="button"
              className={pointMode === "photos" ? "active" : ""}
              onClick={() => setPointMode("photos")}
            >
              С медиа <span>{mediaResults.length}</span>
            </button>
          </div>
          <label className="results-review-modal-search">
            <ScanLine size={16} />
            <input
              value={pointQuery}
              onChange={(event) => setPointQuery(event.target.value)}
              placeholder="Поиск по метке или комментарию"
            />
          </label>
          <button type="button" className="secondary-button" onClick={onExport} disabled={exportInProgress}>
            <Download size={16} />
            {exportInProgress ? "Экспорт..." : "Экспорт"}
          </button>
        </div>

        <div className="results-review-modal-body">
          <PointResultTable
            group={group}
            results={filteredResults}
            onOpenAttachment={onOpenAttachment}
            photoLoadingResultId={photoLoadingResultId}
          />

          <aside className="results-review-modal-route">
            <section className="results-review-route-card">
              <h4>Маршрут</h4>
              <dl>
                <div>
                  <dt>Маршрут</dt>
                  <dd>{group.route}</dd>
                </div>
                <div>
                  <dt>Территория</dt>
                  <dd>{group.territory}</dd>
                </div>
                <div>
                  <dt>Смена</dt>
                  <dd>{group.shift}</dd>
                </div>
                <div>
                  <dt>План обхода</dt>
                  <dd>{plannedAt}</dd>
                </div>
                <div>
                  <dt>Начало обхода</dt>
                  <dd>{startedAt}</dd>
                </div>
                <div>
                  <dt>Окончание обхода</dt>
                  <dd>{finishedAt}</dd>
                </div>
                <div>
                  <dt>Итог времени</dt>
                  <dd>{group.duration.label}</dd>
                </div>
                <div>
                  <dt>Источник данных</dt>
                  <dd>{sourceLabel(group.results[0]?.source)}</dd>
                </div>
              </dl>
            </section>

            <section className="results-review-route-card">
              <h4>Прогресс обхода</h4>
              <div className="results-review-progress-row">
                <strong>
                  {group.points} / {group.points} точек
                </strong>
                <span>{completionPercent}%</span>
              </div>
              <div className="results-review-progress-bar">
                <span style={{ width: `${completionPercent}%` }} />
              </div>
            </section>
          </aside>
        </div>

        <footer className="results-review-modal-footer">
          <button type="button" className="secondary-button" onClick={onClose}>
            Закрыть
          </button>
          <button type="button" className="secondary-button" onClick={onOpenRequest}>
            <ExternalLink size={16} />
            Открыть заявку
          </button>
          <button type="button" className="primary-button" onClick={onCreateRequest}>
            <PlusCircle size={16} />
            Создать заявку
          </button>
        </footer>
      </section>
    </div>
  );
}

function hasResultIssue(result: PatrolResult): boolean {
  return statusKey(result.status) === "issue" || isUnavailablePointResult(result) || isUsefulText(result.issueType);
}

function isUnavailablePointResult(result: PatrolResult): boolean {
  const values = [result.status, result.comment, result.issueType].map(normalizeText);
  return values.some((value) => value.includes("skipped") || value.includes("недоступ"));
}

function getAttachmentCount(result: PatrolResult): number {
  return Math.max(Number(result.photos) || 0, result.attachments?.length ?? 0);
}

function getCompletionPercent(group: ResultGroup): number {
  if (!group.points) {
    return 0;
  }

  return Math.min(100, Math.round(((group.okPoints + group.issuePoints) / group.points) * 100));
}

function sourceLabel(source?: PatrolResult["source"]): string {
  if (source === "mobile") {
    return "Мобильное приложение";
  }

  if (source === "web") {
    return "Web-панель";
  }

  return "Импорт";
}

function statusKey(status?: string | null): string {
  return normalizeText(status).replace(/\s+/g, "");
}

function isUsefulText(value?: string | null): boolean {
  const normalized = normalizeText(value);
  return Boolean(normalized && normalized !== "нет" && normalized !== "нет данных" && normalized !== "без комментария");
}

function normalizeText(value?: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}
