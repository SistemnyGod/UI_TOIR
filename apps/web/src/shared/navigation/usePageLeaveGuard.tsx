import { useContext, useEffect, useRef, useState } from "react";
import { Button, ModalShell } from "../ui";
import { NavigationGuardContext } from "./NavigationGuardContext";

/** The app navigator handles all route sources; standalone workspaces retain the same policy. */
export function usePageLeaveGuard({ dirty, pending, message = "Изменения ещё не сохранены. При выходе из текущей формы они будут потеряны.", leaveLabel = "Закрыть без сохранения" }: { dirty: boolean; pending: boolean; message?: string; leaveLabel?: string }) {
  const host = useContext(NavigationGuardContext), state = useRef({ dirty, pending });
  state.current = { dirty, pending };
  const decision = useRef<{ promise: Promise<boolean>; resolve: (approved: boolean) => void } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const owner = useRef(0);
  function ask() {
    if (state.current.pending) return false;
    if (!state.current.dirty) return true;
    if (!decision.current) {
      let resolve!: (approved: boolean) => void;
      const promise = new Promise<boolean>(done => { resolve = done; });
      decision.current = { promise, resolve }; setConfirming(true);
    }
    return decision.current.promise;
  }
  function finish(approved: boolean) {
    if (approved && state.current.pending) return;
    const active = decision.current; decision.current = null; setConfirming(false); active?.resolve(approved);
  }
  useEffect(() => {
    owner.current++;
    const remove = host?.registerGuard({ blocks: () => state.current.dirty || state.current.pending, confirm: ask });
    const unload = (event: BeforeUnloadEvent) => {
      if (!state.current.dirty && !state.current.pending) return;
      event.preventDefault(); event.returnValue = "";
    };
    window.addEventListener("beforeunload", unload);
    return () => { owner.current++; remove?.(); window.removeEventListener("beforeunload", unload); const active = decision.current; decision.current = null; active?.resolve(false); };
  }, [host]);
  function requestLeave(navigate: () => void) {
    if (host) { host.requestLeave(navigate); return; }
    const session = owner.current;
    const answer = ask();
    if (answer === true) navigate();
    else if (answer !== false) void answer.then(approved => { if (approved && session === owner.current && !state.current.pending) navigate(); });
  }
  const leaveDialog = confirming ? <ModalShell title="Несохранённые изменения" className="confirm-window" onClose={() => finish(false)}
    actions={<><Button variant="ghost" onClick={() => finish(false)}>Продолжить редактирование</Button><Button variant="danger" disabled={pending} onClick={() => finish(true)}>{leaveLabel}</Button></>}>
    <p>{message}</p>
    {pending ? <p role="status">Завершаем сохранение. Дождитесь ответа сервера.</p> : null}
  </ModalShell> : null;
  return { requestLeave, leaveDialog };
}
