import type { DataSourceStatus, MobileAccountSecurityEvent, MobileAccountSession } from "../../../types";
import { EmptyState } from "../../../shared/ui";

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
  const analytics = buildSessionAnalytics(sessions);
  const visibleSecurityEvents = securityEvents.slice(0, 7);

  return (
    <section className="mobile-am-bottom">
      <article className="mobile-am-panel mobile-am-analytics">
        <div className="mobile-am-panel-head compact">
          <h2>Аналитика сессий</h2>
          <button onClick={() => void onRefresh()} type="button">Обновить</button>
        </div>

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
          <div className="mobile-am-analytics-compact">
            <div className="mobile-am-analytics-metrics">
              <div>
                <span>Сейчас онлайн</span>
                <strong className="success-text">{analytics.activeCount}</strong>
                <em>активные сессии</em>
              </div>
              <div>
                <span>Последний вход</span>
                <strong>{formatDateTime(analytics.lastLoginAt)}</strong>
                <em>по серверной сессии</em>
              </div>
              <div>
                <span>Последний выход</span>
                <strong>{formatDateTime(analytics.lastLogoutAt)}</strong>
                <em>точное время завершения</em>
              </div>
              <div>
                <span>Завершено</span>
                <strong>{analytics.completedCount}</strong>
                <em>из последних {sessions.length}</em>
              </div>
            </div>

            <div className="mobile-am-session-timeline">
              {sessions.slice(0, 7).map((session) => (
                <div className="mobile-am-session-row" key={session.id}>
                  <span className={`mobile-am-session-state ${session.endedAt ? "ended" : "active"}`} />
                  <div className="mobile-am-session-main">
                    <strong>{session.device || "Неизвестное устройство"}</strong>
                    <span>{[session.platform, session.appVersion, session.ipAddress].filter(Boolean).join(" · ")}</span>
                  </div>
                  <dl>
                    <div><dt>Вход</dt><dd>{formatDateTime(session.startedAt)}</dd></div>
                    <div><dt>Выход</dt><dd>{session.endedAt ? formatDateTime(session.endedAt) : "Сейчас онлайн"}</dd></div>
                    <div><dt>Активность</dt><dd>{formatDateTime(session.lastSeenAt)}</dd></div>
                    <div><dt>Длительность</dt><dd>{formatDuration(session.startedAt, session.endedAt ?? session.lastSeenAt)}</dd></div>
                  </dl>
                </div>
              ))}
            </div>
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
      </article>

      <article className="mobile-am-panel mobile-am-events">
        <div className="mobile-am-panel-head compact">
          <div>
            <h2>События безопасности</h2>
            <span>Последние {Math.min(securityEvents.length, 7)} событий</span>
          </div>
          <button
            onClick={() => {
              void onRefresh();
              onNotify("Журнал безопасности обновлен для выбранного аккаунта.");
            }}
            type="button"
          >
            Обновить
          </button>
        </div>

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
          <div className="mobile-am-event-list">
            {visibleSecurityEvents.map((event) => {
              const readableEvent = describeSecurityEvent(event);
              return (
              <div className="mobile-am-event" key={event.id}>
                <span className={`mobile-am-event-icon ${eventTone(event)}`}>!</span>
                <div>
                    <strong>{readableEvent.title}</strong>
                    <span>{readableEvent.description}</span>
                    <small>{readableEvent.meta}</small>
                </div>
                <time>{formatDateTime(event.createdAt)}</time>
              </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title={isLoading ? "Загрузка событий" : "Событий нет"}
            description={
              isLoading
                ? "Получаем журнал безопасности выбранного мобильного аккаунта."
                : "Журнал безопасности заполнится после входов и изменений доступа."
            }
          />
        )}
      </article>
    </section>
  );
}

function buildSessionAnalytics(sessions: MobileAccountSession[]) {
  const activeSessions = sessions.filter((session) => !session.endedAt);
  const completedSessions = sessions.filter((session) => Boolean(session.endedAt));
  const lastLoginAt = sessions
    .map((session) => session.startedAt)
    .filter(Boolean)
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? "";
  const lastLogoutAt = completedSessions
    .map((session) => session.endedAt ?? "")
    .filter(Boolean)
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? "";

  return {
    activeCount: activeSessions.length,
    completedCount: completedSessions.length,
    lastLoginAt,
    lastLogoutAt,
  };
}

function formatDuration(startedAt: string, endedAt: string) {
  const started = new Date(startedAt).getTime();
  const ended = new Date(endedAt).getTime();
  if (!Number.isFinite(started) || !Number.isFinite(ended) || ended < started) return "—";

  const totalMinutes = Math.max(0, Math.round((ended - started) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} ч ${minutes} мин` : `${minutes} мин`;
}

function describeSecurityEvent(event: MobileAccountSecurityEvent) {
  const type = event.eventType || "mobile_account.event";
  const normalizedType = type.toLowerCase().replace(/[._-]+/g, " ");
  const employeeId = event.message.match(/employee\s+([a-f0-9-]{8,})/i)?.[1];
  const accountId = event.message.match(/account\s+([a-f0-9-]{8,})/i)?.[1];
  const details = employeeId
    ? `ID сотрудника: ${employeeId}`
    : accountId
      ? `ID аккаунта: ${accountId}`
      : event.message || "Подробности не переданы";

  if (normalizedType.includes("employee attached")) {
    return {
      title: "Сотрудник привязан",
      description: `Мобильный аккаунт получил доступ к сотруднику. ${details}`,
      meta: formatEventMeta(event, type),
    };
  }

  if (normalizedType.includes("employee detached")) {
    return {
      title: "Сотрудник отвязан",
      description: `Связь мобильного аккаунта с сотрудником снята. ${details}`,
      meta: formatEventMeta(event, type),
    };
  }

  if (normalizedType.includes("login")) {
    return {
      title: "Вход в приложение",
      description: event.message || "Мобильный пользователь выполнил вход.",
      meta: formatEventMeta(event, type),
    };
  }

  if (normalizedType.includes("logout")) {
    return {
      title: "Выход из приложения",
      description: event.message || "Пользователь завершил мобильную сессию.",
      meta: formatEventMeta(event, type),
    };
  }

  if (normalizedType.includes("password") || normalizedType.includes("reset")) {
    return {
      title: "Пароль изменен",
      description: event.message || "Для мобильного аккаунта выполнено действие с паролем.",
      meta: formatEventMeta(event, type),
    };
  }

  if (normalizedType.includes("unblock")) {
    return {
      title: "Доступ восстановлен",
      description: event.message || "Блокировка мобильного аккаунта снята.",
      meta: formatEventMeta(event, type),
    };
  }

  if (normalizedType.includes("block")) {
    return {
      title: "Доступ заблокирован",
      description: event.message || "Мобильный аккаунт был заблокирован или получил отказ доступа.",
      meta: formatEventMeta(event, type),
    };
  }

  if (normalizedType.includes("create")) {
    return {
      title: "Аккаунт создан",
      description: event.message || "Создан мобильный аккаунт.",
      meta: formatEventMeta(event, type),
    };
  }

  if (normalizedType.includes("updated")) {
    return {
      title: "Аккаунт изменён",
      description: event.message || "Изменены параметры мобильного аккаунта.",
      meta: formatEventMeta(event, type),
    };
  }

  if (normalizedType.includes("deleted")) {
    return {
      title: "Аккаунт удалён",
      description: event.message || "Мобильный аккаунт удалён.",
      meta: formatEventMeta(event, type),
    };
  }

  return {
    title: "Событие доступа",
    description: event.message || "Зафиксировано изменение мобильного доступа.",
    meta: formatEventMeta(event, type),
  };
}

function formatEventMeta(event: MobileAccountSecurityEvent, type: string) {
  const actor = event.actor && event.actor !== "system" ? `Пользователь: ${event.actor}` : "Источник: система";
  return `${actor} · Код: ${type}`;
}

function eventTone(event: MobileAccountSecurityEvent) {
  const text = `${event.eventType} ${event.message}`.toLowerCase();
  if (text.includes("block") || text.includes("fail") || text.includes("ошиб") || text.includes("блок")) return "danger";
  if (text.includes("warning") || text.includes("reset") || text.includes("парол")) return "warning";
  if (text.includes("create") || text.includes("success") || text.includes("успеш")) return "success";
  return "info";
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
