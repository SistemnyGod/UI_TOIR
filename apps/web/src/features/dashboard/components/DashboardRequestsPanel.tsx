import type { DataSourceStatus, ServiceRequest } from "../../../types";
import { Chip, EmptyState, Panel } from "../../../shared/ui";

export function DashboardRequestsPanel({
  requests,
  status = "idle",
  errorMessage,
  onCreateRequest,
  onOpenRequestById,
  onRetry,
}: {
  requests: ServiceRequest[];
  status?: DataSourceStatus;
  errorMessage?: string;
  onCreateRequest: () => void;
  onOpenRequestById: (requestId: string) => void;
  onRetry?: () => void | Promise<void>;
}) {
  const isLoading = status === "loading";
  const isError = status === "error";

  return (
    <Panel
      className="dashboard-requests-panel"
      title="Заявки на обходы"
      note="Заявки, которые оператор отправил сотрудникам для прохождения маршрута"
      actions={
        <button className="link-button" onClick={onCreateRequest} type="button">
          Создать заявку
        </button>
      }
    >
      {isLoading ? (
        <EmptyState
          title="Заявки загружаются"
          description="Получаем список заявок из backend API. Данные localStorage в этом режиме не подмешиваются."
        />
      ) : isError ? (
        <EmptyState
          title="Заявки API не загружены"
          description={errorMessage ?? "Проверьте доступность backend API и повторите загрузку."}
          action={
            onRetry ? (
              <button className="button ghost" onClick={() => void onRetry()} type="button">
                Повторить загрузку
              </button>
            ) : undefined
          }
        />
      ) : requests.length > 0 ? (
        <div className="request-list">
          {requests.slice(0, 4).map((request) => (
            <button
              className="request-list-row"
              key={request.id}
              onClick={() => onOpenRequestById(request.id)}
              type="button"
            >
              <div className="request-row-main">
                <strong>{request.title}</strong>
                <span>
                  {request.employee} · {request.route}
                </span>
              </div>
              <Chip>{request.status}</Chip>
              <Chip>{request.notifyEmployee ? "Уведомление" : "Без уведомления"}</Chip>
              <div className="request-row-meta">
                <strong>{request.scheduledTime || "Время не задано"}</strong>
                <span>{request.dueAt}</span>
              </div>
              <span className="mini-action-button">Открыть</span>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Заявок нет"
          description="Создайте заявку на проведение обхода: выберите дату, сотрудника и маршрут."
          action={
            <button className="button ghost" onClick={onCreateRequest} type="button">
              Создать заявку
            </button>
          }
        />
      )}
    </Panel>
  );
}
