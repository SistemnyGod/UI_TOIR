import type { ServiceRequest } from "../../../../types";
import { Chip, Field } from "../../../../shared/ui";

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
  const hasPoint = Boolean(request.point.trim());
  const hasDescription = Boolean(request.description.trim());
  const hasNotification = request.notifyEmployee && Boolean(request.notificationText.trim());
  const timeline = request.timeline.filter(Boolean);

  return (
    <section
      aria-label="Просмотр заявки на обход"
      aria-modal="true"
      className="modal-window request-modal request-view-modal"
      onMouseDown={(event) => event.stopPropagation()}
      role="dialog"
    >
      <div className="modal-head">
        <div>
          <span className="modal-kicker">Заявка на обход · {request.id}</span>
          <h2>{request.title || "Заявка на обход"}</h2>
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
          <Field label="Сотрудник" value={request.employee || "Не назначен"} />
          <Field label="Маршрут" value={request.route || "Не выбран"} />
          {hasPoint ? <Field label="Точка / основание" value={request.point} /> : null}
        </dl>

        {hasDescription ? (
          <div className="request-description">
            <h3>Описание</h3>
            <p>{request.description}</p>
          </div>
        ) : null}

        {hasNotification ? (
          <div className="request-description info-soft">
            <h3>Текст уведомления</h3>
            <p>{request.notificationText}</p>
          </div>
        ) : null}

        {timeline.length > 0 ? (
          <div className="request-timeline-block">
            <h3>Ход обработки</h3>
            <ol className="request-timeline">
              {timeline.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>

      <div className="modal-actions">
        <button className="button ghost" onClick={onCreateRelated} type="button">
          Повторить заявку
        </button>
        <button className="button primary" onClick={onClose} type="button">
          Закрыть
        </button>
      </div>
    </section>
  );
}
