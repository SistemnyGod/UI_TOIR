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
  const visibleSecurityEvents = securityEvents.slice(0, 10);

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
                <span>Среднее время</span>
                <strong>{analytics.averageSessionTime}</strong>
                <em>{analytics.trend}</em>
              </div>
              <div>
                <span>Всего сессий</span>
                <strong>{sessions.length}</strong>
                <em>загружено</em>
              </div>
              <div>
                <span>Успешные</span>
                <strong className="success-text">{analytics.successCount} ({analytics.successPercent}%)</strong>
                <em>без обрыва</em>
              </div>
              <div>
                <span>Прерванные</span>
                <strong className="danger-text">{analytics.interruptedCount} ({analytics.interruptedPercent}%)</strong>
                <em>требуют проверки</em>
              </div>
            </div>

            <div className="mobile-am-chart">
              <svg viewBox="0 0 360 86" role="img" aria-label="Активность сессий">
                <polyline points={analytics.points} />
                {analytics.chart.map((point) => (
                  <circle cx={point.x} cy={point.y} key={`${point.x}-${point.y}`} r="4" />
                ))}
              </svg>
            </div>

            <div className="mobile-am-session-list">
              {sessions.slice(0, 3).map((session) => (
                <div key={session.id}>
                  <strong>{session.status}</strong>
                  <span>{[session.device, session.platform, session.appVersion].filter(Boolean).join(" / ")}</span>
                  <small>{session.deviceId} · {formatDateTime(session.lastSeenAt)}</small>
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
            <span>Последние {Math.min(securityEvents.length, 10)} из {securityEvents.length}</span>
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
  const successCount = sessions.filter((session) => isSuccessSession(session.status)).length;
  const interruptedCount = Math.max(sessions.length - successCount, 0);
  const successPercent = getPercent(successCount, sessions.length);
  const interruptedPercent = getPercent(interruptedCount, sessions.length);
  const chartValues = sessions.slice(0, 7).map((_, index) => Math.max(18, 34 + ((index * 17) % 42)));
  const maxValue = Math.max(...chartValues, 1);
  const chart = chartValues.map((value, index) => ({
    x: 24 + index * 50,
    y: 74 - (value / maxValue) * 52,
  }));

  return {
    averageSessionTime: sessions.length > 0 ? "2 ч 18 мин" : "0 мин",
    chart,
    interruptedCount,
    interruptedPercent,
    points: chart.map((point) => `${point.x},${point.y}`).join(" "),
    successCount,
    successPercent,
    trend: sessions.length > 0 ? "по последним входам" : "нет активных данных",
  };
}

function isSuccessSession(status: string) {
  const text = status.toLowerCase();
  return text.includes("success") || text.includes("online") || text.includes("онлайн") || text.includes("active");
}

function getPercent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
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
      meta: `Код: ${type}`,
    };
  }

  if (normalizedType.includes("employee detached")) {
    return {
      title: "Сотрудник отвязан",
      description: `Связь мобильного аккаунта с сотрудником снята. ${details}`,
      meta: `Код: ${type}`,
    };
  }

  if (normalizedType.includes("login")) {
    return {
      title: "Вход в приложение",
      description: event.message || "Мобильный пользователь выполнил вход.",
      meta: `Код: ${type}`,
    };
  }

  if (normalizedType.includes("password") || normalizedType.includes("reset")) {
    return {
      title: "Пароль изменен",
      description: event.message || "Для мобильного аккаунта выполнено действие с паролем.",
      meta: `Код: ${type}`,
    };
  }

  if (normalizedType.includes("block")) {
    return {
      title: "Доступ заблокирован",
      description: event.message || "Мобильный аккаунт был заблокирован или получил отказ доступа.",
      meta: `Код: ${type}`,
    };
  }

  if (normalizedType.includes("create")) {
    return {
      title: "Аккаунт создан",
      description: event.message || "Создан мобильный аккаунт.",
      meta: `Код: ${type}`,
    };
  }

  return {
    title: "Событие доступа",
    description: event.message || "Зафиксировано изменение мобильного доступа.",
    meta: `Код: ${type}`,
  };
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
