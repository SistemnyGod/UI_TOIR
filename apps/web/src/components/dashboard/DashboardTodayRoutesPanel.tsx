import type { ActivePatrol, ScreenId } from "../../types";
import { Chip, EmptyState, Panel, ProgressBar } from "../ui";

export function DashboardTodayRoutesPanel({
  activePatrols,
  onNavigate,
  onSelectPatrol,
}: {
  activePatrols: ActivePatrol[];
  onNavigate: (screen: ScreenId) => void;
  onSelectPatrol: (patrolId: string) => void;
}) {
  return (
    <Panel
      title="Сегодня по маршрутам"
      note="Дневная смена 08:00 - 20:00"
      actions={
        <button className="link-button" onClick={() => onNavigate("schedule")} type="button">
          Расписание →
        </button>
      }
    >
      {activePatrols.length > 0 ? (
        <div className="route-day-list">
          {activePatrols.slice(0, 4).map((patrol) => (
            <button className="route-day-row" key={patrol.id} onClick={() => onSelectPatrol(patrol.id)} type="button">
              <div>
                <strong>{patrol.route}</strong>
                <span>{patrol.zone}</span>
              </div>
              <Chip>{patrol.status}</Chip>
              <div className="table-progress">
                <ProgressBar value={patrol.progress} />
                <span>{patrol.progress}%</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState title="Маршруты на сегодня не назначены" description="Список заполнится после планирования или назначения." />
      )}
    </Panel>
  );
}
