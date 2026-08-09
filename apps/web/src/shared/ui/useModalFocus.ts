import { useEffect, useRef } from "react";
import type { RefObject } from "react";

const focusableSelector = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export function useModalFocus<TDialog extends HTMLElement>(onClose: () => void, restoreFocusRef?: RefObject<HTMLElement | null>) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<TDialog>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousFocus = restoreFocusRef?.current
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const previousBodyOverflow = document.body.style.overflow;
    const backdrop = backdropRef.current;
    const backgroundState = new Map<HTMLElement, boolean>();

    document.body.style.overflow = "hidden";

    if (backdrop) {
      const protectedPath = new Set<HTMLElement>();
      let current: HTMLElement | null = backdrop;
      while (current && current !== document.body) {
        protectedPath.add(current);
        current = current.parentElement;
      }

      for (const pathNode of protectedPath) {
        for (const sibling of Array.from(pathNode.parentElement?.children ?? [])) {
          if (!(sibling instanceof HTMLElement) || protectedPath.has(sibling)) continue;
          backgroundState.set(sibling, sibling.inert);
          sibling.inert = true;
        }
      }
    }

    const initialFocus = closeButtonRef.current ?? dialogRef.current?.querySelector<HTMLElement>(focusableSelector);
    initialFocus?.focus();

    return () => {
      for (const [element, wasInert] of backgroundState) {
        element.inert = wasInert;
      }
      document.body.style.overflow = previousBodyOverflow;
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const dialog = dialogRef.current;
      if (!dialog || !dialog.contains(document.activeElement)) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const currentIndex = focusableElements.indexOf(document.activeElement as HTMLElement);
      const nextIndex = event.shiftKey
        ? (currentIndex <= 0 ? focusableElements.length - 1 : currentIndex - 1)
        : (currentIndex === focusableElements.length - 1 ? 0 : currentIndex + 1);

      event.preventDefault();
      focusableElements[nextIndex].focus();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return { backdropRef, closeButtonRef, dialogRef };
}
