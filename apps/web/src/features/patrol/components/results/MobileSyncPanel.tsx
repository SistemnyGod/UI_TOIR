import type { MobileDeviceHealth, MobileSyncConflict } from "../../../../types";
import { Chip, EmptyState, Panel } from "../../../../shared/ui";

export function MobileSyncPanel({
  conflicts,
  deviceHealth,
  errorMessage,
  onRefresh,
  onResolve,
  status,
}: {
  conflicts: MobileSyncConflict[];
  deviceHealth: MobileDeviceHealth[];
  errorMessage?: string;
  onRefresh: () => void;
  onResolve: (clientOperationId: string, status: "accepted" | "rejected" | "repeatRequested") => void;
  status: "idle" | "loading" | "ready" | "error";
}) {
  return (
    <Panel
      title="Мобильная синхронизация"
      actions={<button className="button ghost" onClick={onRefresh} type="button">Обновить</button>}
    >
      {status === "loading" ? (
        <EmptyState title="Проверяем мобильные отчеты" description="Загружаем устройства, зависшие команды и конфликты." />
      ) : null}
      {status === "error" ? (
        <EmptyState title="Синхронизация не загрузилась" description={errorMessage ?? "Backend API вернул ошибку."} />
      ) : null}
      {status !== "loading" && status !== "error" ? (
        <>
          {deviceHealth.length > 0 ? (
            <div className="anomaly-list">
              {deviceHealth.slice(0, 5).map((device) => (
                <div className="anomaly-row" key={device.mobileAccountId}>
                  <Chip>{formatDeviceStatus(device)}</Chip>
                  <div>
                    <strong>{device.login}</strong>
                    <span>
                      {device.deviceName ?? "Устройство не определено"} · push: {formatPushStatus(device.pushStatus)}
                    </span>
                    <small>
                      Последняя активность: {device.lastSeenAt ?? "нет"} · очередь: {device.pendingOutboxCount} · зависло: {device.staleOutboxCount}
                    </small>
                    {device.lastError ? <small>Ошибка: {device.lastError}</small> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Устройств нет" description="Мобильные устройства появятся после первого входа сотрудника." />
          )}

          {conflicts.length === 0 ? (
            <EmptyState title="Конфликтов нет" description="Отчеты с телефонов не требуют действий оператора." />
          ) : (
            <div className="anomaly-list">
              {conflicts.slice(0, 6).map((conflict) => (
                <div className="anomaly-row" key={conflict.clientOperationId}>
                  <Chip>{formatConflictStatus(conflict.status)}</Chip>
                  <div>
                    <strong>{conflict.commandType}</strong>
                    <span>
                      {conflict.accountLogin} · {conflict.message}
                    </span>
                    <small>{conflict.entityType} · {conflict.entityServerId ?? "без server id"} · {conflict.createdAtServer}</small>
                    <details>
                      <summary>Данные команды</summary>
                      <pre>{formatSnapshot(conflict.payloadSnapshot)}</pre>
                    </details>
                  </div>
                  <div className="inline-actions">
                    <button className="button ghost" onClick={() => onResolve(conflict.clientOperationId, "repeatRequested")} type="button">
                      Повторить
                    </button>
                    <button className="button ghost" onClick={() => onResolve(conflict.clientOperationId, "rejected")} type="button">
                      Отклонить
                    </button>
                    <button className="button primary" onClick={() => onResolve(conflict.clientOperationId, "accepted")} type="button">
                      Принять
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}
    </Panel>
  );
}

function formatDeviceStatus(device: MobileDeviceHealth) {
  if (device.staleOutboxCount > 0 || device.lastError) return "Есть ошибка";
  if (device.pendingOutboxCount > 0) return "Ожидает отправки";
  return "Норма";
}

function formatPushStatus(status: string) {
  if (status === "notRegistered") return "не зарегистрирован";
  if (status === "registered") return "зарегистрирован";
  if (status === "revoked") return "отозван";
  if (status === "sent") return "доставляется";
  if (status === "queued" || status === "sending") return "в очереди";
  if (status === "failed") return "ошибка";
  return status;
}

function formatConflictStatus(status: string) {
  if (status === "accepted") return "Решено";
  if (status === "rejected") return "Отклонено";
  if (status === "repeatRequested") return "Повторить";
  return "Открыто";
}

function formatSnapshot(value: unknown) {
  if (value === undefined || value === null) {
    return "{}";
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
