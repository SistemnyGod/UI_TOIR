import { useEffect, useMemo, useState } from "react";
import { ApiClient } from "../../../api/client";
import type { SiteUserAccessDto, SiteUserAccessScopeUpsertDto } from "../../../api/contracts";
import type { SiteUser } from "../../../types";

interface EmuSectionOption {
  id: string;
  name: string;
  isActive: boolean;
}

function sameStringSet(left: string[], right: string[]) {
  if (left.length !== right.length) return false;

  const rightSet = new Set(right);
  return left.every((item) => rightSet.has(item));
}

type AccessTab = "permissions" | "scopes" | "audit";
type PermissionCategory = "Просмотр" | "Действия" | "Администрирование" | "Аудит/Экспорт";

interface PermissionItem {
  code: string;
  label: string;
  category: PermissionCategory;
}

const categoryOrder: PermissionCategory[] = ["Просмотр", "Действия", "Администрирование", "Аудит/Экспорт"];

const permissionGroups: Array<{ module: string; description: string; items: PermissionItem[] }> = [
  {
    module: "Обход",
    description: "Маршруты, назначения, результаты и мобильные аккаунты.",
    items: [
      { code: "dashboard.read", label: "Дашборд", category: "Просмотр" },
      { code: "routes.read", label: "Маршруты", category: "Просмотр" },
      { code: "employees.read", label: "Сотрудники", category: "Просмотр" },
      { code: "results.read", label: "Результаты", category: "Просмотр" },
      { code: "assignments.read", label: "Назначения", category: "Просмотр" },
      { code: "requests.read", label: "Заявки", category: "Просмотр" },
      { code: "assignments.write", label: "Создавать назначения", category: "Действия" },
      { code: "routes.write", label: "Управлять маршрутами", category: "Администрирование" },
    ],
  },
  {
    module: "Бухгалтерия",
    description: "Сотрудники учета, СИЗ, под запись, склад и отчеты.",
    items: [
      { code: "inventory.view", label: "Просмотр модуля", category: "Просмотр" },
      { code: "inventory.stock.view", label: "Остатки", category: "Просмотр" },
      { code: "inventory.issue.manage", label: "Выдача и возврат", category: "Действия" },
      { code: "inventory.custody.manage", label: "Под запись", category: "Действия" },
      { code: "inventory.ppe.manage", label: "СИЗ", category: "Действия" },
      { code: "inventory.items.manage", label: "Номенклатура", category: "Администрирование" },
      { code: "inventory.import", label: "Импорт", category: "Администрирование" },
      { code: "inventory.settings.manage", label: "Настройки", category: "Администрирование" },
      { code: "inventory.audit.view", label: "Аудит", category: "Аудит/Экспорт" },
      { code: "inventory.reports.view", label: "Отчеты", category: "Аудит/Экспорт" },
      { code: "inventory.reports.export", label: "Экспорт", category: "Аудит/Экспорт" },
    ],
  },
  {
    module: "ЭМУ",
    description: "Дашборд, учет работ, история, план, справочники и ограничения по участкам.",
    items: [
      { code: "emu.view", label: "Модуль", category: "Просмотр" },
      { code: "emu.dashboard.view", label: "Дашборд", category: "Просмотр" },
      { code: "emu.work-accounting.view", label: "Учет работ", category: "Просмотр" },
      { code: "emu.history.view", label: "История", category: "Просмотр" },
      { code: "emu.plan.view", label: "План", category: "Просмотр" },
      { code: "emu.work.create", label: "Создать работу", category: "Действия" },
      { code: "emu.work.update", label: "Редактировать работу", category: "Действия" },
      { code: "emu.work.pause", label: "Пауза / продолжить", category: "Действия" },
      { code: "emu.work.complete", label: "Завершить", category: "Действия" },
      { code: "emu.time.override", label: "Корректировка времени", category: "Действия" },
      { code: "emu.work.delete", label: "Удалить активную", category: "Администрирование" },
      { code: "emu.directories.manage", label: "Справочники", category: "Администрирование" },
      { code: "emu.favorite-employees.manage", label: "Избранные сотрудники", category: "Администрирование" },
      { code: "emu.plan.manage", label: "Управлять планом", category: "Администрирование" },
      { code: "emu.plan.approve", label: "Согласование плана", category: "Администрирование" },
      { code: "emu.scope.all", label: "Все участки ЭМУ", category: "Администрирование" },
      { code: "emu.audit.view", label: "Аудит", category: "Аудит/Экспорт" },
      { code: "emu.reports.view", label: "Отчеты", category: "Аудит/Экспорт" },
      { code: "emu.reports.export", label: "Экспорт", category: "Аудит/Экспорт" },
    ],
  },
  {
    module: "PERCo",
    description: "Подключение, синхронизация проходов, сопоставление и журнал.",
    items: [
      { code: "integrations.perco.view", label: "Просмотр", category: "Просмотр" },
      { code: "integrations.perco.sync", label: "Синхронизация", category: "Действия" },
      { code: "integrations.perco.match", label: "Сопоставление", category: "Действия" },
      { code: "integrations.perco.manage", label: "Настройки", category: "Администрирование" },
      { code: "integrations.perco.logs.view", label: "Журнал", category: "Аудит/Экспорт" },
    ],
  },
  {
    module: "Администрирование",
    description: "Пользователи, роли, системные уведомления и права.",
    items: [
      { code: "site_users.write", label: "Пользователи и права", category: "Администрирование" },
      { code: "system_notifications.read", label: "Уведомления", category: "Просмотр" },
    ],
  },
];

