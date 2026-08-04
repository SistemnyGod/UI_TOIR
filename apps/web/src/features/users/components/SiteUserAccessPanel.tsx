import { Activity, ArrowDown, ArrowUp, BookOpenCheck, BriefcaseBusiness, Building2, ChevronDown, ChevronRight, Download, Eye, FileClock, Gauge, Info, KeyRound, LockKeyhole, Pencil, RotateCcw, Search, ShieldCheck, UnlockKeyhole, UserCog, UsersRound, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AccessModuleDto, PermissionOverrideDto, SiteUserAccessCatalogDto, SiteUserAccessDto, SiteUserAuditEventDto, SiteUserAuditPageDto, SiteUserSessionsDto } from "../../../api/contracts";
import type { SiteUser } from "../../../types";

type AccessTab = "permissions" | "scopes" | "audit";
type PermissionEffectFilter = "all" | "enabled" | "role" | "allow" | "deny";
type SectionOption = { id: string; name: string; isActive: boolean; sortOrder: number };

const copy = { save: "Сохранить изменения", saved: "Изменения сохранены", inherit: "Наследовать роль", selectAll: "Выбрать все", role: "Роль", personal: "Личное", denied: "Запрещено" };

export function SiteUserAccessPanel({ canManage = true, catalog, emuSections = [], loadAccess, loadAudit, loadSessions, onDirtyChange, onEditProfile, onOpenProfile, onExportAudit, onNotify, onResetPassword, onSavePermissions, onSaveScopes, onToggleBlock, onChangeRole, user }: {
  canManage?: boolean;
  catalog?: SiteUserAccessCatalogDto | null;
  emuSections?: SectionOption[];
  loadAccess: (userId: string) => Promise<SiteUserAccessDto | null>;
  loadAudit?: (userId: string, page?: number) => Promise<SiteUserAuditPageDto | null>;
  loadSessions?: (userId: string) => Promise<SiteUserSessionsDto | null>;
  onDirtyChange?: (dirty: boolean) => void;
  onEditProfile?: (user: SiteUser) => void;
  onOpenProfile?: (user: SiteUser) => void;
  onExportAudit?: (userId: string) => Promise<void>;
  onNotify: (message: string) => void;
  onResetPassword?: (user: SiteUser) => Promise<void> | void;
  onSavePermissions: (userId: string, permissionCodes: string[], overrides?: PermissionOverrideDto[]) => Promise<unknown> | void;
  onSaveScopes: (userId: string, scopes: Array<{ moduleKey: string; scopeType: string; scopeId: string; sortOrder?: number }>, scopeMode?: "all" | "selected") => Promise<unknown> | void;
  onToggleBlock?: (user: SiteUser) => Promise<void> | void;
  onChangeRole?: (userId: string, role: SiteUser["role"]) => Promise<void> | void;
  user?: SiteUser;
}) {
  const [activeTab, setActiveTab] = useState<AccessTab>("permissions");
  const [access, setAccess] = useState<SiteUserAccessDto | null>(null);
  const [overrides, setOverrides] = useState<PermissionOverrideDto[]>([]);
  const [savedOverrides, setSavedOverrides] = useState<PermissionOverrideDto[]>([]);
  const [scopeMode, setScopeMode] = useState<"all" | "selected">("selected");
  const [scopeIds, setScopeIds] = useState<string[]>([]);
  const [savedScopeIds, setSavedScopeIds] = useState<string[]>([]);
  const [savedScopeMode, setSavedScopeMode] = useState<"all" | "selected">("selected");
  const [scopeQuery, setScopeQuery] = useState("");
  const [permissionQuery, setPermissionQuery] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [effectFilter, setEffectFilter] = useState<PermissionEffectFilter>("all");
  const [modifiedOnly, setModifiedOnly] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
  const [audit, setAudit] = useState<SiteUserAuditPageDto | null>(null);
  const [sessions, setSessions] = useState<SiteUserSessionsDto | null>(null);
  const [expandedAudit, setExpandedAudit] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [scopeSaving, setScopeSaving] = useState(false);
  const [permissionSaving, setPermissionSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setActiveTab("permissions");
    setPermissionQuery("");
    setModuleFilter("all");
    setEffectFilter("all");
    setModifiedOnly(false);
    setScopeQuery("");
    setAudit(null);
    setSessions(null);
    setExpandedAudit(null);
    if (!user) {
      setAccess(null); setOverrides([]); setSavedOverrides([]); setScopeIds([]); setSavedScopeIds([]); setSavedScopeMode("selected");
      return;
    }
    setLoading(true);
    void loadAccess(user.id).then((nextAccess) => {
      if (cancelled) return;
      const nextOverrides = nextAccess?.permissionOverrides ?? user.permissionOverrides ?? [];
      const nextScopeMode = nextAccess?.scopeMode ?? "selected";
      const nextScopeIds = (nextAccess?.scopes ?? []).slice().sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0)).map((item) => item.scopeId);
      setAccess(nextAccess); setOverrides(nextOverrides); setSavedOverrides(nextOverrides); setScopeMode(nextScopeMode); setSavedScopeMode(nextScopeMode); setScopeIds(nextScopeIds); setSavedScopeIds(nextScopeIds);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadAccess, user]);

  useEffect(() => {
    if (activeTab !== "audit" || !user) return;
    void loadAudit?.(user.id).then((result) => setAudit(result ?? null));
    void loadSessions?.(user.id).then((result) => setSessions(result ?? null));
  }, [activeTab, loadAudit, loadSessions, user]);

  const modules = catalog?.modules ?? [];
  const rolePermissionCodes = useMemo(() => {
    const roleCodes = access?.roles ?? (user?.roleCode ? [user.roleCode] : []);
    return new Set(roleCodes.flatMap((roleCode) => catalog?.roles.find((role) => role.code === roleCode)?.permissions ?? []));
  }, [access?.roles, catalog?.roles, user?.roleCode]);
  const overrideMap = useMemo(() => new Map(overrides.map((item) => [item.code, item.effect])), [overrides]);
  const permissionsDirtyKey = useMemo(() => JSON.stringify([...overrides].sort((left, right) => left.code.localeCompare(right.code))), [overrides]);
  const savedPermissionsKey = useMemo(() => JSON.stringify([...savedOverrides].sort((left, right) => left.code.localeCompare(right.code))), [savedOverrides]);
  const effectivePermissions = useMemo(() => {
    const result = new Set(rolePermissionCodes);
    overrides.forEach((item) => item.effect === "allow" ? result.add(item.code) : result.delete(item.code));
    if (!catalog) (access?.effectivePermissions ?? user?.access ?? []).forEach((code) => result.add(code));
    return result;
  }, [access?.effectivePermissions, catalog, overrides, rolePermissionCodes, user?.access]);

  useEffect(() => {
    const dirty = Boolean(user && (permissionsDirtyKey !== savedPermissionsKey || scopeMode !== savedScopeMode || JSON.stringify(scopeIds) !== JSON.stringify(savedScopeIds)));
    onDirtyChange?.(dirty);
  }, [onDirtyChange, permissionsDirtyKey, savedPermissionsKey, savedScopeIds, savedScopeMode, scopeIds, scopeMode, user]);

  const filteredModules = useMemo(() => {
    const query = permissionQuery.trim().toLowerCase();
    return modules.filter((module) => moduleFilter === "all" || module.key === moduleFilter).map((module) => {
      const moduleMatches = !query || module.name.toLowerCase().includes(query) || module.key.toLowerCase().includes(query);
      const permissions = module.permissions.filter((permission) => {
        const effect = overrideMap.get(permission.code);
        const active = effectivePermissions.has(permission.code);
        const queryMatches = moduleMatches || permission.name.toLowerCase().includes(query) || permission.code.toLowerCase().includes(query);
        const effectMatches = effectFilter === "all" || (effectFilter === "enabled" && active) || (effectFilter === "role" && !effect && rolePermissionCodes.has(permission.code)) || effect === effectFilter;
        return queryMatches && effectMatches && (!modifiedOnly || Boolean(effect));
      });
      return { ...module, permissions };
    }).filter((module) => module.permissions.length > 0);
  }, [effectFilter, effectivePermissions, modifiedOnly, moduleFilter, modules, overrideMap, permissionQuery, rolePermissionCodes]);

  const visibleSections = useMemo(() => {
    const query = scopeQuery.trim().toLowerCase();
    return emuSections.filter((section) => section.isActive && (!query || section.name.toLowerCase().includes(query))).sort((left, right) => left.sortOrder - right.sortOrder);
  }, [emuSections, scopeQuery]);

  if (!user) return <div className="user-access-empty">Выберите пользователя</div>;
  const currentUser = user;

  function setOverride(code: string, effect: "allow" | "deny") { setOverrides((current) => [...current.filter((item) => item.code !== code), { code, effect }]); }
  function togglePermission(code: string) { setOverride(code, effectivePermissions.has(code) ? "deny" : "allow"); }
  function applyModule(moduleKey: string, mode: "allow" | "deny" | "inherit") {
    const module = modules.find((item) => item.key === moduleKey);
    if (!module) return;
    setOverrides((current) => {
      const next = current.filter((item) => !module.permissions.some((permission) => permission.code === item.code));
      return mode === "inherit" ? next : [...next, ...module.permissions.map((permission) => ({ code: permission.code, effect: mode }))];
    });
  }
  function applyReadOnly() { setOverrides(modules.flatMap((module) => module.permissions.map((permission) => ({ code: permission.code, effect: permission.isViewDefault ? "allow" as const : "deny" as const })))); }
  function applyRolePreset(roleCode: string, fallbackName: string) {
    const preset = catalog?.roles.find((role) => role.code === roleCode) ?? catalog?.roles.find((role) => role.name.toLowerCase().includes(fallbackName.toLowerCase()));
    if (!preset) { onNotify("Профиль прав пока недоступен."); return; }
    const allowed = new Set(preset.permissions);
    setOverrides(modules.flatMap((module) => module.permissions.map((permission) => ({ code: permission.code, effect: allowed.has(permission.code) ? "allow" as const : "deny" as const }))));
  }
  function moveScope(scopeId: string, delta: number) {
    setScopeIds((current) => {
      const index = current.indexOf(scopeId); const nextIndex = index + delta;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current]; [next[index], next[nextIndex]] = [next[nextIndex], next[index]]; return next;
    });
  }
  async function savePermissions() {
    setPermissionSaving(true);
    try { await onSavePermissions(currentUser.id, [...effectivePermissions], overrides); setSavedOverrides(overrides); onNotify(copy.saved); } finally { setPermissionSaving(false); }
  }
  async function saveScopes() {
    setScopeSaving(true);
    try { await onSaveScopes(currentUser.id, scopeIds.map((scopeId, index) => ({ moduleKey: "emu", scopeType: "emu_section", scopeId, sortOrder: index })), scopeMode); setSavedScopeIds(scopeIds); setSavedScopeMode(scopeMode); onNotify(copy.saved); } finally { setScopeSaving(false); }
  }

  const selectedSectionIds = scopeMode === "all" ? emuSections.filter((section) => section.isActive).sort((left, right) => left.sortOrder - right.sortOrder).map((section) => section.id) : scopeIds;
  const sectionById = new Map(emuSections.map((section) => [section.id, section]));
  const roleCount = modules.flatMap((module) => module.permissions).filter((permission) => rolePermissionCodes.has(permission.code) && !overrideMap.has(permission.code)).length;
  const personalCount = overrides.filter((item) => item.effect === "allow").length;
  const initials = currentUser.fullName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const permissionsDirty = permissionsDirtyKey !== savedPermissionsKey;
  const scopesDirty = scopeMode !== savedScopeMode || JSON.stringify(scopeIds) !== JSON.stringify(savedScopeIds);
  return <section className="user-access-shell">
    <div className="user-access-primary">
      <header className="user-profile-card">
        <div className="user-profile-identity"><span className="user-avatar">{initials}</span><div><h2>{currentUser.fullName}</h2><p>{currentUser.login}</p><div className="user-profile-badges"><span>{currentUser.role}</span><span className={currentUser.status === "Активен" ? "is-active" : "is-blocked"}>{currentUser.status}</span></div></div></div>
        <div className="user-profile-facts"><span>Последний вход<strong>{currentUser.lastLogin || "Нет данных"}</strong></span><span>Создан<strong>{currentUser.createdAt || "Нет данных"}</strong></span></div>
        <div className="user-profile-actions">
          <button className="button primary" onClick={() => (onEditProfile ?? onOpenProfile)?.(currentUser)} type="button"><Pencil /> Профиль</button>
          <button className="button ghost" onClick={() => void onResetPassword?.(currentUser)} type="button"><KeyRound /> Сбросить пароль</button>
          <button className="button danger-outline" onClick={() => void onToggleBlock?.(currentUser)} type="button">{currentUser.status === "Заблокирован" ? <UnlockKeyhole /> : <LockKeyhole />}{currentUser.status === "Заблокирован" ? "Разблокировать" : "Заблокировать"}</button>
        </div>
      </header>
      <nav className="user-access-tabs">{(["permissions", "scopes", "audit"] as AccessTab[]).map((x) => <button className={activeTab === x ? "is-active" : ""} key={x} onClick={() => setActiveTab(x)} type="button">{x === "permissions" ? "Права" : x === "scopes" ? "Участки ЭМУ" : "Аудит"}</button>)}</nav>
      {activeTab === "permissions" ? <div className="user-access-content">
        <div className="user-access-section-heading"><div><h3>Быстрые наборы прав</h3><p>Примените профиль и скорректируйте отдельные права.</p></div></div>
        <div className="permission-presets">
          <button onClick={applyReadOnly} type="button"><Eye />Только просмотр</button><button onClick={() => applyRolePreset("operator", "оператор")} type="button"><ShieldCheck />Оператор обходов</button><button onClick={() => applyRolePreset("emu_operator", "эму")} type="button"><UserCog />ЭМУ базовый</button><button onClick={() => applyRolePreset("accountant", "бухгалтер")} type="button"><BriefcaseBusiness />Бухгалтерия</button><button onClick={() => applyRolePreset("administrator", "администратор")} type="button"><LockKeyhole />Администратор</button>
        </div>
        <div className="permission-filters"><label><Search /><input value={permissionQuery} onChange={(e) => setPermissionQuery(e.target.value)} placeholder="Поиск прав..." /></label><select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}><option value="all">Все модули</option>{modules.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}</select><select value={effectFilter} onChange={(e) => setEffectFilter(e.target.value as PermissionEffectFilter)}><option value="all">Все типы доступа</option><option value="role">От роли</option><option value="allow">Личные разрешения</option><option value="deny">Запреты</option></select><label className="switch-row"><input checked={modifiedOnly} onChange={(e) => setModifiedOnly(e.target.checked)} type="checkbox" />Только изменённые</label></div>
        <div className="permission-modules">{filteredModules.map((module) => { const open = Boolean(expandedModules[module.key]); return <article className="permission-module" key={module.key}><header><button onClick={() => setExpandedModules((current) => ({ ...current, [module.key]: !current[module.key] }))} type="button">{open ? <ChevronDown /> : <ChevronRight />}<strong>{module.name}</strong><span>{module.permissions.filter((p) => effectivePermissions.has(p.code)).length}/{module.permissions.length}</span></button><div><button onClick={() => applyModule(module.key, "allow")} type="button">Выбрать все</button><button onClick={() => applyModule(module.key, "deny")} type="button">Снять все</button><button title="Наследовать роль" onClick={() => applyModule(module.key, "inherit")} type="button"><RotateCcw /></button></div></header>{open ? <div className="permission-grid">{module.permissions.map((p) => { const effect = overrideMap.get(p.code); return <label key={p.code}><input checked={effectivePermissions.has(p.code)} onChange={() => togglePermission(p.code)} type="checkbox" /><span><strong>{p.name}</strong><small>{p.category}</small></span><em className={effect === "deny" ? "is-deny" : effect === "allow" ? "is-personal" : "is-role"}>{effect === "deny" ? "Запрещено" : effect === "allow" ? "Личное" : "Роль"}</em></label>; })}{!module.permissions.length ? <p className="user-access-muted">Нет прав по выбранным фильтрам.</p> : null}</div> : null}</article>; })}</div>
        <footer className="user-access-savebar"><div><strong>Назначено {effectivePermissions.size} прав</strong><span>Из роли: {roleCount} · личные: {personalCount} · запреты: {overrides.filter((x) => x.effect === "deny").length}</span></div><button className="button primary" disabled={!canManage || !permissionsDirty || permissionSaving} onClick={() => void savePermissions()} type="button">{permissionSaving ? "Сохранение..." : "Сохранить права"}</button></footer>
      </div> : null}
      {activeTab === "scopes" ? <div className="user-access-content scope-workspace">
        <div className="scope-main"><div className="scope-mode"><button className={scopeMode === "all" ? "is-active" : ""} onClick={() => setScopeMode("all")} type="button">Все участки</button><button className={scopeMode === "selected" ? "is-active" : ""} onClick={() => setScopeMode("selected")} type="button">Только выбранные</button></div><div className="scope-info"><Info /><span><strong>{scopeMode === "all" ? "Доступ ко всем участкам ЭМУ" : `Выбрано ${scopeIds.length} из ${emuSections.filter((x) => x.isActive).length} участков`}</strong>Настройка ограничивает данные и действия пользователя в модуле ЭМУ.</span></div><div className="scope-toolbar"><label><Search /><input value={scopeQuery} onChange={(e) => setScopeQuery(e.target.value)} placeholder="Поиск участка..." /></label><button onClick={() => { setScopeMode("selected"); setScopeIds(visibleSections.map((x) => x.id)); }} type="button">Выбрать все</button><button onClick={() => { setScopeMode("selected"); setScopeIds([]); }} type="button">Очистить</button></div><div className="scope-check-grid">{visibleSections.map((section) => <label className={scopeMode === "all" || scopeIds.includes(section.id) ? "is-selected" : ""} key={section.id}><input checked={scopeMode === "all" || scopeIds.includes(section.id)} disabled={scopeMode === "all"} onChange={(e) => setScopeIds((current) => e.target.checked ? [...current, section.id] : current.filter((id) => id !== section.id))} type="checkbox" /><span>{section.name}</span></label>)}</div></div>
        <aside className="scope-summary"><header><h3>Назначенные участки</h3><span>{selectedSectionIds.length}</span></header><div>{selectedSectionIds.map((id, i) => { const section = sectionById.get(id); return section ? <div key={id}><span>{section.name}</span>{scopeMode === "selected" ? <span className="scope-order"><button disabled={i === 0} onClick={() => moveScope(id, -1)} title="Выше" type="button"><ArrowUp /></button><button disabled={i === selectedSectionIds.length - 1} onClick={() => moveScope(id, 1)} title="Ниже" type="button"><ArrowDown /></button></span> : null}</div> : null; })}</div><p><Info />Проверьте, что пользователю доступны все необходимые производственные участки.</p><button className="button primary" disabled={!canManage || !scopesDirty || scopeSaving} onClick={() => void saveScopes()} type="button">Сохранить участки</button></aside>
      </div> : null}
      {activeTab === "audit" ? <AuditPanel audit={audit} sessions={sessions} onExport={() => void onExportAudit?.(currentUser.id)} /> : null}
    </div><AccessSummary modules={modules} effective={effectivePermissions} roleCount={roleCount} personal={personalCount} />
  </section>;
}
function AccessSummary({ modules, effective, roleCount, personal }: { modules: AccessModuleDto[]; effective: Set<string>; roleCount: number; personal: number }) { return <aside className="access-summary"><h3><ShieldCheck />Итоговый доступ</h3><div className="access-total"><span>Всего назначено</span><strong>{effective.size} прав</strong><small>Из роли: {roleCount} · Личные: {personal}</small></div><h4>По модулям</h4>{modules.map((m) => { const count = m.permissions.filter((p) => effective.has(p.code)).length; return <div className="access-module-meter" key={m.key}><span>{m.name}<b>{count}/{m.permissions.length}</b></span><i><em style={{ width: `${m.permissions.length ? count / m.permissions.length * 100 : 0}%` }} /></i></div>; })}<div className="access-tip"><Info /><span><strong>Подсказка</strong>Личные запреты имеют приоритет над правами роли.</span></div></aside>; }
function AuditPanel({ audit, sessions, onExport }: { audit: SiteUserAuditPageDto | null; sessions: SiteUserSessionsDto | null; onExport: () => void }) { const events = audit?.items ?? []; return <div className="user-access-content audit-workspace"><div className="audit-kpis"><span><strong>{events.length || "—"}</strong>Событий</span><span><strong>{audit?.changedPermissionsLast30Days ?? "—"}</strong>Изменений прав за 30 дней</span><span><strong>{sessions?.activeCount ?? "—"}</strong>Активных сессий</span><span><strong>{events[0] ? new Date(events[0].createdAt).toLocaleString("ru-RU") : "—"}</strong>Последнее изменение</span></div><div className="audit-toolbar"><label><Search /><input placeholder="Поиск по пользователю или праву..." /></label><select><option>Все типы событий</option></select><select><option>Все модули</option></select><button onClick={onExport} type="button"><Download />Экспорт CSV</button></div><div className="audit-table"><header><span>Дата и время</span><span>Кто изменил</span><span>Действие</span><span>Модуль</span><span>Детали</span></header>{events.map((event) => <article key={event.id}><time>{new Date(event.createdAt).toLocaleString("ru-RU")}</time><span>{event.actorName || "Система"}</span><strong>{eventTypeLabel(event.eventType)}</strong><span>{event.moduleKey || "—"}</span><p>{event.details || "Изменение зафиксировано"}</p></article>)}{!events.length ? <div className="audit-empty"><ShieldCheck /><h3>История пока пуста</h3><p>Новые изменения профиля, прав и участков появятся здесь после обновления API.</p></div> : null}</div></div>; }
function eventTypeLabel(type: string) { const labels: Record<string, string> = { created: "Пользователь создан", updated: "Профиль изменён", permissions_updated: "Права изменены", scopes_updated: "Участки изменены", blocked: "Пользователь заблокирован", unblocked: "Пользователь разблокирован", password_reset: "Пароль сброшен", login: "Вход в систему", logout: "Выход из системы" }; return labels[type] ?? type.replaceAll("_", " "); }
