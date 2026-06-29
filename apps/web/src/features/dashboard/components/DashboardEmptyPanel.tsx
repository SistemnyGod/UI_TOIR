import type { ScreenId } from "../../../types";
import { EmptyState, Panel } from "../../../shared/ui";

interface DashboardEmptyPanelProps {
  actionLabel: string;
  description: string;
  note: string;
  target: ScreenId;
  title: string;
  emptyTitle: string;
  onNavigate: (screen: ScreenId) => void;
}

export function DashboardEmptyPanel({
  actionLabel,
  description,
  emptyTitle,
  note,
  target,
  title,
  onNavigate,
}: DashboardEmptyPanelProps) {
  return (
    <Panel
      title={title}
      note={note}
      actions={
        <button className="link-button" onClick={() => onNavigate(target)} type="button">
          {actionLabel}
        </button>
      }
    >
      <EmptyState title={emptyTitle} description={description} />
    </Panel>
  );
}
