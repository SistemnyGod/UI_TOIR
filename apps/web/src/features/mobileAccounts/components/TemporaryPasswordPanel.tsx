import { X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Button } from "../../../shared/ui";
import "./temporaryPasswordPanel.css";

interface TemporaryPasswordPanelProps {
  accountLogin: string;
  password: string;
  title: string;
  onDismiss: () => void;
  onNotify: (message: string) => void;
}

export function TemporaryPasswordPanel({ accountLogin, password, title, onDismiss, onNotify }: TemporaryPasswordPanelProps) {
  const id = useId(), panelRef = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null), mounted = useRef(false);
  const owner = useRef({ password, accountLogin });
  if (owner.current.password !== password || owner.current.accountLogin !== accountLogin) owner.current = { password, accountLogin };
  const operation = useRef<object | null>(null);
  const [copying, setCopying] = useState<object | null>(null);
  const [notice, setNotice] = useState<{ owner: object; message: string } | null>(null);
  const pending = copying === owner.current;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement;
      returnFocus.current = active instanceof HTMLElement && !panelRef.current?.contains(active) ? active : null;
      panelRef.current?.querySelector<HTMLElement>('[data-password-copy]')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useLayoutEffect(() => {
    const panel = panelRef.current, active = document.activeElement;
    if (pending && panel && (!panel.contains(active) || active instanceof HTMLElement && active.matches(':disabled'))) {
      panel.querySelector<HTMLElement>('code')?.focus({ preventScroll: true });
    }
  }, [pending]);

  function dismiss() {
    onDismiss();
    const previous = returnFocus.current;
    if (previous?.isConnected && previous !== document.body && !previous.closest('[inert]')) previous.focus({ preventScroll: true });
    else document.querySelector<HTMLElement>('[aria-label="Профиль пользователя"]')?.focus({ preventScroll: true });
  }

  async function copyPassword() {
    const token = owner.current;
    if (operation.current === token) return;
    operation.current = token; setCopying(token);
    let message: string;
    try { await navigator.clipboard.writeText(password); message = "Временный пароль скопирован"; }
    catch { message = "Не удалось скопировать. Выделите пароль и скопируйте его вручную."; }
    if (!mounted.current || owner.current !== token) return;
    operation.current = null; setCopying(null); setNotice({ owner: token, message }); onNotify(message);
  }

  return <aside aria-labelledby={`${id}-title`} aria-describedby={`${id}-help`} className="secure-password-panel" ref={panelRef} role="region" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); } }}>
    <header className="secure-password-head">
      <div><h2 id={`${id}-title`}>{title}</h2><span>{accountLogin}</span></div>
      <button aria-label="Закрыть временный пароль" className="secure-password-close" onClick={dismiss} type="button"><X aria-hidden="true" size={18} /></button>
    </header>
    <div className="secure-password-content">
      <div className="secure-password-body"><span>Временный пароль</span><code aria-label="Временный пароль, доступно ручное копирование" tabIndex={0}>{password}</code></div>
      <p id={`${id}-help`}>Покажите пароль сотруднику один раз. После закрытия панель не сохраняет пароль в истории уведомлений.</p>
      {notice?.owner === owner.current ? <p className="secure-password-notice" role="status">{notice.message}</p> : null}
    </div>
    <footer className="secure-password-actions">
      <Button isLoading={pending} onClick={copyPassword} data-password-copy>Скопировать</Button>
      <Button onClick={dismiss} variant="primary">Скрыть</Button>
    </footer>
  </aside>;
}
