import { buildActivePatrolDetail } from "../../domain/activePatrolDetails";
import type { ActivePatrol, ScreenId } from "../../types";
import { Chip, EmptyState, ProgressBar } from "../ui";

export function ActivePatrolDetail({
  patrol,
  onCreateRequest,
  onNavigate,
  onNotify,
  onOpenRequest,
}: {
  patrol?: ActivePatrol;
  onCreateRequest: () => void;
  onNavigate: (screen: ScreenId) => void;
  onNotify: (message: string) => void;
  onOpenRequest: () => void;
}) {
  if (!patrol) {
    return (
      <div className="dashboard-next-panel">
        <div className="drawer-title">
          <div>
            <h2>Следующие действия</h2>
            <p>Пока нет активного обхода</p>
          </div>
          <Chip tone="slate">Пусто</Chip>
        </div>
        <EmptyState
          title="Активный обход не выбран"
          description="Карточка прохождения появится после старта обхода или выбора строки."
        />
        <div className="next-action-list">
          <button onClick={() => onNavigate("routes")} type="button">
            <span>1</span>
            <div>
              <strong>Создать маршруты и точки</strong>
              <small>NFC/QR, порядок точек, требования к фото</small>
            </div>
          </button>
          <button onClick={() => onNavigate("accounts")} type="button">
            <span>2</span>
            <div>
              <strong>Создать мобильный аккаунт</strong>
              <small>Логин, пароль и привязка сотрудника</small>
            </div>
          </button>
          <button onClick={() => onNavigate("assign")} type="button">
            <span>3</span>
            <div>
              <strong>Назначить первый обход</strong>
              <small>Сотрудник, маршрут, старт смены</small>
            </div>
          </button>
        </div>
      </div>
    );
  }

  const detail = buildActivePatrolDetail(patrol);

  return (
    <>
      <div className="drawer-title">
        <div>
          <h2>Прохождение маршрута</h2>
          <p>
            {patrol.employee} · {patrol.route}
          </p>
        </div>
        <Chip>{patrol.status}</Chip>
      </div>

      <div className="patrol-detail-summary">
        <div>
          <span>Начал обход</span>
          <strong>{detail.startedAt}</strong>
        </div>
        <div>
          <span>Всего времени</span>
          <strong>{detail.totalTime}</strong>
        </div>
        <div>
          <span>Последняя метка</span>
          <strong>{detail.lastScanAt}</strong>
        </div>
        <div>
          <span>Точки</span>
          <strong>
            {detail.completedPoints} / {detail.totalPoints}
          </strong>
        </div>
      </div>

      <div className="drawer-progress">
        <span>Прогресс маршрута</span>
        <strong>{patrol.progress}%</strong>
      </div>
      <ProgressBar value={patrol.progress} />

      <div className="checkpoint-list">
        {detail.checkpoints.map((point, index) => (
          <div className={`checkpoint-row ${point.status === "Неисправно" ? "problem" : ""}`} key={point.id}>
            <span className="checkpoint-index">{index + 1}</span>
            <div className="checkpoint-body">
              <div className="checkpoint-line">
                <strong>{point.name}</strong>
                <Chip>{point.status}</Chip>
              </div>
              <div className="checkpoint-meta">
                <span>Метка: {point.activatedAt ?? "не активирована"}</span>
                <span>Факт: {point.scannedAt ?? "ожидает"}</span>
              </div>
              {point.comment ? <p>{point.comment}</p> : null}
              {point.media && point.media.length > 0 ? (
                <div className="media-tags">
                  {point.media.map((media) => (
                    <span className="media-chip" key={media.id}>
                      {media.type}: {media.label}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <div className="detail-section">
        <div className="section-line-title">
          <h3>Фото и видео</h3>
          <button
            className="link-button"
            onClick={() => onNotify("Галерея медиа откроется после подключения файлового API")}
            type="button"
          >
            Все медиа
          </button>
        </div>
        {detail.media.length > 0 ? (
          <div className="patrol-media-grid">
            {detail.media.slice(0, 4).map((media) => (
              <span className={`media-preview ${media.type === "Видео" ? "video" : ""}`} key={media.id}>
                {media.type}
                <small>{media.label}</small>
              </span>
            ))}
          </div>
        ) : (
          <EmptyState title="Медиа пока нет" description="Фото и видео появятся после загрузки из мобильного приложения." />
        )}
      </div>

      <div className="drawer-actions vertical-actions">
        <button
          className="button ghost"
          onClick={() => onNotify("Карта активного обхода откроется после подключения маршрутов")}
          type="button"
        >
          Открыть на карте
        </button>
        <button className="button ghost" onClick={onOpenRequest} type="button">
          Открыть заявку
        </button>
        <button className="button ghost" onClick={onCreateRequest} type="button">
          Создать заявку
        </button>
      </div>
    </>
  );
}
