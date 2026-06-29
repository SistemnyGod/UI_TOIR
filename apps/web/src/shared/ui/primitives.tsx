import type { ReactNode } from "react";
import type { Tone } from "../../types";

const toneByValue: Record<string, Tone> = {
  "В пути": "blue",
  "Задержка": "red",
  "Нет связи": "slate",
  "Завершает": "green",
  "Ожидает": "slate",
  "Запланирован": "violet",
  "Подтверждено": "green",
  "Замечание": "orange",
  "Просрочено": "red",
  "Не подтверждено": "slate",
  "Активен": "green",
  "Активна": "green",
  "Не привязан": "orange",
  "Привязан": "green",
  "Заблокирован": "red",
  "Неактивен": "slate",
  "Онлайн": "green",
  "Офлайн": "slate",
  "На смене": "blue",
  "Отпуск": "violet",
  "День": "day",
  "Ночь": "night",
  "Дневная": "day",
  "Ночная": "night",
  "Высокий": "red",
  "Средний": "orange",
  "Обычный": "slate",
  "Высокая": "red",
  "Средняя": "orange",
  "Низкая": "green",
  "Повтор метки": "blue",
  "Черновик": "orange",
  "Администратор": "violet",
  "Оператор": "blue",
  "Руководитель": "orange",
  "Аудитор": "green",
  "Новая": "blue",
  "В работе": "orange",
  "Назначена": "violet",
  "Закрыта": "green",
  "Низкий": "green",
  "Критический": "red",
  "Исправно": "green",
  "Неисправно": "red",
  "Пропущено": "orange",
  "Уведомление": "blue",
  "Без уведомления": "slate",
};

export function toneFor(value: string): Tone {
  return toneByValue[value] ?? "neutral";
}

export function Chip({ children, tone }: { children: ReactNode; tone?: Tone }) {
  const label = String(children);
  return <span className={`chip ${tone ?? toneFor(label)}`}>{children}</span>;
}

export function Panel({
  title,
  note,
  actions,
  children,
  className = "",
}: {
  title?: string;
  note?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || note || actions) && (
        <div className="panel-head">
          <div>
            {title ? <h2>{title}</h2> : null}
            {note ? <p>{note}</p> : null}
          </div>
          {actions ? <div className="panel-actions">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}

export function ProgressBar({ value, tone = "blue" }: { value: number; tone?: Tone }) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div className={`progress-bar ${tone}`} aria-label={`Прогресс ${value}%`}>
      <span style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function StatTile({
  icon,
  label,
  value,
  hint,
  tone = "blue",
}: {
  icon: string;
  label: string;
  value: string;
  hint: string;
  tone?: Tone;
}) {
  return (
    <article className={`stat-tile ${tone}`}>
      <MetricGlyph icon={icon} tone={tone} />
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <em>{hint}</em>
      </div>
    </article>
  );
}

function MetricGlyph({ icon, tone }: { icon: string; tone: Tone }) {
  const normalized = icon.toLowerCase();
  const glyph =
    normalized === "ok" || icon === "✓"
      ? "check"
      : normalized === "run" || icon === "↻"
        ? "route"
        : normalized === "map" || icon === "⌖"
          ? "map"
          : normalized.includes("!") || icon === "!"
            ? "alert"
            : "grid";

  return (
    <span className={`metric-glyph ${tone}`} aria-hidden="true">
      <svg viewBox="0 0 24 24">
        {glyph === "check" ? (
          <>
            <path d="M20 7 9.5 17.5 4 12" />
            <path d="M12 3.5 5.5 6v5.6c0 3.8 2.5 7.1 6.5 8.9 4-1.8 6.5-5.1 6.5-8.9V6L12 3.5Z" />
          </>
        ) : null}
        {glyph === "route" ? (
          <>
            <circle cx="6" cy="7" r="2.5" />
            <circle cx="18" cy="8" r="2.5" />
            <circle cx="11" cy="18" r="2.5" />
            <path d="M8.4 7.3 15.5 7.8" />
            <path d="M16.5 10.1 12.5 16" />
          </>
        ) : null}
        {glyph === "alert" ? (
          <>
            <path d="M12 4 21 20H3L12 4Z" />
            <path d="M12 9v5" />
            <path d="M12 17h.01" />
          </>
        ) : null}
        {glyph === "map" ? (
          <>
            <path d="M4 6.5 9.5 4l5 2 5.5-2.5v14l-5.5 2.5-5-2L4 20.5v-14Z" />
            <path d="M9.5 4v14" />
            <path d="M14.5 6v14" />
          </>
        ) : null}
        {glyph === "grid" ? (
          <>
            <rect x="4" y="4" width="6" height="6" rx="1.4" />
            <rect x="14" y="4" width="6" height="6" rx="1.4" />
            <rect x="4" y="14" width="6" height="6" rx="1.4" />
            <rect x="14" y="14" width="6" height="6" rx="1.4" />
          </>
        ) : null}
      </svg>
    </span>
  );
}

export function SectionTabs<T extends string>({
  value,
  tabs,
  onChange,
}: {
  value: T;
  tabs: Array<{ id: T; label: string; count?: string | number }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="section-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          aria-selected={value === tab.id}
          className={`section-tab ${value === tab.id ? "active" : ""}`}
          key={tab.id}
          onClick={() => onChange(tab.id)}
          role="tab"
          type="button"
        >
          <span>{tab.label}</span>
          {tab.count !== undefined ? <small>{tab.count}</small> : null}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="field-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {description ? <span>{description}</span> : null}
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}