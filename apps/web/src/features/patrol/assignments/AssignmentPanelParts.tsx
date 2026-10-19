import { Button } from "../../../shared/ui";
import type { AssignmentIconComponent } from "./AssignmentIcons";

export function PanelHeader({
  actionLabel,
  count,
  icon: Icon,
  onAction,
  title,
}: {
  actionLabel?: string;
  count?: number;
  icon: AssignmentIconComponent;
  onAction?: () => void;
  title: string;
}) {
  return (
    <div className="assign-am-panel-head">
      <h2>{title}{typeof count === "number" ? <span>{count}</span> : null}</h2>
      {onAction ? (
        <button className="assign-am-panel-action" onClick={onAction} title={actionLabel} type="button">
          <Icon size={19} />
        </button>
      ) : (
        <Icon size={19} />
      )}
    </div>
  );
}

export function EmptyPanel({ actionLabel, description, onAction, title }: { actionLabel?: string; description: string; onAction?: () => void | Promise<void>; title: string }) {
  return (
    <div className="assign-am-empty">
      <strong>{title}</strong>
      <span>{description}</span>
      {actionLabel ? <Button onClick={() => void onAction?.()} variant="ghost">{actionLabel}</Button> : null}
    </div>
  );
}

