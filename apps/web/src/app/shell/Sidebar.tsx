import { useEffect, useMemo, useState } from "react";
import type { SessionUserDto } from "../../api/contracts";
import { hasPermission, type PermissionCode } from "../../security/permissions";
import type { ScreenConfig, ScreenId } from "../../types";
import { NavIcon } from "./NavIcon";

type NavigationModuleId = "patrol" | "accounting" | "emu";

const accountingFlyoutGroups = [
  { title: "Рабочие места", ids: ["inventory-overview", "inventory-employees", "inventory-items", "inventory-issue", "inventory-operations"] },
  { title: "Ответственность", ids: ["inventory-custody", "inventory-ppe", "inventory-history"] },
  { title: "Администрирование", ids: ["inventory-reports", "inventory-users", "inventory-settings", "inventory-system-log"] },
] satisfies Array<{ title: string; ids: string[] }>;

const emuFlyoutIds = ["emu-dashboard", "emu-work-accounting", "emu-completed-work-history"];
const patrolScreenIds: ScreenId[] = ["dashboard", "results", "assign", "employees", "schedule", "accounts", "routes"];

const moduleCopy: Record<NavigationModuleId, { title: string; description: string }> = {
  patrol: {
    title: "Обход",
    description: "Планирование, маршруты, заявки и мобильные аккаунты",
  },
  accounting: {
    title: "Бухгалтерия",
    description: "Сотрудники, СИЗ, под запись, выдача и отчеты",
  },
  emu: {
    title: "ЭМУ",
    description: "Работы, паузы, завершение и история",
  },
};

