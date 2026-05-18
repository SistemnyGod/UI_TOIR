import { useCallback, useEffect, useState } from "react";
import { screenRegistry } from "../repositories/navigationRepository";
import type { ScreenId } from "../types";

function readScreenFromHash(): ScreenId {
  if (typeof window === "undefined") return "dashboard";

  const hash = window.location.hash.replace("#", "");
  return screenRegistry.some((item) => item.id === hash) ? (hash as ScreenId) : "dashboard";
}

export function useHashScreen() {
  const [screen, setScreenState] = useState<ScreenId>(() => readScreenFromHash());

  useEffect(() => {
    function syncFromHash() {
      setScreenState(readScreenFromHash());
    }

    window.addEventListener("hashchange", syncFromHash);
    window.addEventListener("popstate", syncFromHash);
    return () => {
      window.removeEventListener("hashchange", syncFromHash);
      window.removeEventListener("popstate", syncFromHash);
    };
  }, []);

  const navigate = useCallback((nextScreen: ScreenId) => {
    setScreenState(nextScreen);

    if (window.location.hash !== `#${nextScreen}`) {
      window.history.pushState(null, "", `#${nextScreen}`);
    }
  }, []);

  return [screen, navigate] as const;
}
