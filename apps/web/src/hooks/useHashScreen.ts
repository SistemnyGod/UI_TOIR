import { useCallback, useEffect, useState } from "react";
import { HashNavigation, screenFromHash } from "./hashNavigation";
import type { ScreenId } from "../types";

function readScreenFromHash(): ScreenId {
  if (typeof window === "undefined") return "dashboard";

  return screenFromHash(window.location.hash);
}

export function useHashScreen() {
  const [screen, setScreenState] = useState<ScreenId>(() => readScreenFromHash());
  const [navigation] = useState(() => typeof window === "undefined" ? null : new HashNavigation(window, setScreenState));
  useEffect(() => navigation?.start(), [navigation]);
  const navigate = useCallback((nextScreen: ScreenId) => {
    if (navigation) navigation.navigate(nextScreen);
    else setScreenState(nextScreen);
  }, [navigation]);
  return [screen, navigate, navigation] as const;
}
