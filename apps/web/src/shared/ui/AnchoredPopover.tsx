import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { focusableElements } from './focusTargets';

/** Outside interaction stays available; Escape returns to the trigger. */
export function AnchoredPopover({ anchorRef, children, className = '', label, id, onClose, initialFocusSelector }: {
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  className?: string;
  label: string;
  id: string;
  onClose: () => void;
  initialFocusSelector?: string;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    const surface = surfaceRef.current, anchor = anchorRef.current;
    if (!surface || !anchor) return;
    let frame = 0;
    const place = () => {
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth, height = viewport?.height ?? window.innerHeight;
      surface.style.maxWidth = `${Math.max(0, width - 16)}px`;
      surface.style.maxHeight = `${Math.max(0, height - 16)}px`;
      const rect = anchor.getBoundingClientRect(), box = surface.getBoundingClientRect();
      const below = rect.bottom + 8;
      const y = below + box.height <= top + height - 8 ? below
        : rect.top - box.height - 8 >= top + 8 ? rect.top - box.height - 8
        : Math.max(top + 8, Math.min(below, top + height - box.height - 8));
      surface.style.left = `${Math.max(left + 8, Math.min(rect.left, left + width - box.width - 8))}px`;
      // The trigger can leave the viewport after resize or background scrolling.
      surface.style.top = `${Math.max(top + 8, Math.min(y, top + height - box.height - 8))}px`;
      surface.style.visibility = 'visible';
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(place); };
    place();
    (initialFocusSelector ? surface.querySelector<HTMLElement>(initialFocusSelector) : null)?.focus({ preventScroll: true });
    if (!surface.contains(document.activeElement)) (focusableElements(surface)[0] ?? surface).focus({ preventScroll: true });
    const dismiss = () => closeRef.current();
    const outsidePointer = (event: PointerEvent) => {
      if (!surface.contains(event.target as Node) && !anchor.contains(event.target as Node)) dismiss();
    };
    const outsideFocus = (event: FocusEvent) => {
      if (!surface.contains(event.target as Node) && !anchor.contains(event.target as Node)) dismiss();
    };
    const keyDown = (event: KeyboardEvent) => {
      if (!surface.contains(event.target as Node) && !anchor.contains(event.target as Node)) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation(); dismiss(); anchor.focus({ preventScroll: true });
      } else if (event.key === 'Tab') {
        const controls = focusableElements(surface), active = document.activeElement;
        if (event.shiftKey && active === controls[0] || !event.shiftKey && active === controls.at(-1)) {
          event.preventDefault();
          const outside = focusableElements(document.body).filter(element => !surface.contains(element));
          const next = event.shiftKey ? anchor : outside[outside.indexOf(anchor) + 1] ?? anchor;
          dismiss(); next.focus({ preventScroll: true });
        }
      }
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    observer?.observe(surface); observer?.observe(anchor);
    document.addEventListener('pointerdown', outsidePointer);
    document.addEventListener('focusin', outsideFocus);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    return () => {
      cancelAnimationFrame(frame); observer?.disconnect();
      document.removeEventListener('pointerdown', outsidePointer);
      document.removeEventListener('focusin', outsideFocus);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
    };
  }, []);
  return createPortal(<div aria-label={label} className={`anchored-popover ${className}`} id={id} ref={surfaceRef} role='dialog' tabIndex={-1}>{children}</div>, document.body);
}
