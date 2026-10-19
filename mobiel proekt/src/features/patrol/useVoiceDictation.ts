import { useCallback, useEffect, useRef, useState } from "react";
import { hasUsableNetwork } from "@/core/network";
import {
  abortSpeechRecognition,
  isSpeechRecognitionAvailable,
  listOfflineSpeechLocales,
  requestSpeechMicrophonePermission,
  startSpeechRecognition,
  stopSpeechRecognition,
} from "@/services/speechRecognitionService";
import { dictationErrorHint, dictationHints, dictationLocale, hasRussianLocale } from "./pointVoiceDictation";

export type DictationPhase = "idle" | "preparing" | "listening";

/**
 * Russian dictation for one text field. Final phrases go to `onText`; partial
 * words are only shown. An installed offline pack is preferred so dictation
 * works on site without internet; without one, the network recognizer is used
 * only while the phone is online.
 */
export function useVoiceDictation(onText: (text: string) => void) {
  const [phase, setPhase] = useState<DictationPhase>("idle");
  const [hint, setHint] = useState<string | null>(null);
  const [partial, setPartial] = useState("");
  const onTextRef = useRef(onText);
  const session = useRef(0);
  const unsubscribe = useRef<(() => void) | null>(null);
  const failed = useRef(false);

  useEffect(() => { onTextRef.current = onText; }, [onText]);

  const finish = useCallback(() => {
    unsubscribe.current?.();
    unsubscribe.current = null;
    setPhase("idle");
    setPartial("");
  }, []);

  const cancel = useCallback(() => {
    const active = unsubscribe.current !== null;
    session.current++;
    finish();
    if (active) abortSpeechRecognition();
  }, [finish]);

  useEffect(() => cancel, [cancel]);

  const start = useCallback(async () => {
    const current = ++session.current;
    const isCurrent = () => current === session.current;
    setHint(null);
    setPartial("");
    setPhase("preparing");
    const stopWith = (message: string | null) => { if (isCurrent()) { setHint(message); finish(); } };
    try {
      if (!isSpeechRecognitionAvailable()) return stopWith(dictationHints.unavailable);
      const permission = await requestSpeechMicrophonePermission();
      if (!isCurrent()) return;
      if (!permission.granted) return stopWith(permission.canAskAgain ? dictationHints.permissionDenied : dictationHints.permissionBlocked);
      const onDevice = hasRussianLocale(await listOfflineSpeechLocales());
      if (!isCurrent()) return;
      if (!onDevice && !(await hasUsableNetwork().catch(() => false))) return stopWith(dictationHints.offline);
      if (!isCurrent()) return;
      failed.current = false;
      unsubscribe.current = startSpeechRecognition({ locale: dictationLocale, onDevice }, {
        onStart: () => { if (isCurrent()) { setPhase("listening"); setHint(dictationHints.listening); } },
        onResult: (transcript, isFinal) => {
          if (!isCurrent()) return;
          if (isFinal) { setPartial(""); onTextRef.current(transcript); } else setPartial(transcript);
        },
        onError: code => { if (isCurrent()) { failed.current = true; setHint(dictationErrorHint(code)); } },
        onEnd: () => {
          if (!isCurrent()) return;
          if (!failed.current) setHint(null);
          finish();
        },
      });
    } catch {
      stopWith(dictationHints.failed);
    }
  }, [finish]);

  const toggle = useCallback(() => {
    if (phase === "idle") { void start(); return; }
    if (phase === "listening") { stopSpeechRecognition(); return; }
    cancel();
  }, [cancel, phase, start]);

  return { phase, hint, partial, toggle, cancel };
}
