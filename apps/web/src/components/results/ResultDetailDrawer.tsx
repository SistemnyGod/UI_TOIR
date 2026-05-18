import type { PatrolResult, ScreenId } from "../../types";
import { Chip, EmptyState, Field } from "../ui";

export function ResultDetailDrawer({
  onCreateRequest,
  onNavigate,
  onNotify,
  onOpenRequest,
  result,
}: {
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
        {result.photos > 0 ? (
          Array.from({ length: result.photos }, (_, index) => (
            <button
              className="attachment-row"
              key={`${result.id}:photo:${index}`}
              onClick={() => onNotify("Вложение откроется после подключения файлового API")}
              type="button"
            >
              <span>Фото {index + 1}</span>
              <small>ожидает файлового API</small>
            </button>
          ))
        ) : (
          <span className="attachment-empty">Вложений нет</span>
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
          onClick={() => onNotify("Фото результата откроются после подключения файлов")}
          type="button"
        >
          Открыть вложения
        </button>
        <button className="button ghost" onClick={() => onNavigate("routes")} type="button">
          Перейти к маршруту
        </button>
        <button className="button ghost" onClick={() => onCreateRequest(result.id)} type="button">
          Создать заявку
        </button>
        <button className="button primary" onClick={() => onOpenRequest(result.id)} type="button">
          Открыть заявку
        </button>
      </div>
    </aside>
  );
}
