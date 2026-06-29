import { Chip, EmptyState, Panel, ProgressBar } from "../../../../shared/ui";
import type { ActivePatrol, DataSourceStatus } from "../../../../types";

interface ActiveAssignmentsPanelProps {
  activePatrols: ActivePatrol[];
  canManage?: boolean;
  errorMessage?: string;
  onNotify: (message: string) => void;
  onRetry?: () => void | Promise<void>;
  onRunCommand?: (id: string, command: "start" | "cancel" | "complete") => void | Promise<void>;
  savingAssignmentId?: string;
  status?: DataSourceStatus;
}

export function ActiveAssignmentsPanel({
  activePatrols,
  canManage = true,
  errorMessage,
  onNotify,
  onRetry,
  onRunCommand,
  savingAssignmentId,
  status = "ready",
}: ActiveAssignmentsPanelProps) {
  return (
    <div className="assign-side">
      <Panel title="Активные назначения" actions={<Chip tone="blue">{activePatrols.length}</Chip>}>
        {status === "loading" ? (
          <EmptyState title="Назначения загружаются" description="Получаем актуальный список из backend API." />
        ) : status === "error" ? (
          <EmptyState
            title="Назначения API не загружены"
            description={errorMessage || "Проверьте backend и повторите загрузку. Локальные записи в API mode не подмешиваются."}
            action={
              <button className="button ghost" onClick={() => void onRetry?.()} type="button">
                Повторить
              </button>
            }
          />
        ) : activePatrols.length > 0 ? (
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
                  <div className="inline-actions">
                    <button
                      className="button ghost"
                      disabled={!canManage || savingAssignmentId === item.id}
                      onClick={() => void onRunCommand?.(item.id, "start")}
                      type="button"
                    >
                      Старт
                    </button>
                    <button
                      className="button ghost"
                      disabled={!canManage || savingAssignmentId === item.id}
                      onClick={() => void onRunCommand?.(item.id, "complete")}
                      type="button"
                    >
                      Завершить
                    </button>
                    <button
                      className="button ghost danger-outline"
                      disabled={!canManage || savingAssignmentId === item.id}
                      onClick={() => void onRunCommand?.(item.id, "cancel")}
                      type="button"
                    >
                      Отмена
                    </button>
                  </div>
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
                onClick={() => onNotify("Сначала выберите заявку, сотрудника и маршрут")}
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
