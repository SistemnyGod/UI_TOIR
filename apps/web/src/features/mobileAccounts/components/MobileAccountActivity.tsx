import { Clock3, LogIn, RefreshCw, Settings2, ShieldAlert, Smartphone } from "lucide-react";
import { useState } from "react";
import type { DataSourceStatus, MobileAccount, MobileAccountSecurityEvent, MobileAccountSession } from "../../../types";
import { accountBindingLabel, accountDevices, accountEventTitle, accountTime, isSessionOnline, isSessionUnfinished, newestEvents, newestSessions } from "../accountPresentation";

export type AccountActivityProps = {
  selected?: MobileAccount;
  sessions: MobileAccountSession[];
  events: MobileAccountSecurityEvent[];
  status: DataSourceStatus;
  errorMessage?: string;
  onRefresh: () => void | Promise<void>;
};

export function AccountConnection({ value }: { value: string }) {
  const online = isSessionOnline(value);
  return <span className={`aui-connection ${online ? "online" : "offline"}`}><span aria-hidden="true" />{online ? "Онлайн" : /офлайн|offline/i.test(value) ? "Офлайн" : "Нет данных о связи"}</span>;
}

export function AccountRefresh({ onRefresh, status }: Pick<AccountActivityProps, "onRefresh" | "status">) {
  const [refreshing, setRefreshing] = useState(false);
  async function refresh() {
    if (refreshing || status === "loading") return;
    setRefreshing(true);
    try { await onRefresh(); } catch { /* The workspace displays the source error. */ } finally { setRefreshing(false); }
  }
  return <button aria-label="Обновить активность аккаунта" className="aui-icon-button" disabled={refreshing || status === "loading"} onClick={() => void refresh()} type="button"><RefreshCw aria-hidden="true" size={18} /></button>;
}

export function AccountActivityNotice({ status, errorMessage, onRefresh }: Pick<AccountActivityProps, "status" | "errorMessage" | "onRefresh">) {
  if (status !== "error" && status !== "loading") return null;
  return <div className={`aui-source-notice ${status === "error" ? "error" : ""}`} role="status" aria-live="polite">{status === "error" ? <><span>{errorMessage || "Не удалось загрузить активность аккаунта."}</span><button className="aui-link" onClick={() => void Promise.resolve().then(onRefresh).catch(() => undefined)} type="button">Повторить</button></> : "Обновляем активность…"}</div>;
}

export function MobileAccountEvents({ events, limit, detailed = false }: { events: MobileAccountSecurityEvent[]; limit?: number; detailed?: boolean }) {
  const sorted = newestEvents(events);
  const visible = limit ? sorted.slice(0, limit) : sorted;
  if (!visible.length) return <div className="aui-empty"><strong>Событий пока нет</strong><span>Здесь появятся входы и изменения доступа.</span></div>;
  return <div className="aui-events">{visible.map((event) => {
    const title = accountEventTitle(event);
    const warning = /отклонён|заблокирован/.test(title);
    const Icon = warning ? ShieldAlert : /Вход|Выход/.test(title) ? LogIn : Settings2;
    return <article className={`aui-event ${warning ? "warning" : ""}`} key={event.id}>
      <span className="aui-event-icon"><Icon aria-hidden="true" size={20} /></span>
      <div className="aui-event-copy"><strong>{title}</strong><span>{detailed ? event.message || "Подробности не переданы" : event.actor && event.actor !== "system" ? `Пользователь: ${event.actor}` : "Источник: система"}</span>{detailed ? <small>Пользователь: {event.actor || "система"} · Код: {event.eventType}</small> : null}</div>
      <time>{accountTime(event.createdAt)}</time>
    </article>;
  })}</div>;
}

