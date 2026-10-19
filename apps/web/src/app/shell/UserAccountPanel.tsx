import { useEffect, useRef, useState, type RefObject } from "react";
import { KeyRound, LogOut, ShieldCheck, UserRound } from "lucide-react";
import type { ChangePasswordDto, SessionUserDto } from "../../api/contracts";
import { Button, ModalShell, useDialogCloseGuard } from "../../shared/ui";
import "./userAccountPanel.css";

const roleNames: Record<string, string> = { admin: "Администратор", operator: "Оператор", dispatcher: "Диспетчер", viewer: "Наблюдатель" };
const rolesLabel = (user: SessionUserDto | null) => user?.roles.map(role => roleNames[role] ?? role).join(", ") || "Пользователь";

export function UserAccountPanel({ user, mockMode, onLogout, onChangePassword, passwordError, onOpenSettings }: {
  user: SessionUserDto | null;
  mockMode: boolean;
  onLogout: () => void;
  onChangePassword?: (payload: ChangePasswordDto) => Promise<boolean>;
  passwordError?: string;
  onOpenSettings?: () => void;
}) {
  const [view, setView] = useState<"profile" | "password" | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const name = user?.displayName || user?.login || "Пользователь панели";
  return <>
    <button className="user-account-trigger" aria-label="Профиль пользователя" aria-haspopup="dialog" onClick={() => setView("profile")} ref={trigger} type="button">
      <span className="user-account-trigger-icon" aria-hidden="true"><UserRound size={19} /></span>
      <span className="user-copy"><strong>{name}</strong><small>{rolesLabel(user)}</small></span>
    </button>
    {view === "profile" ? <ModalShell title="Профиль пользователя" className="user-account-dialog" restoreFocusRef={trigger} onClose={() => setView(null)} actions={<>
      <Button onClick={() => { setView(null); onLogout(); }} variant="ghost"><LogOut size={16} />Выйти из аккаунта</Button>
      <Button onClick={() => setView(null)} variant="primary">Закрыть</Button>
    </>}>
      <div className="user-account-identity"><span className="user-account-avatar"><UserRound size={28} /></span><div><h3>{name}</h3><p>{rolesLabel(user)}</p></div></div>
      <p className="user-account-session"><ShieldCheck size={17} />{mockMode ? "Демонстрационный режим · тестовые данные" : "Вход в аккаунт выполнен"}</p>
      <dl className="user-account-fields"><div><dt>Логин</dt><dd>{user?.login || "—"}</dd></div><div><dt>Роль</dt><dd>{rolesLabel(user)}</dd></div></dl>
      <div className="user-account-options">
        <Button disabled={mockMode || !onChangePassword} onClick={() => setView("password")} variant="secondary"><KeyRound size={17} />Изменить пароль</Button>
        {onOpenSettings ? <Button onClick={() => { setView(null); onOpenSettings(); }} variant="secondary">Управление пользователями</Button> : null}
      </div>
      <p className="user-account-hint">{mockMode ? "Смена пароля доступна после входа через сервер." : onOpenSettings ? "Имя и права доступа можно изменить в разделе управления пользователями." : "Изменение имени и прав доступа выполняет администратор."}</p>
    </ModalShell> : null}
    {view === "password" && onChangePassword ? <PasswordDialog onClose={() => setView(null)} onSave={onChangePassword} serverError={passwordError} restoreFocusRef={trigger} /> : null}
  </>;
}

function PasswordDialog({ onClose, onSave, serverError, restoreFocusRef }: {
  onClose: () => void; onSave: (payload: ChangePasswordDto) => Promise<boolean>; serverError?: string; restoreFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  const [payload, setPayload] = useState<ChangePasswordDto>({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  // The parent is keyed to the session. A disposed editor cannot publish a late result.
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const { requestClose, discardDialog } = useDialogCloseGuard({ dirty: Object.values(payload).some(Boolean), pending, onClose });
  const formId = "user-password-change";
  return <><ModalShell title="Изменение пароля" subtitle="Укажите текущий пароль и новый пароль длиной от 8 символов." className="user-account-dialog" pending={pending} restoreFocusRef={restoreFocusRef} onClose={requestClose} actions={<>
    <Button disabled={pending} onClick={requestClose} variant="ghost">Отмена</Button><Button form={formId} isLoading={pending} type="submit" variant="primary">Сохранить пароль</Button>
  </>}>
    <form id={formId} className="user-account-password" onSubmit={async event => {
      event.preventDefault();
      if (inFlight.current) return;
      if (!payload.currentPassword || payload.newPassword.length < 8 || payload.newPassword !== payload.confirmPassword) { setError("Введите текущий пароль. Новый пароль должен содержать от 8 символов, а подтверждение — совпадать."); return; }
      inFlight.current = true; setPending(true); setError("");
      try {
        const saved = await onSave(payload);
        if (!mounted.current) return;
        if (saved) { setPayload({ currentPassword: "", newPassword: "", confirmPassword: "" }); onClose(); }
        else setError("Не удалось изменить пароль. Проверьте введённые данные и повторите попытку.");
      } catch { if (mounted.current) setError("Не удалось связаться с сервером. Повторите попытку."); }
      finally { inFlight.current = false; if (mounted.current) setPending(false); }
    }}>
      <fieldset disabled={pending}>
        <label>Текущий пароль<input autoComplete="current-password" required type="password" value={payload.currentPassword} onChange={event => setPayload(value => ({ ...value, currentPassword: event.target.value }))} /></label>
        <label>Новый пароль<input autoComplete="new-password" minLength={8} required type="password" value={payload.newPassword} onChange={event => setPayload(value => ({ ...value, newPassword: event.target.value }))} /></label>
        <label>Подтверждение нового пароля<input autoComplete="new-password" minLength={8} required type="password" value={payload.confirmPassword} onChange={event => setPayload(value => ({ ...value, confirmPassword: event.target.value }))} /></label>
      </fieldset>
      {error ? <p className="user-account-error" role="alert">{serverError || error}</p> : null}
    </form>
  </ModalShell>{discardDialog}</>;
}
