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
  const timeLabel = request.scheduledTime || "РќРµ СѓРєР°Р·Р°РЅРѕ";
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
            РџРѕРІС‚РѕСЂРёС‚СЊ Р·Р°СЏРІРєСѓ
          </Button>
          <Button onClick={onClose} variant="primary">
            Р—Р°РєСЂС‹С‚СЊ
          </Button>
        </>
      }
      className="request-view-modal"
      onClose={onClose}
      subtitle={`Р—Р°СЏРІРєР° РЅР° РѕР±С…РѕРґ В· ${request.id}`}
      title={request.title || "Р—Р°СЏРІРєР° РЅР° РѕР±С…РѕРґ"}
    >

      <div className="request-state-grid">
        <div>
          <span>РЎС‚Р°С‚СѓСЃ</span>
          <Chip>{request.status}</Chip>
        </div>
        <div>
          <span>Р”Р°С‚Р° РѕР±С…РѕРґР°</span>
          <strong>{request.dueAt}</strong>
        </div>
        <div>
          <span>Р’СЂРµРјСЏ</span>
          <strong>{timeLabel}</strong>
        </div>
        <div>
          <span>РЈРІРµРґРѕРјР»РµРЅРёРµ</span>
          <Chip>{request.notifyEmployee ? "Р’РєР»СЋС‡РµРЅРѕ" : "РћС‚РєР»СЋС‡РµРЅРѕ"}</Chip>
        </div>
      </div>

      <div className="request-modal-body">
        <dl className="meta-list request-meta-list">
          <Field label="РЎРѕС‚СЂСѓРґРЅРёРє" value={request.employee || "РќРµ РЅР°Р·РЅР°С‡РµРЅ"} />
          <Field label="РњР°СЂС€СЂСѓС‚" value={request.route || "РќРµ РІС‹Р±СЂР°РЅ"} />
          {hasPoint ? <Field label="РўРѕС‡РєР° / РѕСЃРЅРѕРІР°РЅРёРµ" value={request.point} /> : null}
        </dl>

        {isCancelled ? (
          <div className="request-description danger-soft">
            <h3>Р—Р°СЏРІРєР° РѕС‚РјРµРЅРµРЅР°</h3>
            <p><strong>РџСЂРёС‡РёРЅР°:</strong> {cancellationReasonLabel(request.cancellationReasonCode, request.cancellationReasonText)}</p>
            {request.cancelledAt ? <p><strong>Р”Р°С‚Р° РѕС‚РјРµРЅС‹:</strong> {request.cancelledAt}</p> : null}
            {request.cancelledByUserName ? <p><strong>РћС‚РјРµРЅРёР»:</strong> {request.cancelledByUserName}</p> : null}
          </div>
        ) : null}

        {hasDescription ? (
          <div className="request-description">
            <h3>РћРїРёСЃР°РЅРёРµ</h3>
            <p>{request.description}</p>
          </div>
        ) : null}

        {hasNotification ? (
          <div className="request-description info-soft">
            <h3>РўРµРєСЃС‚ СѓРІРµРґРѕРјР»РµРЅРёСЏ</h3>
            <p>{request.notificationText}</p>
          </div>
        ) : null}

        {timeline.length > 0 ? (
          <div className="request-timeline-block">
            <h3>РҐРѕРґ РѕР±СЂР°Р±РѕС‚РєРё</h3>
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
