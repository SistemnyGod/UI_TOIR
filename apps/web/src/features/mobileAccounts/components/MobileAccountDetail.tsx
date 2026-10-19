import { LockKeyhole, Smartphone, UserRoundPlus } from "lucide-react";
import { useId, useState, type RefObject } from "react";
import { ModalShell } from "../../../shared/ui/ModalShell";
import type { EmployeeDirectoryItem } from "../../../types";
import { accountBindingLabel, accountInitials, accountTime, newestSessions } from "../accountPresentation";
import { AccountAccess } from "./MobileAccountListPanel";
import { AccountActivityNotice, AccountConnection, AccountRefresh, MobileAccountEvents, MobileAccountSessions, type AccountActivityProps } from "./MobileAccountActivity";

type DetailTab = "overview" | "employees" | "sessions" | "security";

export function MobileAccountDetail({ selected, sessions, events, status, errorMessage, onRefresh, employeeDirectory, canManage, onClose, onOpenEdit, onOpenLink, onOpenPassword, restoreFocusRef }: AccountActivityProps & {
  employeeDirectory: EmployeeDirectoryItem[];
  canManage: boolean;
  onClose: () => void;
  onOpenEdit: () => void;
  onOpenLink: () => void;
  onOpenPassword: () => void;
  restoreFocusRef?: RefObject<HTMLElement | null>;
}) {
  const [tab, setTab] = useState<DetailTab>("overview");
  const id = useId();
  if (!selected) return null;
  const ownSessions = sessions.filter((session) => session.accountId === selected.id);
  const ownEvents = events.filter((event) => event.accountId === selected.id);
  const device = newestSessions(ownSessions)[0];
  const tabs: { id: DetailTab; label: string; count?: number }[] = [
    { id: "overview", label: "Обзор" }, { id: "employees", label: "Сотрудники", count: selected.boundEmployees.length },
    { id: "sessions", label: "Сессии" }, { id: "security", label: "Безопасность" },
  ];
  const employees = <section className="aui-detail-employees">
    <div className="aui-section-head"><h3>Привязанные сотрудники</h3><span className="aui-muted">{accountBindingLabel(selected)}</span>{canManage ? <button className="aui-link" onClick={onOpenLink} type="button"><UserRoundPlus aria-hidden="true" size={18} />Привязать сотрудника</button> : null}</div>
    {selected.employeeScope === "all" ? <p className="aui-source-notice">Аккаунту доступны все сотрудники.</p> : null}
    {selected.boundEmployees.length ? <ul className="aui-employee-list">{selected.boundEmployees.map((name, index) => {
      const employee = employeeDirectory.find((item) => item.id === selected.boundEmployeeIds[index]);
      return <li key={selected.boundEmployeeIds[index] || `${name}-${index}`}><span className={`aui-avatar tone-${index % 3}`}>{accountInitials(name)}</span><div><strong>{name}</strong><span>{employee?.position || "Сотрудник"}</span></div></li>;
    })}</ul> : selected.employeeScope !== "all" ? <div className="aui-empty"><strong>Сотрудники не привязаны</strong><span>Добавьте сотрудников, которым доступен этот аккаунт.</span></div> : null}
  </section>;

  return <ModalShell className="aui-detail-modal" restoreFocusRef={restoreFocusRef} title={`Аккаунт ${selected.login}`} subtitle={selected.role} titleBadge={<><Smartphone aria-hidden="true" size={32} /><AccountAccess value={selected.status} /></>} onClose={onClose}
    actions={<><div className="aui-detail-footer-start">{canManage ? <button className="aui-link" onClick={onOpenPassword} type="button"><LockKeyhole aria-hidden="true" size={19} />Изменить пароль</button> : null}</div><button className="aui-button" onClick={onClose} type="button">Закрыть</button>{canManage ? <button className="aui-button primary" onClick={onOpenEdit} type="button">Редактировать</button> : null}</>}>
    <nav className="aui-tabs aui-detail-tabs" aria-label="Разделы аккаунта" role="tablist">{tabs.map((item, index) => <button aria-label={`${item.label}${item.count !== undefined ? ` ${item.count}` : ""}`} aria-controls={`${id}-panel`} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} className={tab === item.id ? "active" : ""} id={`${id}-${item.id}`} key={item.id} onClick={() => setTab(item.id)} onKeyDown={(event) => {
      const nextIndex = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
      if (nextIndex === null) return;
      event.preventDefault(); setTab(tabs[nextIndex].id);
      document.getElementById(`${id}-${tabs[nextIndex].id}`)?.focus();
    }} role="tab" type="button">{item.label}{item.count !== undefined ? <span>{item.count}</span> : null}</button>)}</nav>
    <div className="aui-detail-body" id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`}>
      {tab !== "employees" ? <AccountActivityNotice status={status} errorMessage={errorMessage} onRefresh={onRefresh} /> : null}
      {tab === "overview" ? <div className="aui-detail-columns">{employees}<div className="aui-detail-activity"><h3>Последнее устройство</h3><div className="aui-detail-device"><span className="aui-device-icon"><Smartphone aria-hidden="true" size={28} /></span><div><strong>{device?.device || selected.device || "Нет данных об устройстве"}</strong><AccountConnection value={device?.status || selected.session} /><span>Приложение {device?.appVersion || selected.version || "—"}</span></div></div><dl className="aui-detail-seen"><dt>Последняя активность</dt><dd>{device ? accountTime(device.lastSeenAt) : selected.lastSeen || "—"}</dd></dl><h3>Последние события</h3><MobileAccountEvents events={ownEvents} limit={2} /></div></div> : null}
      {tab === "employees" ? employees : null}
      {tab === "sessions" || tab === "security" ? <><div className="aui-section-head"><h3>{tab === "sessions" ? "Сессии аккаунта" : "События безопасности"}</h3><AccountRefresh onRefresh={onRefresh} status={status} /></div>{tab === "sessions" ? <MobileAccountSessions sessions={ownSessions} /> : <MobileAccountEvents events={ownEvents} detailed />}</> : null}
    </div>
  </ModalShell>;
}

