import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";

type Position = { x: number; y: number };
type Drag = Position & { left: number; top: number };
const limitZoom = (value: number) => Math.max(1, Math.min(4, value));

/** Each mounted file owns its scale and gestures; zoom keeps the chosen image position in view. */
export function usePhotoViewport(active: boolean, fileKey: string, onPrevious?: () => void, onNext?: () => void) {
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const stageRef = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef<{ left: number; top: number } | null>(null);
  const pointers = useRef(new Map<number, Position>());
  const drag = useRef<Drag | null>(null);
  const swipe = useRef<Position | null>(null);
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const navigation = useRef({ onPrevious, onNext });
  navigation.current = { onPrevious, onNext };

  useLayoutEffect(() => {
    zoomRef.current = 1; setZoom(1); pendingScroll.current = null;
    pointers.current.clear(); drag.current = null; swipe.current = null; pinch.current = null;
    if (stageRef.current) { stageRef.current.scrollLeft = 0; stageRef.current.scrollTop = 0; }
  }, [fileKey]);

  const changeZoom = useCallback((value: number, anchor?: Position) => {
    const stage = stageRef.current;
    const next = limitZoom(value);
    if (!stage || next === zoomRef.current) return;
    const position = anchor ?? { x: stage.clientWidth / 2, y: stage.clientHeight / 2 };
    const current = pendingScroll.current ?? { left: stage.scrollLeft, top: stage.scrollTop };
    const ratio = next / zoomRef.current;
    pendingScroll.current = { left: (current.left + position.x) * ratio - position.x, top: (current.top + position.y) * ratio - position.y };
    zoomRef.current = next;
    setZoom(next);
  }, []);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (stage && pendingScroll.current) {
      stage.scrollLeft = pendingScroll.current.left;
      stage.scrollTop = pendingScroll.current.top;
      pendingScroll.current = null;
    }
  }, [zoom]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !active) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = stage.getBoundingClientRect();
      changeZoom(zoomRef.current * Math.exp(-event.deltaY * .002), { x: event.clientX - rect.left, y: event.clientY - rect.top });
    };
    stage.addEventListener("wheel", wheel, { passive: false });
    return () => stage.removeEventListener("wheel", wheel);
  }, [active, changeZoom]);

  function fit() {
    zoomRef.current = 1; pendingScroll.current = null; setZoom(1);
    if (stageRef.current) { stageRef.current.scrollLeft = 0; stageRef.current.scrollTop = 0; }
  }
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!active || event.button !== 0) return;
    const position = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, position);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (pointers.current.size === 1) {
      drag.current = { ...position, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop };
      swipe.current = event.pointerType === "touch" && zoomRef.current === 1 ? position : null;
      if (zoomRef.current > 1) event.preventDefault();
    } else {
      const [first, second] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(second.x - first.x, second.y - first.y), zoom: zoomRef.current };
      drag.current = null; swipe.current = null;
    }
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size > 1 && pinch.current?.distance) {
      const [first, second] = [...pointers.current.values()];
      const rect = event.currentTarget.getBoundingClientRect();
      changeZoom(pinch.current.zoom * Math.hypot(second.x - first.x, second.y - first.y) / pinch.current.distance,
        { x: (first.x + second.x) / 2 - rect.left, y: (first.y + second.y) / 2 - rect.top });
    } else if (zoomRef.current > 1 && drag.current) {
      event.currentTarget.scrollLeft = drag.current.left - (event.clientX - drag.current.x);
      event.currentTarget.scrollTop = drag.current.top - (event.clientY - drag.current.y);
    }
  }
  function pointerEnd(event: PointerEvent<HTMLDivElement>) {
    const start = swipe.current;
    pointers.current.delete(event.pointerId);
    pinch.current = null; swipe.current = null; drag.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const remaining = [...pointers.current.values()][0];
    if (remaining) drag.current = { ...remaining, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop };
    if (event.type === "pointerup" && start && zoomRef.current === 1) {
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) navigation.current.onNext?.(); else navigation.current.onPrevious?.();
      }
    }
  }
  return { zoom, stageRef, changeZoom, fit, pointerDown, pointerMove, pointerEnd };
}