export function Sidebar({
  screen,
  screens,
  currentUser,
  sidebarCollapsed,
  onNavigate,
  onToggleCollapsed,
}: {
  screen: ScreenId;
  screens: ScreenConfig[];
  currentUser: SessionUserDto | null;
  sidebarCollapsed: boolean;
  onNavigate: (screen: ScreenId) => void;
  onToggleCollapsed: () => void;
}) {
  const [openModule, setOpenModule] = useState<NavigationModuleId | null>(null);
  const patrolScreens = useMemo(() => {
    const byId = new Map(screens.map((item) => [item.id, item]));
    return patrolScreenIds.map((id) => byId.get(id)).filter((item): item is ScreenConfig => Boolean(item));
  }, [screens]);
  const accountingScreens = useMemo(() => {
    const seen = new Set<string>();
    return screens.filter((item) => {
      if (!isInventoryScreen(item.id) || seen.has(item.id) || item.id === "inventory-ppe-history" || item.id === "inventory-ppe-create") {
        return false;
      }

      seen.add(item.id);
      return true;
    });
  }, [screens]);
  const usersScreen = useMemo(() => screens.find((item) => item.id === "users"), [screens]);
  const percoScreen = useMemo(() => screens.find((item) => item.id === "perco-integration"), [screens]);
  const emuScreens = useMemo(
    () => screens.filter((item) => isEmuScreen(item.id) && canViewEmuScreen(currentUser, item.id)),
    [currentUser, screens],
  );
  const patrolIsActive = patrolScreens.some((item) => item.id === screen);
  const accountingIsActive = accountingScreens.some((item) => item.id === screen);
  const emuIsActive = emuScreens.some((item) => item.id === screen);

  useEffect(() => {
    const activeModule = getModuleForScreen(screen);
    if (!activeModule) {
      return;
    }

    setOpenModule((current) => (current === activeModule ? current : activeModule));
  }, [screen]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenModule(null);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function toggleModule(moduleId: NavigationModuleId) {
    setOpenModule((current) => (current === moduleId ? null : moduleId));
  }

  function navigateFromModule(nextScreen: ScreenId) {
    onNavigate(nextScreen);
  }

  function renderSubmenuItem(item: ScreenConfig, moduleId: NavigationModuleId, isModuleOpen = true) {
    return (
      <button
        className={`sidebar-submenu-item ${screen === item.id ? "active" : ""}`}
        key={item.id}
        onClick={() => navigateFromModule(item.id)}
        tabIndex={isModuleOpen ? 0 : -1}
        type="button"
      >
        <span className="nav-icon">
          {moduleId === "accounting" ? <AccountingIcon sectionId={item.id} /> : <NavIcon screen={item.id} />}
        </span>
        <span>
          <strong>{getScreenLabel(item)}</strong>
          <small>{getScreenHint(item)}</small>
        </span>
      </button>
    );
  }

  function renderModule(moduleId: NavigationModuleId, items: ScreenConfig[], active: boolean) {
    const isOpen = openModule === moduleId;
    const copy = moduleCopy[moduleId];

    return (
      <div className={`module-nav ${isOpen ? "is-open" : ""}`} key={moduleId}>
        <button
          aria-controls={`${moduleId}-module-menu`}
          aria-expanded={isOpen}
          className={`nav-item module-trigger ${active ? "active" : ""} ${isOpen ? "open" : ""}`}
          onClick={() => toggleModule(moduleId)}
          type="button"
        >
          <span className="nav-item-main">
            <span className="nav-icon">
              <ModuleIcon moduleId={moduleId} />
            </span>
            <span className="nav-item-label">{copy.title}</span>
          </span>
          <span className="nav-chevron" aria-hidden="true">
            ⌄
          </span>
        </button>

        {isOpen ? (
          <section className="sidebar-submenu" id={`${moduleId}-module-menu`} aria-label={`Разделы модуля ${copy.title}`}>
            <header>
              <strong>{copy.title}</strong>
              <span>{copy.description}</span>
            </header>
            <div className="sidebar-submenu-list">
              {items.length > 0 ? items.map((item) => renderSubmenuItem(item, moduleId)) : <EmptySubmenu title={copy.title} />}
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark brand-mark-am" aria-hidden="true">
          AM
        </div>
        <div>
          <strong>ATOM</strong>
          <span>MINERALS</span>
        </div>
      </div>

      <nav className="nav-list" aria-label="Основные разделы">
        {renderModule("patrol", patrolScreens, patrolIsActive)}
        {renderModule(
          "accounting",
          accountingFlyoutGroups
            .flatMap((group) => group.ids)
            .map((id) => accountingScreens.find((screenItem) => screenItem.id === id))
            .filter((item): item is ScreenConfig => Boolean(item)),
          accountingIsActive,
        )}
        {renderModule(
          "emu",
          emuFlyoutIds
            .map((id) => emuScreens.find((screenItem) => screenItem.id === id))
            .filter((item): item is ScreenConfig => Boolean(item)),
          emuIsActive,
        )}

        {usersScreen ? (
          <>
            <div className="sidebar-section-label">Настройки</div>
            <button
              className={`nav-item ${screen === usersScreen.id ? "active" : ""}`}
              onClick={() => {
                onNavigate(usersScreen.id);
                setOpenModule(null);
              }}
              type="button"
            >
              <span className="nav-icon">
                <NavIcon screen={usersScreen.id} />
              </span>
              <span className="nav-item-label">{getScreenLabel(usersScreen)}</span>
            </button>
            {percoScreen && hasPermission(currentUser, "integrations.perco.view") ? (
              <button
                className={`nav-item ${screen === percoScreen.id ? "active" : ""}`}
                onClick={() => {
                  onNavigate(percoScreen.id);
                  setOpenModule(null);
                }}
                type="button"
              >
                <span className="nav-icon">
                  <NavIcon screen={percoScreen.id} />
                </span>
                <span className="nav-item-label">{getScreenLabel(percoScreen)}</span>
              </button>
            ) : null}
          </>
        ) : null}
      </nav>

      <div className="sidebar-footer">
        <button className="collapse-button" onClick={onToggleCollapsed} type="button">
          {sidebarCollapsed ? "› Развернуть меню" : "‹ Свернуть меню"}
        </button>
      </div>
    </aside>
  );
}

function AccountingIcon({ sectionId }: { sectionId: string }) {
  return (
    <svg className="nav-svg" viewBox="0 0 24 24" aria-hidden="true">
      {sectionId === "inventory-overview" ? (
        <>
          <path d="M5 19V9" />
          <path d="M12 19V5" />
          <path d="M19 19v-7" />
          <path d="M4 19h16" />
        </>
      ) : null}
      {sectionId === "inventory-employees" ? (
        <>
          <circle cx="9" cy="8" r="3" />
          <path d="M4.5 19c.7-3.2 2.2-5 4.5-5s3.8 1.8 4.5 5" />
          <path d="M16 7h4" />
          <path d="M16 11h4" />
          <path d="M16 15h3" />
        </>
      ) : null}
      {sectionId === "inventory-items" ? (
        <>
          <rect x="5" y="5" width="6" height="6" rx="1.4" />
          <rect x="13" y="5" width="6" height="6" rx="1.4" />
          <rect x="5" y="13" width="6" height="6" rx="1.4" />
          <rect x="13" y="13" width="6" height="6" rx="1.4" />
        </>
      ) : null}
      {sectionId === "inventory-issue" ? (
        <>
          <path d="M5 7h10" />
          <path d="M5 12h9" />
          <path d="M5 17h6" />
          <path d="M16 14l3 3 3-3" />
          <path d="M19 7v10" />
        </>
      ) : null}
      {sectionId === "inventory-operations" ? (
        <>
          <path d="M7 7h10" />
          <path d="M7 17h10" />
          <path d="M16 4l3 3-3 3" />
          <path d="M8 14l-3 3 3 3" />
        </>
      ) : null}
      {sectionId === "inventory-custody" ? (
        <>
          <rect x="5" y="4" width="14" height="16" rx="2" />
          <path d="M8 8h8" />
          <path d="M8 12h8" />
          <path d="M8 16h5" />
        </>
      ) : null}
      {sectionId === "inventory-ppe" ? (
        <>
          <path d="M7 8l5-4 5 4v5c0 3.5-2 5.8-5 7-3-1.2-5-3.5-5-7V8Z" />
          <path d="M10 12h4" />
          <path d="M12 10v4" />
        </>
      ) : null}
      {sectionId === "inventory-reports" ? (
        <>
          <path d="M6 4h9l3 3v13H6z" />
          <path d="M14 4v4h4" />
          <path d="M9 13h6" />
          <path d="M9 17h4" />
        </>
      ) : null}
      {sectionId === "inventory-history" ? (
        <>
          <path d="M12 8v5l3 2" />
          <path d="M5 5v5h5" />
          <path d="M5.5 10a7 7 0 1 0 2-4.8" />
        </>
      ) : null}
      {sectionId === "inventory-users" ? (
        <>
          <circle cx="8" cy="8" r="3" />
          <path d="M3.5 19c.6-3.2 2.1-5 4.5-5s3.9 1.8 4.5 5" />
          <path d="M16 10l2 2 3-4" />
          <path d="M16 16h5" />
        </>
      ) : null}
      {sectionId === "inventory-settings" ? (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 4v2" />
          <path d="M12 18v2" />
          <path d="M4 12h2" />
          <path d="M18 12h2" />
          <path d="m6.5 6.5 1.4 1.4" />
          <path d="m16.1 16.1 1.4 1.4" />
          <path d="m17.5 6.5-1.4 1.4" />
          <path d="m7.9 16.1-1.4 1.4" />
        </>
      ) : null}
      {sectionId === "inventory-system-log" ? (
        <>
          <rect x="5" y="4" width="14" height="16" rx="2" />
          <path d="M9 8h6" />
          <path d="M9 12h6" />
          <path d="M9 16h3" />
          <circle cx="17" cy="16" r="1" />
        </>
      ) : null}
    </svg>
  );
}

function EmptySubmenu({ title }: { title: string }) {
  return (
    <div className="sidebar-submenu-empty">
      <strong>{title}</strong>
      <span>Нет доступных разделов для текущих прав.</span>
    </div>
  );
}

function getModuleForScreen(screenId: ScreenId): NavigationModuleId | null {
  if (isInventoryScreen(screenId)) {
    return "accounting";
  }

  if (isEmuScreen(screenId)) {
    return "emu";
  }

  if (patrolScreenIds.includes(screenId)) {
    return "patrol";
  }

  return null;
}

function isInventoryScreen(screenId: ScreenId) {
  return screenId.startsWith("inventory-");
}

function isEmuScreen(screenId: ScreenId) {
  return screenId.startsWith("emu-");
}

function isIntegrationScreen(screenId: ScreenId) {
  return screenId === "perco-integration";
}

function canViewEmuScreen(user: SessionUserDto | null, screenId: ScreenId) {
  const permissionByScreen: Partial<Record<ScreenId, PermissionCode>> = {
    "emu-dashboard": "emu.dashboard.view",
    "emu-work-accounting": "emu.work-accounting.view",
    "emu-completed-work-history": "emu.history.view",
  };
  const permission = permissionByScreen[screenId];
  return permission ? hasPermission(user, permission) : true;
}

function ModuleIcon({ moduleId }: { moduleId: NavigationModuleId }) {
  return (
    <svg className="nav-svg" viewBox="0 0 24 24" aria-hidden="true">
      {moduleId === "patrol" ? (
        <>
          <path d="M5 6.5h7" />
          <path d="M5 12h14" />
          <path d="M5 17.5h7" />
          <circle cx="17" cy="6.5" r="2.2" />
          <circle cx="17" cy="17.5" r="2.2" />
        </>
      ) : moduleId === "emu" ? (
        <>
          <path d="M5 18h14" />
          <path d="M7 18V8l5-3 5 3v10" />
          <path d="M9 12h6" />
          <path d="M9 15h6" />
          <circle cx="12" cy="8" r="1" />
        </>
      ) : (
        <>
          <rect x="5" y="4" width="14" height="16" rx="2" />
          <path d="M8 8h8" />
          <path d="M8 12h2" />
          <path d="M12 12h2" />
          <path d="M16 12h0.01" />
          <path d="M8 16h2" />
          <path d="M12 16h2" />
          <path d="M16 16h0.01" />
        </>
      )}
    </svg>
  );
}

function getScreenLabel(item: ScreenConfig) {
  const inventoryLabels: Partial<Record<ScreenId, string>> = {
    "emu-dashboard": "Дашборд",
    "emu-work-accounting": "Учет работ",
    "emu-completed-work-history": "История выполненных работ",
    "inventory-overview": "Обзор учета",
    "inventory-employees": "Сотрудники учета",
    "inventory-items": "Номенклатура",
    "inventory-issue": "Выдача",
    "inventory-operations": "Возврат и списание",
    "inventory-custody": "Под запись",
    "inventory-ppe": "СИЗ",
    "inventory-history": "История",
    "inventory-reports": "Отчеты учета",
    "inventory-users": "Права Inventory",
    "inventory-settings": "Настройки учета",
    "inventory-system-log": "Системный журнал",
    "perco-integration": "PERCo-Web",
  };
  if (inventoryLabels[item.id]) {
    return inventoryLabels[item.id];
  }

  const labels: Partial<Record<ScreenId, string>> = {
    accounts: "Мобильные аккаунты",
    assign: "Назначения",
    dashboard: "Дашборд",
    employees: "Сотрудники",
    results: "Результаты обходов",
    routes: "Маршруты и точки",
    schedule: "Плановый обход",
    users: "Управление пользователями",
    "perco-integration": "PERCo-Web",
    "emu-dashboard": "Дашборд",
    "emu-work-accounting": "Учет работ",
    "emu-completed-work-history": "История выполненных работ",
    "inventory-overview": "Обзор учета",
    "inventory-employees": "Сотрудники учета",
    "inventory-items": "Номенклатура",
    "inventory-issue": "Выдача",
    "inventory-operations": "Возврат и списание",
    "inventory-custody": "Под запись",
    "inventory-ppe": "СИЗ",
    "inventory-reports": "Отчеты учета",
    "inventory-settings": "Настройки учета",
  };

  return labels[item.id] ?? item.label;
}

function getScreenHint(item: ScreenConfig) {
  const hints: Partial<Record<ScreenId, string>> = {
    accounts: "мобильный вход",
    assign: "сейчас",
    dashboard: "сводка смены",
    employees: "учет и смены",
    results: "обходы и проблемы",
    routes: "точки и NFC",
    schedule: "день / ночь",
    "emu-dashboard": "оперативная сводка",
    "emu-work-accounting": "приход, пауза, завершение",
    "emu-completed-work-history": "время и аудит",
    "inventory-overview": "выдачи и действия",
    "inventory-employees": "импорт и справочник",
    "inventory-items": "каталог позиций",
    "inventory-issue": "выдача сотрудникам",
    "inventory-operations": "возврат и списание",
    "inventory-custody": "материалы под запись",
    "inventory-ppe": "карточки и печать",
    "inventory-history": "операции и аудит",
    "inventory-reports": "аналитика и выгрузки",
    "inventory-users": "права доступа",
    "inventory-settings": "справочники",
    "inventory-system-log": "события системы",
  };

  return hints[item.id] ?? item.hint;
}
