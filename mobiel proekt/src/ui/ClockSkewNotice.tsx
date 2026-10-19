import { useEffect, useState, useSyncExternalStore } from "react";
import { View } from "react-native";

import {
  describeClockSkew,
  getClockOffsetSnapshot,
  getClockOffsetVersion,
  isClockSkewSignificant,
  restoreClockOffset,
  subscribeToClockOffset
} from "@/core/clockOffset";
import { StatusMessage } from "@/ui/StatusMessage";

/** Re-checked this often, so fixing the phone clock clears the warning without a request. */
const RECHECK_INTERVAL_MS = 30_000;

export function clockSkewWarningText(offsetMs: number) {
  return `${describeClockSkew(offsetMs)} Время в отчётах обхода будет записано неверно. `
    + "Включите в настройках телефона автоматическую дату и время.";
}

export function ClockSkewNotice() {
  useSyncExternalStore(subscribeToClockOffset, getClockOffsetVersion, getClockOffsetVersion);
  const [, setTick] = useState(0);

  useEffect(() => {
    void restoreClockOffset();
    const timer = setInterval(() => setTick((tick) => tick + 1), RECHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const offset = getClockOffsetSnapshot();
  if (!offset || !isClockSkewSignificant(offset.offsetMs)) return null;
  return <View style={{ marginBottom: 12 }}><StatusMessage tone="warning" message={clockSkewWarningText(offset.offsetMs)} /></View>;
}
