import type { ActivePatrol, ScreenId } from "../../types";
import { Chip, EmptyState, Panel } from "../ui";

export function DashboardProblemPointsPanel({
  activePatrols,
  onNavigate,
}: {
  activePatrols: ActivePatrol[];
  onNavigate: (screen: ScreenId) => void;
}) {
  const problemPatrols = activePatrols.filter(
    (item) => item.status === "Задержка" || item.status === "Нет связи",
  );

  return (
    <Panel
      title="Проблемные точки"
      actions={
        <button className="link-button" onClick={() => onNavigate("results")} type="button">
          Подробнее
        </button>
      }
    >
      {problemPatrols.length > 0 ? (
        <div className="issue-list">
          {problemPatrols.map((item) => (
            <div className="issue-row" key={item.id}>
              <span className={item.status === "Задержка" ? "dot red" : "dot slate"} />
              <div>
                <strong>{item.currentPoint}</strong>
                <small>
                  {item.employee} · {item.route}
                </small>
              </div>
              <Chip>{item.status}</Chip>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="Проблемных точек нет" description="Замечания появятся после загрузки результатов обходов." />
      )}
    </Panel>
  );
}
