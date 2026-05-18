import type { ServiceRequest } from "../../types";
import { Chip, EmptyState, Panel } from "../ui";

export function DashboardRequestsPanel({
  requests,
  onCreateRequest,
  onOpenRequestById,
}: {
  requests: ServiceRequest[];
  onCreateRequest: () => void;
  onOpenRequestById: (requestId: string) => void;
}) {
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
      {requests.length > 0 ? (
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
