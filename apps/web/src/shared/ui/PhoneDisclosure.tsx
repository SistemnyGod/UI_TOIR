import { useId, useState, type ReactNode } from "react";
import { usePhoneLayout } from "../../hooks/usePhoneLayout";

/** Keeps a single mounted copy of controls, including their unsaved values. */
export function PhoneDisclosure({ title, children }: { title: string; children: ReactNode }) {
  const phone = usePhoneLayout("(max-width: 767px)");
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return <div className="phone-disclosure">
    {phone ? <button className="phone-disclosure-toggle" type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}>{title} <span aria-hidden="true">{expanded ? "−" : "+"}</span></button> : null}
    <div id={id} hidden={phone && !expanded}>{children}</div>
  </div>;
}
