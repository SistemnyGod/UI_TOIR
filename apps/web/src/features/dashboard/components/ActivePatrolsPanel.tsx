import { EmptyState, Panel, ProgressBar } from "../../../shared/ui";
import type { ActivePatrol } from "../../../types";

export function ActivePatrolsPanel({
  activePatrols,
  selectedPatrolId,
  onAssign,
  onSelectPatrol,
}: {
  activePatrols: ActivePatrol[];
  selectedPatrolId: string;
  onAssign: () => void;
  onSelectPatrol: (patrolId: string) => void;
}) {
  return (
    <Panel
      title="Активные обходы сейчас"
      note="Сотрудник, маршрут и фактический прогресс прохождения"
      actions={
        <button className="link-button" onClick={onAssign} type="button">
          Назначить
        </button>
      }
    >
      {activePatrols.length > 0 ? (
        <div className="active-patrol-list">
          {activePatrols.map((patrol) => (
            <button
              aria-pressed={selectedPatrolId === patrol.id}
              className={`active-patrol-row ${selectedPatrolId === patrol.id ? "selected" : ""}`}
              key={patrol.id}
              onClick={() => onSelectPatrol(patrol.id)}
              type="button"
            >
              <div className="active-patrol-person">
                <strong>{patrol.employee}</strong>
                <span>{patrol.employeeId}</span>
              </div>
              <div className="active-patrol-route">
                <strong>{patrol.route}</strong>
                <span>{patrol.zone}</span>
              </div>
              <div className="active-patrol-progress">
                <ProgressBar value={patrol.progress} />
                <strong>{patrol.progress}%</strong>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Активных обходов нет"
          description="Данные появятся после назначения маршрутов или подключения API."
        />
      )}
    </Panel>
  );
}
