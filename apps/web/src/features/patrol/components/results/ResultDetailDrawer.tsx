import { useEffect, useMemo, useState } from "react";
import { downloadResultAttachment } from "../../../../repositories/resultsRepository";
import type { PatrolResult, ScreenId } from "../../../../types";
import { Chip, EmptyState, Field } from "../../../../shared/ui";

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
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const imageAttachments = useMemo(
    () => result?.attachments?.filter((attachment) => attachment.contentType.toLowerCase().startsWith("image/")) ?? [],
    [result?.attachments],
  );

  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];

    if (imageAttachments.length === 0) {
      setPreviewUrls({});
      return undefined;
    }

    void Promise.all(
      imageAttachments.map(async (attachment) => {
        try {
          const file = await downloadResultAttachment(attachment);
          if (cancelled) return [attachment.id, ""] as const;

          const url = URL.createObjectURL(file.blob);
          if (cancelled) {
            URL.revokeObjectURL(url);
            return [attachment.id, ""] as const;
          }

          objectUrls.push(url);
          return [attachment.id, url] as const;
        } catch {
          return [attachment.id, ""] as const;
        }
      }),
    ).then((entries) => {
      if (!cancelled) {
        setPreviewUrls(Object.fromEntries(entries.filter(([, url]) => url)));
      }
    });

    return () => {
      cancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [imageAttachments]);

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
      {imageAttachments.length > 0 ? (
        <div className="attachment-preview-grid">
          {imageAttachments.map((attachment, index) => (
            <button className="attachment-preview" key={attachment.id} onClick={() => void openAttachment(attachment, onNotify)} type="button">
              {previewUrls[attachment.id] ? (
                <img alt={attachment.fileName || `Фото ${index + 1}`} src={previewUrls[attachment.id]} />
              ) : (
                <span>Фото {index + 1}</span>
              )}
            </button>
          ))}
        </div>
      ) : null}
      <div className="attachment-list">
        {result.attachments && result.attachments.length > 0 ? (
          result.attachments.map((attachment, index) => (
            <button
              className="attachment-row"
              key={attachment.id}
              onClick={() => void openAttachment(attachment, onNotify)}
              type="button"
            >
              <span>{attachment.fileName || `Фото ${index + 1}`}</span>
              <small>{formatAttachmentSize(attachment.sizeBytes)} · {attachment.createdAt}</small>
            </button>
          ))
        ) : result.photos > 0 ? (
          <span className="attachment-empty">Фото есть в отчете, детали еще загружаются</span>
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
              void openAttachment(firstAttachment, onNotify);
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

async function openAttachment(attachment: NonNullable<PatrolResult["attachments"]>[number], onNotify: (message: string) => void) {
  try {
    const file = await downloadResultAttachment(attachment);
    const url = URL.createObjectURL(file.blob);
    window.open(url, "_blank", "noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось открыть фото";
    onNotify(`Не удалось открыть фото: ${message}`);
  }
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
