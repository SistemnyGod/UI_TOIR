import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";

type SkeletonProps = {
  rows?: number;
  columns?: number;
  cards?: number;
  fields?: number;
};

const screenScrollMemory = new Map<string, number>();

export function PageTransition({
  children,
  screenKey,
}: {
  children: ReactNode;
  screenKey: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const savedScroll = screenScrollMemory.get(screenKey);
    if (typeof savedScroll === "number") {
      window.requestAnimationFrame(() => window.scrollTo({ top: savedScroll, left: 0, behavior: "auto" }));
    }
  }, [screenKey]);

  useEffect(() => {
    return () => {
      screenScrollMemory.set(screenKey, window.scrollY);
    };
  }, [screenKey]);

  return (
    <div ref={rootRef} className="page-transition" data-screen={screenKey}>
      {children}
    </div>
  );
}

export function RouteLoadingBar({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden={!active}
      aria-label="Loading section"
      className={active ? "route-loading-line is-active" : "route-loading-line"}
      role="progressbar"
    >
      <span />
    </div>
  );
}

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`skeleton-block ${className}`.trim()} />;
}

export function SkeletonCards({ cards = 4 }: SkeletonProps) {
  return (
    <div className="skeleton-cards" aria-hidden="true">
      {Array.from({ length: cards }).map((_, index) => (
        <div className="skeleton-card" key={index}>
          <SkeletonBlock className="is-icon" />
          <div>
            <SkeletonBlock className="is-title" />
            <SkeletonBlock className="is-line" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonList({ rows = 6 }: SkeletonProps) {
  return (
    <div className="skeleton-list" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div className="skeleton-list-row" key={index}>
          <SkeletonBlock className="is-icon" />
          <div>
            <SkeletonBlock className="is-title" />
            <SkeletonBlock className="is-line" />
          </div>
          <SkeletonBlock className="is-action" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 6, columns = 5 }: SkeletonProps) {
  const tableStyle = { "--skeleton-columns": columns } as CSSProperties;

  return (
    <div className="skeleton-table" aria-hidden="true" style={tableStyle}>
      <div className="skeleton-table-row is-head">
        {Array.from({ length: columns }).map((_, index) => (
          <SkeletonBlock key={index} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div className="skeleton-table-row" key={rowIndex}>
          {Array.from({ length: columns }).map((_, columnIndex) => (
            <SkeletonBlock key={columnIndex} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonForm({ fields = 6 }: SkeletonProps) {
  return (
    <div className="skeleton-form" aria-hidden="true">
      {Array.from({ length: fields }).map((_, index) => (
        <label className="skeleton-field" key={index}>
          <SkeletonBlock className="is-label" />
          <SkeletonBlock className="is-input" />
        </label>
      ))}
    </div>
  );
}

export function SkeletonPreview() {
  return (
    <div className="skeleton-preview" aria-hidden="true">
      <SkeletonBlock className="is-preview-title" />
      <SkeletonBlock className="is-preview-line" />
      <SkeletonBlock className="is-preview-line short" />
      <div className="skeleton-preview-grid">
        <SkeletonBlock />
        <SkeletonBlock />
        <SkeletonBlock />
        <SkeletonBlock />
      </div>
      <SkeletonTable rows={4} columns={4} />
    </div>
  );
}
