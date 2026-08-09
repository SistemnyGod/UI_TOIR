import type { ReactNode } from "react";

export function FilterBar({
  ariaLabel,
  children,
  className = "",
}: {
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div aria-label={ariaLabel} className={`ui-filter-bar ${className}`.trim()} role={ariaLabel ? "search" : undefined}>
      {children}
    </div>
  );
}
