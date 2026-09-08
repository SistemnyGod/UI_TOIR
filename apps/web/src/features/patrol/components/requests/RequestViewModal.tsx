import type { ServiceRequest } from "../../../../types";
import { Button, Chip, Field, ModalShell } from "../../../../shared/ui";
import { cancellationReasonLabel } from "../../../../domain/patrolCancellation";

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
  const normalizedStatus = String(request.status).toLowerCase();
  const isCancelled = request.isCancelled || normalizedStatus.includes("отмен") || normalizedStatus.includes("cancel");

  return (
    <ModalShell
      actions={
        <>
          <Button onClick={onCreateRelated} variant="ghost">
            Повторить заявку
          </Button>
          <Button onClick={onClose} variant="primary">
            Закрыть
          </Button>
        </>
      }
      className="request-view-modal"
      onClose={onClose}
      subtitle={`Заявка на обход · ${request.id}`}
      title={request.title || "Заявка на обход"}
    >

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

        {isCancelled ? (
          <div className="request-description danger-soft">
            <h3>Заявка отменена</h3>
            <p><strong>Причина:</strong> {cancellationReasonLabel(request.cancellationReasonCode, request.cancellationReasonText)}</p>
            {request.cancelledAt ? <p><strong>Дата отмены:</strong> {request.cancelledAt}</p> : null}
            {request.cancelledByUserName ? <p><strong>Отменил:</strong> {request.cancelledByUserName}</p> : null}
          </div>
        ) : null}

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
    </ModalShell>
  );
}
