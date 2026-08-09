import type { ReactNode } from "react";

export function PageHeader({
  actions,
  className = "",
  description,
  eyebrow,
  eyebrowClassName = "",
  title,
}: {
  actions?: ReactNode;
  className?: string;
  description?: string;
  eyebrow?: string;
  eyebrowClassName?: string;
  title: string;
}) {
  return (
    <header className={`ui-page-header ${className}`.trim()}>
      <div className="ui-page-header__copy">
        {eyebrow ? <span className={`ui-page-header__eyebrow ${eyebrowClassName}`.trim()}>{eyebrow}</span> : null}
        <h1 className="ui-page-header__title">{title}</h1>
        {description ? <p className="ui-page-header__description">{description}</p> : null}
      </div>
      {actions ? <div className="ui-page-header__actions">{actions}</div> : null}
    </header>
  );
}