export function MobileAccountSessions({ sessions }: { sessions: MobileAccountSession[] }) {
  if (!sessions.length) return <div className="aui-empty"><strong>Сессий пока нет</strong><span>Сессии появятся после входа в мобильное приложение.</span></div>;
  return <div className="aui-session-list">{newestSessions(sessions).map((session) => <article className="aui-session-row" key={session.id}>
    <div className="aui-session-device"><Smartphone aria-hidden="true" size={25} /><div><strong>{session.device || "Неизвестное устройство"}</strong><span>{[session.platform, session.appVersion, session.ipAddress].filter(Boolean).join(" · ") || "Параметры устройства не переданы"}</span></div><AccountConnection value={session.status} /></div>
    <dl className="aui-session-facts"><div><dt>Вход</dt><dd>{accountTime(session.startedAt)}</dd></div><div><dt>Последняя активность</dt><dd>{accountTime(session.lastSeenAt)}</dd></div><div><dt>Выход</dt><dd>{session.endedAt ? accountTime(session.endedAt) : isSessionUnfinished(session) ? "Не завершена" : session.status}</dd></div><div><dt>Токен доступа до</dt><dd>{accountTime(session.accessExpiresAt)}</dd></div><div><dt>Refresh-сессия до</dt><dd>{accountTime(session.refreshExpiresAt)}</dd></div></dl>
  </article>)}</div>;
}

export function MobileAccountDeviceList({ selected, sessions }: Pick<AccountActivityProps, "selected" | "sessions">) {
  const devices = accountDevices(sessions);
  if (!devices.length && !selected?.device) return <div className="aui-empty"><strong>Устройства пока нет</strong><span>Сведения появятся после первого входа.</span></div>;
  return <div className="aui-devices"><div className="aui-device-head"><span>Устройство</span><span>Связь</span><span>Последняя активность</span></div>
    {devices.length ? devices.slice(0, 4).map((session) => <div className="aui-device-row" key={session.deviceId || session.id}><Smartphone aria-hidden="true" size={27} /><div><strong>{session.device || "Неизвестное устройство"}</strong><span>Приложение {session.appVersion || "—"}</span></div><AccountConnection value={session.status} /><time>{accountTime(session.lastSeenAt)}</time></div>) : <div className="aui-device-row"><Smartphone aria-hidden="true" size={27} /><div><strong>{selected?.device || "—"}</strong><span>Приложение {selected?.version || "—"}</span></div><AccountConnection value={selected?.session || "-"} /><time>{selected?.lastSeen || "—"}</time></div>}
    {devices.length > 4 ? <span className="aui-muted">Ещё устройств: {devices.length - 4}. Полный список — во вкладке «Сессии».</span> : null}
  </div>;
}

export function MobileAccountActivity({ selected, sessions, events, status, errorMessage, onRefresh, onShowSecurity, onShowSessions }: AccountActivityProps & { onShowSecurity: () => void; onShowSessions: () => void }) {
  if (!selected) return null;
  // Source requests are account-scoped; ignore cached records from a previous selection.
  const ownSessions = sessions.filter((session) => session.accountId === selected.id);
  const ownEvents = events.filter((event) => event.accountId === selected.id);
  return <section className="aui-activity" aria-label={`Активность аккаунта ${selected.login}`}>
    <header className="aui-activity-head"><div><h2>Активность аккаунта {selected.login}</h2><p>{accountBindingLabel(selected)} · {selected.role}</p></div><div className="aui-activity-tools"><button className="aui-session-count" onClick={onShowSessions} type="button"><Clock3 aria-hidden="true" size={19} />Незавершённые сессии <strong>{ownSessions.filter(isSessionUnfinished).length}</strong></button><AccountRefresh status={status} onRefresh={onRefresh} /></div></header>
    <AccountActivityNotice status={status} errorMessage={errorMessage} onRefresh={onRefresh} />
    <div className="aui-activity-columns"><div><h3>Устройства</h3><MobileAccountDeviceList selected={selected} sessions={ownSessions} /></div><div><div className="aui-section-head"><h3>Последние события</h3><button className="aui-link" onClick={onShowSecurity} type="button">Все события</button></div><MobileAccountEvents events={ownEvents} limit={3} /></div></div>
  </section>;
}
