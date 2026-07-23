import type { MouseEvent } from "react";
import { AlertTriangle, CheckCircle2, EyeOff, MoreVertical } from "lucide-react";
import type { ResultGroup } from "./resultTypes";

interface ResultsListRowProps {
  active?: boolean;
  canCreateRequest: boolean;
  group: ResultGroup;
  menuOpen: boolean;
  onArchive: () => void;
  onCreateRequest: () => void;
  onDelete: () => void;
  onOpen: () => void;
  onOpenContextMenu: (event: MouseEvent<HTMLElement>) => void;
  onOpenMenu: () => void;
  onSelect: () => void;
}

export function ResultsListRow({
  active,
  canCreateRequest,
  group,
  menuOpen,
  onArchive,
  onCreateRequest,
  onDelete,
  onOpen,
  onOpenContextMenu,
  onOpenMenu,
  onSelect,
}: ResultsListRowProps) {
  const hasIssue = group.issuePoints > 0 || group.issues > 0;

  return (
    <article
      className={`results-review-row ${active ? "is-active" : ""} ${hasIssue ? "has-issues" : ""}`}
      onContextMenu={onOpenContextMenu}
    >
      <button
        aria-label={`Открыть результат обхода: ${group.route}, ${group.employee}`}
        className="results-review-row-open-target"
        onClick={onSelect}
        onDoubleClick={onOpen}
        type="button"
      >
        <span className="results-review-row-status">
          {hasIssue ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
        </span>
        <span className="results-review-row-main">
          <span className="results-review-row-title">
            <strong>{group.route}</strong>
            <ResultStatusPill issue={hasIssue} />
          </span>
          <span className="results-review-row-description">
            {group.employee} · {group.territory}
          </span>
          <span className="results-review-row-meta">
            <span>{group.points} точек</span>
            <span>{group.duration.label}</span>
            <span>{group.firstScanAt ?? "нет времени"}</span>
          </span>
        </span>
        <span className="results-review-row-summary">
          <span className="ok">Исправно: {group.okPoints}</span>
          <span className={group.issuePoints > 0 ? "issue" : ""}>Неисправно: {group.issuePoints}</span>
          <span>Медиа: {group.photos}</span>
        </span>
      </button>

      <div className="results-review-row-actions">
        <button className="secondary-action" onClick={onOpen} type="button">
          Подробнее
        </button>
        {canCreateRequest ? (
          <button className="primary-action" onClick={onCreateRequest} type="button">
            Заявка
          </button>
        ) : null}
        <div className="results-review-row-menu-wrap">
          <button
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label={`Действия результата: ${group.route}, ${group.employee}`}
            className="results-review-row-more"
            onClick={onOpenMenu}
            type="button"
          >
            <MoreVertical size={18} />
          </button>
          {menuOpen ? (
            <div className="results-review-row-menu" role="menu">
              <button data-action="archive" onClick={onArchive} role="menuitem" type="button">
                <EyeOff size={16} />
                Скрыть на этом устройстве
              </button>
              <button className="is-danger" data-action="delete" onClick={onDelete} role="menuitem" type="button">
                <EyeOff size={16} />
                Скрыть из списка на этом устройстве
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function ResultStatusPill({ issue }: { issue: boolean }) {
  return (
    <span className={`results-review-status-pill ${issue ? "is-issue" : "is-ok"}`}>
      {issue ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
      {issue ? "Есть замечания" : "Без замечаний"}
    </span>
  );
}