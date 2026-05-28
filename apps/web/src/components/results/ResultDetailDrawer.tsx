import type { PatrolResult, ScreenId } from "../../types";
import { Chip, EmptyState, Field } from "../ui";

export function ResultDetailDrawer({
  canCreateRequest = true,
  onCreateRequest,
  onNavigate,
  onNotify,
  onOpenRequest,
  result,
}: {
  canCreateRequest?: boolean;
  onCreateRequest: (sourceResultId?: string) => void;
  onNavigate: (screen: ScreenId) => void;
  onNotify: (message: string) => void;
  onOpenRequest: (resultId?: string) => void;
  result?: PatrolResult;
}) {
  if (!result) {
    return (
      <aside className="side-drawer">
        <EmptyState title="Результат не выбран" description="Детали появятся после загрузки или выбора записи." />
      </aside>
    );
  }

  const hasIssue = result.comment !== "Без замечаний";

  return (
    <aside className="side-drawer">
      <div className="drawer-title">
        <div>
          <h2>Детали результата</h2>
          <p>Результат № {result.id}</p>
        </div>
        <Chip>{result.status}</Chip>
      </div>

      <dl className="meta-list">
        <Field label="Источник" value={result.source === "mobile" ? "Мобильное приложение" : "Web-панель"} />
        <Field label="Сотрудник" value={`${result.employee} · ID: ${result.employeeId}`} />
        <Field label="Маршрут" value={result.route} />
        <Field label="Точка" value={`${result.point} · ID: ${result.pointId}`} />
        <Field label="Территория" value={result.territory} />
        <Field label="Смена" value={<Chip>{result.shift}</Chip>} />
        <Field label="Плановое время" value={result.plannedAt} />
        <Field label="Фактическое время" value={result.actualAt} />
        <Field
          label="Отклонение"
          value={<span className={result.deviation.startsWith("+") ? "danger-text" : "success-text"}>{result.deviation}</span>}
        />
        <Field label="Комментарий" value={result.comment} />
      </dl>

      <h3>Вложения</h3>
      <div className="attachment-list">
        {result.attachments && result.attachments.length > 0 ? (
          result.attachments.map((attachment, index) => (
            <a
              className="attachment-row"
              href={attachment.downloadUrl}
              key={attachment.id}
              rel="noreferrer"
              target="_blank"
            >
              <span>{attachment.fileName || `Фото ${index + 1}`}</span>
              <small>{formatAttachmentSize(attachment.sizeBytes)} · {attachment.createdAt}</small>
            </a>
          ))
        ) : (
          <span className="attachment-empty">Фото не приложены</span>
        )}
      </div>

      <div className="comment-box result-comment">
        <strong>Описание выявленного отклонения</strong>
        <p>{hasIssue ? result.comment : "Отклонений не зафиксировано."}</p>
      </div>

      <h3>Хронология действий</h3>
      <ol className="chronology">
        {result.chronology.map((item, index) => (
          <li key={item}>
            <span>{index + 1}</span>
            {item}
            <time>время из журнала</time>
          </li>
        ))}
      </ol>

      <div className="drawer-actions">
        <button
          className="button ghost"
          disabled={!result.attachments?.length}
          onClick={() => {
            const firstAttachment = result.attachments?.[0];
            if (firstAttachment) {
              window.open(firstAttachment.downloadUrl, "_blank", "noreferrer");
            } else {
              onNotify("Фото не приложены");
            }
          }}
          type="button"
        >
          Открыть вложения
        </button>
        <button className="button ghost" onClick={() => onNavigate("routes")} type="button">
          Перейти к маршруту
        </button>
        <button className="button ghost" disabled={!canCreateRequest} onClick={() => onCreateRequest(result.id)} type="button">
          Создать заявку
        </button>
        <button className="button primary" onClick={() => onOpenRequest(result.id)} type="button">
          Открыть заявку
        </button>
      </div>
    </aside>
  );
}

function formatAttachmentSize(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "размер неизвестен";
  }

  if (sizeBytes < 1024 * 1024) {
    return `${Math.ceil(sizeBytes / 1024)} КБ`;
  }

  return `${(sizeBytes / 1024 / 1024).toFixed(1)} МБ`;
}
