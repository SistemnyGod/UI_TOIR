import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { availableFocusTarget, focusableElements } from "./focusTargets";

type ModalLayer = { backdrop: HTMLElement; dialog: HTMLElement; close: () => void; returnFocus: HTMLElement | null };
const layers: ModalLayer[] = [];
const initialInert = new Map<HTMLElement, { inert: boolean; ariaHidden: string | null }>();
let initialBodyOverflow = "";

// A single owner also handles a parent closing before its nested dialog.
function updateBackground() {
  for (const [element, state] of initialInert) {
    element.inert = state.inert;
    if (state.ariaHidden === null) element.removeAttribute("aria-hidden");
    else element.setAttribute("aria-hidden", state.ariaHidden);
  }
  const top = layers.at(-1);
  if (!top) {
    initialInert.clear();
    document.body.style.overflow = initialBodyOverflow;
    return;
  }
  document.body.style.overflow = "hidden";
  let current: HTMLElement = top.backdrop;
  while (current.parentElement) {
    for (const sibling of Array.from(current.parentElement.children)) {
      if (!(sibling instanceof HTMLElement) || sibling === current) continue;
      if (!initialInert.has(sibling)) initialInert.set(sibling, { inert: sibling.inert, ariaHidden: sibling.getAttribute("aria-hidden") });
      sibling.inert = true;
      sibling.setAttribute("aria-hidden", "true");
    }
    if (current.parentElement === document.body) break;
    current = current.parentElement;
  }
}

export function useModalFocus<TDialog extends HTMLElement>(onClose: () => void, restoreFocusRef?: RefObject<HTMLElement | null>, initialFocusSelector?: string) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<TDialog>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // React autoFocus runs during commit, before effects. Capture the opener now,
  // otherwise a field inside the newly mounted window becomes its return target.
  const entryFocus = useRef(typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const backdrop = backdropRef.current;
    if (!dialog || !backdrop) return;
    const previousFocus = restoreFocusRef?.current
      ?? entryFocus.current;
    if (layers.length === 0) initialBodyOverflow = document.body.style.overflow;
    const layer: ModalLayer = { backdrop, dialog, close: () => onCloseRef.current(), returnFocus: previousFocus };
    layers.push(layer);
    updateBackground();
    const previousMaxHeight = dialog.style.maxHeight;
    let visibilityFrame = 0;
    function updateViewport() {
      const viewport = window.visualViewport;
      const height = viewport?.height ?? window.innerHeight;
      backdrop!.style.setProperty("--modal-viewport-height", `${height}px`);
      backdrop!.style.height = `${height}px`;
      backdrop!.style.top = `${viewport?.offsetTop ?? 0}px`;
      backdrop!.style.bottom = "auto";
      dialog!.style.maxHeight = height < window.innerHeight - 1 ? `${Math.max(120, height - 16)}px` : previousMaxHeight;
      cancelAnimationFrame(visibilityFrame);
      visibilityFrame = requestAnimationFrame(() => {
        if (layers.at(-1) !== layer) return;
        const active = document.activeElement;
        if (!(active instanceof HTMLElement) || !dialog!.contains(active) || !active.matches("input, textarea, select, [contenteditable=true]")) return;
        const body = active.closest<HTMLElement>(".modal-shell-body, .aui-create-body, .account-panel-form");
        if (!body) return;
        const bounds = body.getBoundingClientRect(), field = active.getBoundingClientRect();
        if (field.top < bounds.top || field.bottom > bounds.bottom) active.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
      });
    }
    updateViewport();
    window.visualViewport?.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("resize", updateViewport);

    function focusDialog() {
      const close = closeButtonRef.current;
      const preferred = initialFocusSelector ? dialog?.querySelector<HTMLElement>(initialFocusSelector) : null;
      ((preferred && availableFocusTarget(preferred) ? preferred : null) ?? (close && !close.disabled ? close : focusableElements(dialog!)[0] ?? dialog))?.focus();
    }
    focusDialog();
    // Disabling a focused submit button can move focus to body without focusin.
    // Keep keyboard ownership while pending, including the response/error transition.
    const controls = new MutationObserver(() => {
      if (layers.at(-1) !== layer) return;
      const active = document.activeElement;
      if (!dialog!.contains(active) || active instanceof HTMLElement && active.matches(":disabled") || active === dialog && focusableElements(dialog!).length > 0) focusDialog();
    });
    controls.observe(dialog, { subtree: true, attributes: true, attributeFilter: ["disabled"] });

    function handleFocus(event: FocusEvent) {
      if (layers.at(-1) === layer && !dialog!.contains(event.target as Node)) focusDialog();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (layers.at(-1) !== layer) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        layer.close();
      } else if (event.key === "Tab") {
        const elements = focusableElements(dialog!);
        const index = elements.indexOf(document.activeElement as HTMLElement);
        const next = event.shiftKey
          ? (index <= 0 ? elements.length - 1 : index - 1)
          : (index < 0 || index === elements.length - 1 ? 0 : index + 1);
        event.preventDefault();
        (elements[next] ?? dialog)?.focus();
      }
    }
    document.addEventListener("focusin", handleFocus);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      const wasTop = layers.at(-1) === layer;
      document.removeEventListener("focusin", handleFocus);
      controls.disconnect();
      window.removeEventListener("keydown", handleKeyDown);
      window.visualViewport?.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
      cancelAnimationFrame(visibilityFrame);
      const index = layers.indexOf(layer);
      if (index >= 0) layers.splice(index, 1);
      for (const remaining of layers) {
        if (remaining.returnFocus && dialog.contains(remaining.returnFocus)) remaining.returnFocus = layer.returnFocus;
      }
      updateBackground();
      if (wasTop) {
        const next = layers.at(-1);
        const returnFocus = layer.returnFocus;
        if (returnFocus?.isConnected && availableFocusTarget(returnFocus) && (!next || next.dialog.contains(returnFocus))) returnFocus.focus({ preventScroll: true });
        if (next && !next.dialog.contains(document.activeElement)) (focusableElements(next.dialog)[0] ?? next.dialog).focus();
      }
    };
  }, []);

  return { backdropRef, closeButtonRef, dialogRef };
}
