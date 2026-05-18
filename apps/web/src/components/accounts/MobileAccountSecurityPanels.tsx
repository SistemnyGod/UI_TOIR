import type { DataSourceStatus, MobileAccountSecurityEvent, MobileAccountSession } from "../../types";
import { EmptyState, Panel } from "../ui";

type MaybePromise<T> = T | Promise<T>;

export function MobileAccountSecurityPanels({
  errorMessage,
  onNotify,
  onRefresh,
  securityEvents,
  sessions,
  status,
}: {
  errorMessage?: string;
  onNotify: (message: string) => void;
  onRefresh: () => MaybePromise<void>;
  securityEvents: MobileAccountSecurityEvent[];
  sessions: MobileAccountSession[];
  status: DataSourceStatus;
}) {
  const isLoading = status === "loading";
  const isError = status === "error";

  return (
    <div className="bottom-analytics mobile-security-panels">
      <Panel
        title="Аналитика сессий"
        actions={
          <button className="link-button" onClick={() => void onRefresh()} type="button">
            Обновить
          </button>
        }
      >
        {isError ? (
          <EmptyState
            action={
              <button className="button ghost" onClick={() => void onRefresh()} type="button">
                Повторить
              </button>
            }
            title="Сессии недоступны"
            description={errorMessage ?? "Не удалось загрузить данные по мобильным сессиям."}
          />
        ) : sessions.length > 0 ? (
          <div className="security-events session-events">
            {sessions.map((session) => (
              <div key={session.id}>
                <time>{formatDateTime(session.lastSeenAt)}</time>
                <strong>{session.status || "-"}</strong>
                <span>{formatSessionDevice(session)}</span>
                <em>{session.ipAddress || "-"}</em>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title={isLoading ? "Загрузка сессий" : "Нет данных по сессиям"}
            description={
              isLoading
                ? "Получаем активность выбранного мобильного аккаунта."
                : "Метрики появятся после авторизаций мобильных пользователей."
            }
          />
        )}
      </Panel>

      <Panel
        title="Последние события безопасности"
        actions={
          <button
            className="link-button"
            onClick={() => {
              void onRefresh();
              onNotify("Журнал безопасности обновлен для выбранного аккаунта");
            }}
            type="button"
          >
            Все события
          </button>
        }
      >
        {isError ? (
          <EmptyState
            action={
              <button className="button ghost" onClick={() => void onRefresh()} type="button">
                Повторить
              </button>
            }
            title="События недоступны"
            description={errorMessage ?? "Не удалось загрузить журнал безопасности."}
          />
        ) : securityEvents.length > 0 ? (
          <div className="security-events">
            {securityEvents.map((event) => (
              <div key={event.id}>
                <time>{formatDateTime(event.createdAt)}</time>
                <strong>{event.eventType || "-"}</strong>
                <span>{event.message || "-"}</span>
                <em>{event.actor || "-"}</em>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title={isLoading ? "Загрузка событий" : "Событий нет"}
            description={
              isLoading
                ? "Получаем журнал безопасности выбранного аккаунта."
                : "Журнал безопасности заполнится после входов и изменений доступа."
            }
          />
        )}
      </Panel>
    </div>
  );
}

function formatDateTime(value: string) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatSessionDevice(session: MobileAccountSession) {
  const device = [session.device, session.platform, session.appVersion].filter(Boolean).join(" / ");
  return device || "-";
}
