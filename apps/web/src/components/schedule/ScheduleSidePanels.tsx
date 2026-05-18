import { EmptyState, Panel } from "../ui";

interface ScheduleSidePanelsProps {
  exceptionCount: number;
  onShowExceptions: () => void;
  onNotify: (message: string) => void;
}

export function ScheduleSidePanels({ exceptionCount, onShowExceptions, onNotify }: ScheduleSidePanelsProps) {
  return (
    <aside className="planning-side">
      <Panel
        title="Исключения и замены"
        actions={
          <button className="link-button" onClick={onShowExceptions} type="button">
            Все ({exceptionCount})
          </button>
        }
      >
        <EmptyState title="Исключений нет" />
      </Panel>
      <Panel
        title="Корректировки смен"
        actions={
          <button className="link-button" onClick={onShowExceptions} type="button">
            Все (0)
          </button>
        }
      >
        <EmptyState title="Корректировок нет" />
      </Panel>
      <Panel
        title="Конфликты"
        actions={
          <button
            className="link-button"
            onClick={() => onNotify("Конфликты будут рассчитаны после подключения правил расписания")}
            type="button"
          >
            Все (0)
          </button>
        }
      >
        <EmptyState
          title="Конфликтов нет"
          description="Проверка конфликтов будет выполняться по реальным правилам расписания."
        />
      </Panel>
      <Panel title="Покрытие смен">
        <EmptyState title="Нет данных по покрытию" />
      </Panel>
    </aside>
  );
}
