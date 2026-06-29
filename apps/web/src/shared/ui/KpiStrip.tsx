import type { ReactNode } from "react";

export type KpiStripItem = {
  id: string;
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "blue" | "green" | "orange" | "red" | "slate" | "neutral";
};

export function KpiStrip({ items, className = "" }: { items: KpiStripItem[]; className?: string }) {
  return (
    <div className={`kpi-strip ${className}`}>
      {items.map((item) => (
        <article className={`kpi-strip-item ${item.tone ?? "neutral"}`} key={item.id}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          {item.hint ? <small>{item.hint}</small> : null}
        </article>
      ))}
    </div>
  );
}
