import type { MobileSyncConflict } from "../../types";
import { Chip, EmptyState, Panel } from "../ui";

export function MobileSyncPanel({
  conflicts,
  errorMessage,
  onRefresh,
  onResolve,
  status,
}: {
  conflicts: MobileSyncConflict[];
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
        <EmptyState title="Проверяем мобильные отчеты" description="Загружаем конфликты и отклоненные команды." />
      ) : null}
      {status === "error" ? (
        <EmptyState title="Синхронизация не загрузилась" description={errorMessage ?? "Backend API вернул ошибку."} />
      ) : null}
      {status !== "loading" && status !== "error" && conflicts.length === 0 ? (
        <EmptyState title="Конфликтов нет" description="Отчеты с телефонов не требуют действий оператора." />
      ) : null}
      {status !== "loading" && status !== "error" && conflicts.length > 0 ? (
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
      ) : null}
    </Panel>
  );
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
