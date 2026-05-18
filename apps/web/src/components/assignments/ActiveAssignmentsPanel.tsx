import { Chip, EmptyState, Panel, ProgressBar } from "../ui";
import type { ActivePatrol } from "../../types";

interface ActiveAssignmentsPanelProps {
  activePatrols: ActivePatrol[];
  onNotify: (message: string) => void;
}

export function ActiveAssignmentsPanel({ activePatrols, onNotify }: ActiveAssignmentsPanelProps) {
  return (
    <div className="assign-side">
      <Panel title="Активные назначения" actions={<Chip tone="blue">{activePatrols.length}</Chip>}>
        {activePatrols.length > 0 ? (
          <>
            <div className="mini-stat-grid">
              <div><strong>{activePatrols.length}</strong><span>Всего</span></div>
              <div><strong>{activePatrols.filter((item) => item.status === "В пути").length}</strong><span>В обходе</span></div>
              <div><strong>{activePatrols.filter((item) => item.status === "Завершает").length}</strong><span>Завершает</span></div>
              <div><strong>{activePatrols.filter((item) => item.status === "Задержка").length}</strong><span>С задержкой</span></div>
            </div>
            <div className="compact-table-list">
              {activePatrols.slice(0, 5).map((item) => (
                <div key={item.id}>
                  <strong>{item.employee}</strong>
                  <span>{item.route}</span>
                  <ProgressBar value={item.progress} />
                  <Chip>{item.status}</Chip>
                </div>
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            title="Активных назначений нет"
            description="Назначения появятся после отправки сотруднику."
            action={
              <button
                className="button ghost"
                onClick={() => onNotify("Сначала выберите сотрудника и маршрут")}
                type="button"
              >
                Подготовить назначение
              </button>
            }
          />
        )}
      </Panel>
      <Panel title="Конфликты и уведомления" actions={<Chip tone="blue">0</Chip>}>
        <EmptyState
          title="Конфликтов нет"
          description="Предупреждения появятся при пересечении смен, нехватке сотрудников или потере связи."
        />
      </Panel>
    </div>
  );
}
