import type { ReactNode } from "react";
import type { PpeWizardLine } from "./ppeTypes";

type PpeIssueLineEditorProps = {
  children: ReactNode;
  hasErrors?: boolean;
  hasWarning?: boolean;
  isSectionTitle?: boolean;
  line: PpeWizardLine;
};

export function PpeIssueLineEditor({
  children,
  hasErrors = false,
  hasWarning = false,
  isSectionTitle = false,
  line,
}: PpeIssueLineEditorProps) {
  const classes = [
    "inventory-ppe-line-card",
    hasWarning ? "has-warning" : "",
    hasErrors ? "has-errors" : "",
    isSectionTitle ? "is-section-title" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={classes} data-item-id={line.item.id}>
      {children}
    </article>
  );
}
