import type { RefObject } from "react";
import { AlertTriangle, CheckCircle2, MessageSquare } from "lucide-react";
import type { PatrolResult } from "../../../types";
import { getResultPointMeta, resultDateTime, usefulResultText } from "./resultPresentation";

export function ResultMediaContext({ result, order, compact, expanded, onExpandedChange, contextRef, id }: {
  result: PatrolResult;
  order?: number;
  compact: boolean;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  contextRef: RefObject<HTMLElement | null>;
  id: string;
}) {
  const status = getResultPointMeta(result);
  const time = resultDateTime(result.actualAt);
  return <aside ref={contextRef} id={id} className="result-media-context" aria-label="Детали точки" hidden={!compact && !expanded}>
    <details open={expanded} className="result-media-context-details" onToggle={event => onExpandedChange(event.currentTarget.open)}>
      <summary><MessageSquare size={17} />Детали и комментарий точки</summary>
      <div>
        <span className={`patrol-point-status is-${status.key}`}>{status.key === "ok" ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}{status.label}</span>
        <dl>
          <div><dt>Точка обхода</dt><dd>{result.point}</dd></div>
          <div><dt>Очередность</dt><dd>{order ?? "Не указана"}</dd></div>
          <div><dt>Время фиксации</dt><dd>{time.date}, {time.time}</dd></div>
        </dl>
        {usefulResultText(result.issueType) ? <p className="result-media-issue">{result.issueType}</p> : null}
        <h3><MessageSquare size={19} />Комментарий сотрудника</h3>
        <p className="result-media-comment">{usefulResultText(result.comment) ? result.comment : "Комментарий не добавлен."}</p>
        {/manual|вручную|без сканирования/i.test([result.status, result.comment].join(" ")) ? <p className="patrol-detail-manual">Заполнено вручную без сканирования</p> : null}
      </div>
    </details>
  </aside>;
}
