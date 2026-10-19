import { useEffect, useState } from "react";

import { autoSubmitCountdownMessage } from "@/features/patrol/autoSubmitPresentation";
import { evaluateReportAutoSubmits, subscribeToAutoSubmitPasses, type AutoSubmitPass } from "@/services/reportAutoSubmitService";
import { logMobileError } from "@/services/mobileErrorReporter";
import { StatusMessage } from "@/ui/StatusMessage";

type Countdown = { remainingMs: number; observedAt: number };

/** Remaining auto-submit time for one patrol, ticking locally between passes. */
export function useAutoSubmitCountdown(assignmentId: string) {
  const [countdown, setCountdown] = useState<Countdown | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    const apply = (pass: AutoSubmitPass) => {
      if (!active) return;
      const timer = pass.armed.find((item) => item.assignmentId === assignmentId);
      setCountdown(timer ? { remainingMs: timer.remainingMs, observedAt: Date.now() } : null);
      setNow(Date.now());
    };
    const unsubscribe = subscribeToAutoSubmitPasses(apply);
    void evaluateReportAutoSubmits().then(apply).catch((error) => logMobileError("report.autosubmit.countdown.failed", error));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [assignmentId]);

  useEffect(() => {
    if (!countdown) return undefined;
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [countdown]);

  // Display only: the decision itself is made from elapsed time by the service.
  return countdown ? Math.max(0, countdown.remainingMs - Math.max(0, now - countdown.observedAt)) : null;
}

export function AutoSubmitCountdown({ assignmentId }: { assignmentId: string }) {
  const remainingMs = useAutoSubmitCountdown(assignmentId);
  if (remainingMs === null) return null;
  return <StatusMessage message={autoSubmitCountdownMessage(remainingMs)} />;
}
