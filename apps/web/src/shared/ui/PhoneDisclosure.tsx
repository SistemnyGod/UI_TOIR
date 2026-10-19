import { useId, useState, type ReactNode } from "react";
import { usePhoneLayout } from "../../hooks/usePhoneLayout";

/** Keeps a single mounted copy of controls, including their unsaved values. */
export function PhoneDisclosure({ title, children, collapsibleOnDesktop = false, expanded: controlledExpanded, onExpandedChange }: { title: string; children: ReactNode; collapsibleOnDesktop?: boolean; expanded?: boolean; onExpandedChange?: (expanded: boolean) => void }) {
  const phone = usePhoneLayout("(max-width: 767px)");
  const [localExpanded, setExpanded] = useState(false);
  const expanded = controlledExpanded ?? localExpanded;
  const id = useId();
  return <div className="phone-disclosure">
    {phone || collapsibleOnDesktop ? <button className="phone-disclosure-toggle" type="button" aria-expanded={expanded} aria-controls={id} onClick={() => { if (controlledExpanded === undefined) setExpanded(!expanded); onExpandedChange?.(!expanded); }}>{title} <span aria-hidden="true">{expanded ? "−" : "+"}</span></button> : null}
    <div id={id} hidden={(phone || collapsibleOnDesktop) && !expanded}>{children}</div>
  </div>;
}
