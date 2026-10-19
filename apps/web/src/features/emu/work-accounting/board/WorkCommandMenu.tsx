import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

export interface WorkCommand {
  label: string;
  action: () => void;
  danger?: boolean;
}

export function WorkCommandMenu({ commands, point, triggerRef, onClose }: {
  commands: WorkCommand[];
  point: { x: number; y: number };
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(point);
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    setPosition({ x: Math.max(8, Math.min(point.x, innerWidth - rect.width - 8)), y: Math.max(8, Math.min(point.y, innerHeight - rect.height - 8)) });
    menu.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    return () => { if (menu.contains(document.activeElement)) triggerRef.current?.focus({ preventScroll: true }); };
  }, [point.x, point.y, triggerRef]);
  useEffect(() => {
    // Reacting to a queued scroll from revealing the trigger can close the
    // menu immediately. Close only on an explicit background scroll gesture.
    const closeOnScroll = (event: Event) => { if (!(event.target instanceof Node) || !menuRef.current?.contains(event.target)) onClose(); };
    window.addEventListener("resize", onClose);
    document.addEventListener("wheel", closeOnScroll, { passive: true });
    document.addEventListener("touchmove", closeOnScroll, { passive: true });
    return () => { window.removeEventListener("resize", onClose); document.removeEventListener("wheel", closeOnScroll); document.removeEventListener("touchmove", closeOnScroll); };
  }, [onClose]);
  return createPortal(
    <div className="emu-quick-menu-layer" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="emu-quick-menu emu-work-command-menu" role="menu" aria-label="Команды работы" ref={menuRef} style={{ left: position.x, top: position.y }} onKeyDown={event => {
        if (event.key === "Escape" || event.key === "Tab") { if (event.key === "Escape") event.preventDefault(); onClose(); return; }
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "ArrowDown" ? (index + 1) % items.length : event.key === "ArrowUp" ? (index - 1 + items.length) % items.length : event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : -1;
        if (next >= 0) { event.preventDefault(); items[next]?.focus({ preventScroll: true }); }
      }}>
        <strong>Быстрые команды</strong>
        {commands.map(command => <button key={command.label} role="menuitem" type="button" className={command.danger ? "danger" : ""} onClick={() => { onClose(); command.action(); }}>{command.label}</button>)}
      </div>
    </div>, document.body,
  );
}
