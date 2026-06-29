import { type FormEvent, useId, useState } from "react";
import { getStoredLastLogin, getStoredRememberMe } from "../../repositories/sessionRepository";

export function LoginScreen({
  errorMessage,
  isSubmitting,
  onLogin,
  onUseMockMode,
}: {
  errorMessage?: string;
  isSubmitting: boolean;
  onLogin: (login: string, password: string, rememberMe: boolean) => Promise<boolean>;
  onUseMockMode: () => void;
}) {
  const loginInputId = useId();
  const passwordInputId = useId();
  const rememberInputId = useId();
  const [login, setLogin] = useState(() => getStoredLastLogin());
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(() => getStoredRememberMe());
  const [showPassword, setShowPassword] = useState(false);
  const [fieldError, setFieldError] = useState<string | undefined>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(undefined);

    if (!login.trim() || !password.trim()) {
      setFieldError("Введите логин и пароль");
      return;
    }

    await onLogin(login, password, rememberMe);
  }

  return (
    <main className="login-shell">
      <div className="login-bg-letter login-bg-letter-left" aria-hidden="true">A</div>
      <div className="login-bg-letter login-bg-letter-right" aria-hidden="true">V</div>

      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-card">
          <div className="login-card-main">
            <div className="login-logo" aria-label="Atom Minerals">
              <div className="login-logo-mark">AM</div>
              <div className="login-logo-text">
                <span>ATOM</span>
                <span>MINERALS</span>
              </div>
            </div>

            <h1 id="login-title">Система управления патрулированием</h1>
            <form className="login-form" onSubmit={submit}>
              <label className="login-input" htmlFor={loginInputId}>
                <span className="visually-hidden">Логин</span>
                <LoginIcon name="user" />
                <input
                  autoComplete="username"
                  autoFocus
                  id={loginInputId}
                  onChange={(event) => setLogin(event.target.value)}
                  placeholder="Логин"
                  value={login}
                />
              </label>

              <label className="login-input" htmlFor={passwordInputId}>
                <span className="visually-hidden">Пароль</span>
                <LoginIcon name="lock" />
                <input
                  autoComplete="current-password"
                  id={passwordInputId}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Пароль"
                  type={showPassword ? "text" : "password"}
                  value={password}
                />
                <button
                  aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                  className="login-eye"
                  onClick={() => setShowPassword((value) => !value)}
                  type="button"
                >
                  <LoginIcon name={showPassword ? "eyeOff" : "eye"} />
                </button>
              </label>

              <label className="login-checkbox" htmlFor={rememberInputId}>
                <input
                  checked={rememberMe}
                  id={rememberInputId}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  type="checkbox"
                />
                <span className="login-checkbox-box" aria-hidden="true" />
                <span>Запомнить меня</span>
              </label>

              {fieldError || errorMessage ? (
                <div className="login-error" role="alert">
                  {fieldError ?? errorMessage}
                </div>
              ) : null}

              <button className="login-submit" disabled={isSubmitting} type="submit">
                {isSubmitting ? "Выполняется вход..." : "Войти"}
              </button>
            </form>

            <nav className="login-links" aria-label="Помощь со входом">
              <button onClick={() => setFieldError("Обратитесь к администратору для сброса пароля")} type="button">
                Забыли пароль?
              </button>
              <span />
              <button onClick={() => setFieldError("Восстановление доступа будет подключено к модулю пользователей сайта")} type="button">
                Восстановление доступа
              </button>
              <span />
              <button onClick={onUseMockMode} type="button">
                Вход другим способом
              </button>
            </nav>
          </div>

        </div>
      </section>
    </main>
  );
}

function LoginIcon({ name }: { name: "eye" | "eyeOff" | "lock" | "shield" | "user" }) {
  return (
    <svg className="login-icon" viewBox="0 0 24 24" aria-hidden="true">
      {name === "user" ? (
        <>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
        </>
      ) : null}
      {name === "lock" ? (
        <>
          <rect x="5.5" y="10" width="13" height="10" rx="2" />
          <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" />
          <path d="M12 14.5v2.5" />
        </>
      ) : null}
      {name === "eye" ? (
        <>
          <path d="M3.5 12s3.1-5 8.5-5 8.5 5 8.5 5-3.1 5-8.5 5-8.5-5-8.5-5Z" />
          <circle cx="12" cy="12" r="2.5" />
        </>
      ) : null}
      {name === "eyeOff" ? (
        <>
          <path d="M3.5 12s3.1-5 8.5-5c1.2 0 2.2.2 3.2.6" />
          <path d="M20.5 12s-3.1 5-8.5 5c-1.2 0-2.2-.2-3.2-.6" />
          <path d="M4 4l16 16" />
        </>
      ) : null}
      {name === "shield" ? (
        <>
          <path d="M12 3.5 5.5 6v5.6c0 3.8 2.5 7.1 6.5 8.9 4-1.8 6.5-5.1 6.5-8.9V6L12 3.5Z" />
          <path d="m9 12.2 2 2 4-4" />
        </>
      ) : null}
    </svg>
  );
}
