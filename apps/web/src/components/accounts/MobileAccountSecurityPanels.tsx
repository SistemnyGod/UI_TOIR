import { EmptyState, Panel } from "../ui";

export function MobileAccountSecurityPanels({
  securityEvents,
  onNotify,
}: {
  securityEvents: string[][];
  onNotify: (message: string) => void;
}) {
  return (
    <div className="bottom-analytics">
      <Panel title="Аналитика сессий">
        <EmptyState
          title="Нет данных по сессиям"
          description="Метрики появятся после авторизаций мобильных пользователей."
        />
      </Panel>
      <Panel
        title="Последние события безопасности"
        actions={
          <button
            className="link-button"
            onClick={() => onNotify("Журнал безопасности будет доступен после подключения авторизаций")}
            type="button"
          >
            Все события
          </button>
        }
      >
        {securityEvents.length > 0 ? (
          <div className="security-events">
            {securityEvents.map((event) => (
              <div key={`${event[0]}-${event[1]}`}>
                <time>{event[0]}</time>
                <strong>{event[1]}</strong>
                <span>{event[2]}</span>
                <em>{event[3]}</em>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Событий нет"
            description="Журнал безопасности заполнится после входов и изменений доступа."
          />
        )}
      </Panel>
    </div>
  );
}
