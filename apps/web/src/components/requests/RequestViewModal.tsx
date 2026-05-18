import type { ServiceRequest } from "../../types";
import { Chip, Field } from "../ui";

export function RequestViewModal({
  request,
  onClose,
  onCreateRelated,
}: {
  request: ServiceRequest;
  onClose: () => void;
  onCreateRelated: () => void;
}) {
  const timeLabel = request.scheduledTime || "Не указано";

  return (
    <section
      aria-label="Просмотр заявки на обход"
      aria-modal="true"
      className="modal-window request-modal"
      onMouseDown={(event) => event.stopPropagation()}
      role="dialog"
    >
      <div className="modal-head">
        <div>
          <span className="modal-kicker">Заявка на обход · {request.id}</span>
          <h2>{request.title}</h2>
          <p>{request.source}</p>
        </div>
        <button aria-label="Закрыть" className="modal-close" onClick={onClose} type="button">
          ×
        </button>
      </div>

      <div className="request-state-grid">
        <div>
          <span>Статус</span>
          <Chip>{request.status}</Chip>
        </div>
        <div>
          <span>Дата обхода</span>
          <strong>{request.dueAt}</strong>
        </div>
        <div>
          <span>Время</span>
          <strong>{timeLabel}</strong>
        </div>
        <div>
          <span>Уведомление</span>
          <Chip>{request.notifyEmployee ? "Включено" : "Отключено"}</Chip>
        </div>
      </div>

      <div className="request-modal-body">
        <dl className="meta-list request-meta-list">
          <Field label="Сотрудник" value={request.employee} />
          <Field label="Маршрут" value={request.route} />
          <Field label="Точка / основание" value={request.point} />
          <Field label="Создана" value={request.createdAt} />
        </dl>

        <div className="request-description">
          <h3>Описание</h3>
          <p>{request.description}</p>
        </div>

        {request.notifyEmployee ? (
          <div className="request-description info-soft">
            <h3>Текст уведомления сотруднику</h3>
            <p>{request.notificationText}</p>
          </div>
        ) : null}

        <div>
          <h3>Ход обработки</h3>
          <ol className="request-timeline">
            {request.timeline.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
      </div>

      <div className="modal-actions">
        <button className="button ghost" onClick={onCreateRelated} type="button">
          Создать повторную заявку
        </button>
        <button className="button primary" onClick={onClose} type="button">
          Закрыть просмотр
        </button>
      </div>
    </section>
  );
}
