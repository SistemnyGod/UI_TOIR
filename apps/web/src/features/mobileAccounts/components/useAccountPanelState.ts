import { useEffect, useRef } from "react";

/** A panel owns its draft and request until it is unmounted or its target changes. */
export function useAccountPanelState(target: string | undefined, dirty: boolean, onDirtyChange?: (dirty: boolean) => void) {
  const alive = useRef(true);
  const inFlight = useRef(false);
  const currentTarget = useRef({ target });
  if (currentTarget.current.target !== target) {
    currentTarget.current = { target };
    inFlight.current = false;
  }
  const owner = currentTarget.current;
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  return { inFlight, isCurrent: () => alive.current && currentTarget.current === owner };
}