type PermissionFilter = "all" | PermissionCategory;

const permissionPresets = [
  {
    id: "read-only",
    label: "Только просмотр",
    description: "Просмотр доступных модулей без действий",
    codes: permissionGroups.flatMap((group) => group.items.filter((item) => item.category === "Просмотр").map((item) => item.code)),
  },
  {
    id: "patrol-operator",
    label: "Оператор обходов",
    description: "Обходы, сотрудники, результаты и назначения",
    codes: permissionGroups.find((group) => group.module === "Обход")?.items.map((item) => item.code) ?? [],
  },
  {
    id: "emu-creator",
    label: "ЭМУ: создание",
    description: "Просмотр ЭМУ и создание работ",
    codes: permissionGroups.find((group) => group.module === "ЭМУ")?.items
      .filter((item) => item.category === "Просмотр" || item.code === "emu.work.create")
      .map((item) => item.code) ?? [],
  },
] as const;

const accessTabs: Array<{ id: AccessTab; label: string }> = [
  { id: "permissions", label: "Права" },
  { id: "scopes", label: "Участки" },
  { id: "audit", label: "Аудит" },
];

export function SiteUserAccessPanel({
  canManage,
  loadAccess,
  onChangeRole,
  onOpenProfile,
  onNotify,
  onSavePermissions,
  onSaveScopes,
  user,
}: {
  canManage: boolean;
  loadAccess: (userId: string) => Promise<SiteUserAccessDto | null>;
  onChangeRole?: (userId: string, role: SiteUser["role"]) => Promise<void> | void;
  onNotify: (message: string) => void;
  onOpenProfile?: (user: SiteUser) => void;
  onSavePermissions: (userId: string, permissionCodes: string[]) => Promise<unknown>;
  onSaveScopes: (userId: string, scopes: SiteUserAccessScopeUpsertDto[]) => Promise<SiteUserAccessDto | null>;
  user?: SiteUser;
}) {
  const [access, setAccess] = useState<SiteUserAccessDto | null>(null);
  const [activeTab, setActiveTab] = useState<AccessTab>("permissions");
  const [permissionSearch, setPermissionSearch] = useState("");
  const [permissionFilter, setPermissionFilter] = useState<PermissionFilter>("all");
  const [sections, setSections] = useState<EmuSectionOption[]>([]);
  const [sectionSearch, setSectionSearch] = useState("");
  const [directPermissions, setDirectPermissions] = useState<string[]>([]);
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);
  const [roleDraft, setRoleDraft] = useState<SiteUser["role"]>(user?.role ?? "Оператор");
  const [baselineDirectPermissions, setBaselineDirectPermissions] = useState<string[]>([]);
  const [baselineSectionIds, setBaselineSectionIds] = useState<string[]>([]);
  const [sectionsStatus, setSectionsStatus] = useState<"loading" | "ready" | "error">("loading");
  const [sectionLoadToken, setSectionLoadToken] = useState(0);
  const [loading, setLoading] = useState(false);
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [savingScopes, setSavingScopes] = useState(false);
  const [savingRole, setSavingRole] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!user) {
        setAccess(null);
        setRoleDraft("Оператор");
        setDirectPermissions([]);
        setSelectedSectionIds([]);
        setBaselineDirectPermissions([]);
        setBaselineSectionIds([]);
        return;
      }

      setLoading(true);
      try {
        const result = await loadAccess(user.id);
        if (!isMounted) return;

        setAccess(result);
        setRoleDraft(user.role);
        const nextDirectPermissions = result?.directPermissions ?? user.directPermissions ?? [];
        setDirectPermissions(nextDirectPermissions);
        setBaselineDirectPermissions(nextDirectPermissions);
        const emuScopes = result?.scopes.filter((scope) => scope.moduleKey === "emu" && scope.scopeType === "emu_section") ?? [];
        const nextSectionIds = emuScopes.map((scope) => scope.scopeId);
        setSelectedSectionIds(nextSectionIds);
        setBaselineSectionIds(nextSectionIds);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, [loadAccess, user]);

  useEffect(() => {
    if (user) setRoleDraft(user.role);
  }, [user?.id, user?.role]);

  useEffect(() => {
    let isMounted = true;

    async function loadSections() {
      setSectionsStatus("loading");
      try {
        const apiClient = new ApiClient();
        const response = await apiClient.get<EmuSectionOption[] | { sections?: EmuSectionOption[] }>("/api/v1/emu/sections");
        if (!isMounted) return;
        setSections(Array.isArray(response) ? response : response.sections ?? []);
        setSectionsStatus("ready");
      } catch {
        if (isMounted) {
          setSections([]);
          setSectionsStatus("error");
        }
      }
    }

    void loadSections();
    return () => {
      isMounted = false;
    };
  }, [sectionLoadToken]);

  const effective = useMemo(() => new Set(access?.effectivePermissions ?? user?.access ?? []), [access, user]);
  const direct = useMemo(() => new Set(directPermissions), [directPermissions]);
  const selectedSections = useMemo(() => new Set(selectedSectionIds), [selectedSectionIds]);
  const activeSections = useMemo(() => {
    const normalizedSearch = sectionSearch.trim().toLowerCase();
    return sections
      .filter((section) => section.isActive)
      .filter((section) => !normalizedSearch || section.name.toLowerCase().includes(normalizedSearch));
  }, [sectionSearch, sections]);
  const moduleSummaries = useMemo(() => permissionGroups.map((group) => {
    const codes = group.items.map((item) => item.code);
    return {
      module: group.module,
      total: codes.length,
      direct: codes.filter((code) => direct.has(code)).length,
      effective: codes.filter((code) => effective.has(code)).length,
    };
  }), [direct, effective]);
  const filteredPermissionGroups = useMemo(() => {
    const normalizedSearch = permissionSearch.trim().toLowerCase();
    return permissionGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          (permissionFilter === "all" || item.category === permissionFilter)
          && (!normalizedSearch
            || item.code.toLowerCase().includes(normalizedSearch)
            || item.label.toLowerCase().includes(normalizedSearch)
            || item.category.toLowerCase().includes(normalizedSearch)
            || group.module.toLowerCase().includes(normalizedSearch))),
      }))
      .filter((group) => group.items.length > 0);
  }, [permissionFilter, permissionSearch]);

  const hasEmuWorkAccess = effective.has("emu.work-accounting.view") || direct.has("emu.work-accounting.view");
  const hasFullEmuScope = user?.role === "Администратор" || user?.role === "Руководитель" || effective.has("emu.scope.all") || direct.has("emu.scope.all");
  const needsSectionScope = !hasFullEmuScope && hasEmuWorkAccess && selectedSectionIds.length === 0;

  const permissionsDirty = useMemo(
    () => !sameStringSet(directPermissions, baselineDirectPermissions),
    [baselineDirectPermissions, directPermissions],
  );
  const roleDirty = Boolean(user && roleDraft !== user.role);
  const scopesDirty = useMemo(
    () => !sameStringSet(selectedSectionIds, baselineSectionIds),
    [baselineSectionIds, selectedSectionIds],
  );

  if (!user) {
    return (
      <aside className="site-user-access-panel">
        <div className="site-user-empty-panel">
          <strong>Пользователь не выбран</strong>
          <span>Выберите строку в списке, чтобы открыть профиль, права и участки.</span>
        </div>
      </aside>
    );
  }

  const currentUser = user;

  function togglePermission(code: string) {
    setDirectPermissions((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code]);
  }

  function applyPermissionPreset(codes: readonly string[]) {
    const next = Array.from(new Set([...directPermissions, ...codes]));
    setDirectPermissions(next);
  }

  function clearModulePermissions(codes: string[]) {
    const codeSet = new Set(codes);
    setDirectPermissions((current) => current.filter((code) => !codeSet.has(code)));
  }

  function addModulePermissions(codes: string[]) {
    setDirectPermissions((current) => Array.from(new Set([...current, ...codes])));
  }

  function toggleSection(sectionId: string) {
    setSelectedSectionIds((current) => current.includes(sectionId) ? current.filter((item) => item !== sectionId) : [...current, sectionId]);
  }

  async function savePermissions() {
    setSavingPermissions(true);
    try {
      await onSavePermissions(currentUser.id, directPermissions);
      const nextAccess = await loadAccess(currentUser.id);
      setAccess(nextAccess);
      const nextDirectPermissions = nextAccess?.directPermissions ?? directPermissions;
      setDirectPermissions(nextDirectPermissions);
      setBaselineDirectPermissions(nextDirectPermissions);
    } finally {
      setSavingPermissions(false);
    }
  }

  async function saveRole() {
    if (!user || !onChangeRole || !roleDirty) return;

    setSavingRole(true);
    try {
      await onChangeRole(user.id, roleDraft);
    } finally {
      setSavingRole(false);
    }
  }

  async function saveScopes() {
    const scopes = selectedSectionIds.map((scopeId) => ({ moduleKey: "emu", scopeType: "emu_section", scopeId }));
    setSavingScopes(true);
    try {
      const updated = await onSaveScopes(currentUser.id, scopes);
      if (updated) {
        setAccess(updated);
        const nextSectionIds = updated.scopes
          .filter((scope) => scope.moduleKey === "emu" && scope.scopeType === "emu_section")
          .map((scope) => scope.scopeId);
        setSelectedSectionIds(nextSectionIds);
        setBaselineSectionIds(nextSectionIds);
      }
    } finally {
      setSavingScopes(false);
    }
  }

  return (
    <aside className="site-user-access-panel">
      <div className="site-user-access-header">
        <div className="site-user-access-identity">
          <span>{getInitials(user.fullName || user.login)}</span>
          <div>
            <h3>{user.fullName || user.login}</h3>
            <p>{user.login} · {user.role}</p>
          </div>
        </div>
        <div className="site-user-access-header-actions">
          <span className={`site-user-status-pill ${user.status === "Активен" ? "is-active" : "is-blocked"}`}>{user.status}</span>
          <button className="button ghost small" onClick={() => onOpenProfile?.(user)} type="button">Профиль</button>
        </div>
      </div>

      <div className="site-user-role-source">
        <div>
          <span>Базовая роль</span>
          <select
            aria-label="Базовая роль пользователя"
            disabled={!canManage || savingRole || !onChangeRole}
            onChange={(event) => setRoleDraft(event.target.value as SiteUser["role"])}
            value={roleDraft}
          >
            {(["Оператор", "Оператор ЭМУ", "Руководитель", "Аудитор", "Администратор"] as SiteUser["role"][]).map((role) => <option key={role}>{role}</option>)}
          </select>
        </div>
        {roleDirty ? (
          <div className="site-user-role-source-actions">
            <button className="button ghost small" disabled={savingRole} onClick={() => setRoleDraft(user.role)} type="button">
              Отменить
            </button>
            <button className="button primary small" disabled={savingRole} onClick={saveRole} type="button">
              {savingRole ? "Сохраняем..." : "Применить"}
            </button>
          </div>
        ) : (
          <button className="button ghost small" onClick={() => onOpenProfile?.(user)} type="button">
            Профиль
          </button>
        )}
      </div>

      <div className="site-user-access-tabs" role="tablist">
        {accessTabs.map((tab) => (
          <button
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? "active" : ""}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "permissions" ? (
        <section className="site-user-access-card">
          <div className="site-user-access-card-title site-user-sticky-actions">
            <div>
              <h4>Индивидуальные права</h4>
              <p>{directPermissions.length} прямых · {effective.size} итоговых с ролью{permissionsDirty ? " · есть изменения" : ""}</p>
            </div>
            <div className="site-user-inline-actions">
              {permissionsDirty ? (
                <button className="button ghost small" disabled={savingPermissions} onClick={() => setDirectPermissions(baselineDirectPermissions)} type="button">
                  Отменить
                </button>
              ) : null}
              <button className="button primary small" disabled={!canManage || loading || savingPermissions || !permissionsDirty} onClick={savePermissions} type="button">
                {savingPermissions ? "Сохраняем..." : "Сохранить"}
              </button>
            </div>
          </div>
          <div className="site-user-permission-presets">
            <div className="site-user-permission-presets-head">
              <div>
                <strong>Быстрые наборы</strong>
                <span>Добавляют персональные права поверх базовой роли.</span>
              </div>
              <small>Их можно изменить вручную ниже</small>
            </div>
            <div className="site-user-permission-preset-grid">
              {permissionPresets.map((preset) => (
                <button
                  className="site-user-permission-preset"
                  disabled={!canManage || loading || savingPermissions}
                  key={preset.id}
                  onClick={() => {
                    applyPermissionPreset(preset.codes);
                    onNotify(`Набор «${preset.label}» добавлен в персональные права`);
                  }}
                  type="button"
                >
                  <b>{preset.label}</b>
                  <span>{preset.description}</span>
                  <em>Добавить</em>
                </button>
              ))}
            </div>
          </div>
          <div className="site-user-permission-toolbar">
            <input
              aria-label="Поиск права или модуля"
              className="site-user-scope-search"
              onChange={(event) => setPermissionSearch(event.target.value)}
              placeholder="Поиск права или модуля"
              value={permissionSearch}
            />
            <select
              aria-label="Фильтр по типу разрешения"
              value={permissionFilter}
              onChange={(event) => setPermissionFilter(event.target.value as PermissionFilter)}
            >
              <option value="all">Все типы</option>
              {categoryOrder.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </div>
          <div className="site-user-module-summary">
            {moduleSummaries.map((item) => (
              <span key={item.module}>
                <b>{item.module}</b>
                {item.effective}/{item.total}
                {item.direct > 0 ? <em>{item.direct} вручную</em> : null}
              </span>
            ))}
          </div>
          <div className="site-user-permissions-list">
            {filteredPermissionGroups.map((group) => (
              <details className="site-user-permission-module" key={group.module} open={permissionSearch.trim().length > 0 || permissionFilter !== "all"}>
                <summary>
                  <strong>{group.module}</strong>
                  <small>{group.description}</small>
                  <em>{group.items.filter((item) => effective.has(item.code)).length}/{group.items.length}</em>
                </summary>
                <div className="site-user-permission-module-actions">
                  <span>{group.items.filter((item) => direct.has(item.code)).length} личных прав в модуле</span>
                  <button disabled={!canManage || loading || savingPermissions} onClick={() => addModulePermissions(group.items.map((item) => item.code))} type="button">
                    Выдать модуль
                  </button>
                  <button disabled={!canManage || loading || savingPermissions} onClick={() => clearModulePermissions(group.items.map((item) => item.code))} type="button">
                    Очистить личные
                  </button>
                </div>
                {categoryOrder.map((category) => {
                  const items = group.items.filter((item) => item.category === category);
                  if (items.length === 0) return null;

                  return (
                    <div className="site-user-permission-category" key={category}>
                      <span>{category}<em>{items.filter((item) => effective.has(item.code)).length}/{items.length}</em></span>
                      {items.map((permission) => (
                        <label className="site-user-permission-row" key={permission.code}>
                          <input
                            checked={direct.has(permission.code)}
                            disabled={!canManage}
                            onChange={() => togglePermission(permission.code)}
                            type="checkbox"
                          />
                          <span>
                            <b>{permission.label}</b>
                            <small>{permission.code}</small>
                          </span>
                          {effective.has(permission.code) && !direct.has(permission.code) ? <em>роль</em> : null}
                        </label>
                      ))}
                    </div>
                  );
                })}
              </details>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === "scopes" ? (
        <section className="site-user-access-card">
          <div className="site-user-access-card-title site-user-sticky-actions">
            <div>
              <h4>Участки ЭМУ</h4>
              <p>
                {hasFullEmuScope ? "У пользователя есть полный доступ к участкам." : "Если участки не выбраны, пользователь увидит пустой список ЭМУ."}
                {" Выбрано "}
                {selectedSectionIds.length}
                {" из "}
                {sections.filter((section) => section.isActive).length}
                {"."}
                {scopesDirty ? " Есть изменения." : ""}
              </p>
            </div>
            <div className="site-user-inline-actions">
              {scopesDirty ? (
                <button className="button ghost small" disabled={savingScopes} onClick={() => setSelectedSectionIds(baselineSectionIds)} type="button">
                  Отменить
                </button>
              ) : null}
              <button className="button primary small" disabled={!canManage || loading || savingScopes || !scopesDirty} onClick={saveScopes} type="button">
                {savingScopes ? "Сохраняем..." : "Сохранить"}
              </button>
            </div>
          </div>
          {needsSectionScope ? (
            <div className="notice warning-soft">
              <strong>Нужно назначить участки</strong>
              <span>Оператор ЭМУ с режимом “только выбранные” не должен оставаться без закрепленных участков.</span>
            </div>
          ) : null}
          <div className="site-user-scope-mode">
            <button className="active" disabled={!canManage || loading || savingScopes || sectionsStatus === "loading"} onClick={() => setSelectedSectionIds(sections.filter((section) => section.isActive).map((section) => section.id))} type="button">
              Выбрать все
            </button>
            <button disabled={!canManage || loading || savingScopes || sectionsStatus === "loading"} onClick={() => setSelectedSectionIds([])} type="button">
              Очистить
            </button>
          </div>
          <input
            className="site-user-scope-search"
            onChange={(event) => setSectionSearch(event.target.value)}
            placeholder="Поиск участка"
            value={sectionSearch}
          />
          {selectedSectionIds.length > 0 ? (
            <div className="site-user-scope-chips">
              {sections
                .filter((section) => selectedSections.has(section.id))
                .map((section) => <span key={section.id}>{section.name}</span>)}
            </div>
          ) : null}
          <div className="site-user-scope-list">
            {activeSections.length === 0 ? (
              <div className="site-user-muted site-user-scope-empty">
                <p>{sectionsStatus === "loading" ? "Загружаем участки..." : sectionsStatus === "error" ? "Участки не загрузились." : "Участки не найдены по текущему поиску."}</p>
                {sectionsStatus === "error" ? (
                  <button className="button ghost small" onClick={() => setSectionLoadToken((current) => current + 1)} type="button">
                    Повторить
                  </button>
                ) : null}
              </div>
            ) : (
              activeSections.map((section) => (
                <label className="site-user-scope-row" key={section.id}>
                  <input
                    checked={selectedSections.has(section.id)}
                    disabled={!canManage}
                    onChange={() => toggleSection(section.id)}
                    type="checkbox"
                  />
                  <span>{section.name}</span>
                </label>
              ))
            )}
          </div>
        </section>
      ) : null}

      {activeTab === "audit" ? (
        <section className="site-user-access-card">
          <div className="site-user-access-card-title">
            <h4>Аудит</h4>
          </div>
          <div className="site-user-audit-list">
            <span><b>Создание учетной записи</b>{user.createdAt}</span>
            <span><b>Последняя активность</b>{user.lastLogin}</span>
            <span><b>Изменения прав</b>Журнал будет подключен отдельным этапом</span>
          </div>
        </section>
      ) : null}
    </aside>
  );
}

function getInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "П";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}
