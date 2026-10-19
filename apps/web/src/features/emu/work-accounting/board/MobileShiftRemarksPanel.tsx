import type { EmuShiftRemarkDto } from "../../../../api/contracts";
import { Panel } from "../../../../shared/ui";

export function MobileShiftRemarksPanel({ remarks, total }: { remarks: EmuShiftRemarkDto[]; total: number }) {
  if (!total && !remarks.length) return null;
  return (
    <details className="emu-mobile-remarks-disclosure">
    <summary>Замечания с телефона <span>{remarks.length} в выборке</span></summary>
    <Panel
      className="emu-shift-remarks-panel"
      note="Сотрудники фиксируют замечания на телефоне; после синхронизации они появляются здесь."
      title="Замечания из мобильного приложения"
      actions={<span className="emu-decision-badge">Всего в журнале: {total}</span>}
    >
      {remarks.length === 0 ? (
        <div className="emu-empty-state">Замечаний по выбранному участку пока нет.</div>
      ) : (
        <div className="emu-shift-remark-grid">
          {remarks.map((remark) => (
            <article className="emu-shift-remark-card" key={remark.id}>
              <header>
                <div>
                  <strong>{remark.sectionName}</strong>
                  <span>{remark.employeeName}</span>
                </div>
                <span className="emu-status-pill">{remarkStatusText(remark.status)}</span>
              </header>
              <p>{remark.comment}</p>
              <dl>
                <div>
                  <dt>Создано</dt>
                  <dd>{formatRemarkDate(remark.createdAtLocal)}</dd>
                </div>
                <div>
                  <dt>Доставлено</dt>
                  <dd>{formatRemarkDate(remark.createdAtServer)}</dd>
                </div>
                <div>
                  <dt>Источник</dt>
                  <dd>Мобильное приложение</dd>
                </div>
              </dl>
              <div className="emu-shift-remark-attachments">
                {remark.attachments.length === 0 ? (
                  <span>Вложений нет</span>
                ) : (
                  remark.attachments.map((file) => (
                    <a href={file.downloadUrl} key={file.fileId} rel="noreferrer" target="_blank">
                      {isVideoAttachment(file.contentType) ? "Видео" : "Фото"} · {formatFileSize(file.sizeBytes)}
                    </a>
                  ))
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </Panel>
    </details>
  );
}

function remarkStatusText(status: string) {
  if (status === "accepted") return "Принято";
  if (status === "pending") return "Ожидает отправки";
  if (status === "rejected") return "Отклонено";
  if (status === "conflict") return "Конфликт";
  return status || "-";
}

function formatRemarkDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function isVideoAttachment(contentType: string) {
  return contentType.toLowerCase().startsWith("video/");
}

function formatFileSize(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return "0 МБ";
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} КБ`;
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} МБ`;
}
