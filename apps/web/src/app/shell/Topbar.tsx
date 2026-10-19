import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangePasswordDto, SessionUserDto } from "../../api/contracts";
import { Menu } from "lucide-react";
import { ChromeIcon } from "./ChromeIcon";
import { MobileSearch } from "./MobileSearch";
import { UserAccountPanel } from "./UserAccountPanel";

export interface TopbarNotification {
  id: string;
  title: string;
  message: string;
  time?: string;
  tone?: "info" | "success" | "warning" | "danger";
  onClick?: () => void;
}

export function Topbar({
  currentUser,
  notifications = [],
  searchQuery,
  onLogout,
  onRunSearch,
  onSearchQueryChange,
  onNotify,
  onOpenNavigation,
  mockMode = false,
  onChangePassword,
  passwordError,
  onOpenUserSettings,
}: {
  currentUser: SessionUserDto | null;
  notifications?: TopbarNotification[];
  searchQuery: string;
  onLogout: () => void;
  onRunSearch: (query: string) => void;
  onSearchQueryChange: (query: string) => void;
  onNotify: (message: string) => void;
  onOpenNavigation?: () => void;
  mockMode?: boolean;
  onChangePassword?: (payload: ChangePasswordDto) => Promise<boolean>;
  passwordError?: string;
  onOpenUserSettings?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const notificationStorageKey = `patrol360.notifications.read:${currentUser?.id ?? "anonymous"}`;
  const [readIds, setReadIds] = useState<Set<string>>(() => readNotificationIds(notificationStorageKey));
  const panelRef = useRef<HTMLDivElement>(null);
  const unreadNotifications = useMemo(() => notifications.filter((item) => !readIds.has(item.id)), [notifications, readIds]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!panelRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function persistReadIds(next: Set<string>) {
    setReadIds(next);
    try { safeLocalStorage()?.setItem(notificationStorageKey, JSON.stringify([...next])); } catch { /* Read state remains available for this session. */ }
  }

  function toggleNotifications() {
    setIsOpen((value) => !value);
  }

  function openNotification(notification: TopbarNotification) {
    persistReadIds(new Set(readIds).add(notification.id));
    notification.onClick?.();
    setIsOpen(false);
  }

  function markAllRead() {
    persistReadIds(new Set(notifications.map((item) => item.id)));
    onNotify("Уведомления прочитаны");
  }

  return (
    <header className="topbar">
      {onOpenNavigation ? (
        <button aria-label="Открыть навигацию" className="topbar-navigation-toggle" onClick={onOpenNavigation} type="button">
          <Menu aria-hidden="true" size={20} />
        </button>
      ) : null}
      <label className="topbar-search" aria-label="Поиск">
        <ChromeIcon name="search" />
        <input
          onChange={(event) => onSearchQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onRunSearch(event.currentTarget.value);
            }
          }}
          placeholder="Поиск по обходам, маршрутам, сотрудникам..."
          value={searchQuery}
        />
        <kbd>⌘ K</kbd>
      </label>

      <MobileSearch query={searchQuery} onChange={onSearchQueryChange} onSearch={onRunSearch} />

      <div className="topbar-alerts" ref={panelRef}>
        <button
          aria-expanded={isOpen}
          className={`notification-button ${isOpen ? "active" : ""}`}
          onClick={toggleNotifications}
          title="Уведомления"
          type="button"
        >
          <ChromeIcon name="bell" />
          {unreadNotifications.length > 0 ? <b>{unreadNotifications.length}</b> : null}
        </button>

        {isOpen ? (
          <section className="notification-panel" aria-label="Уведомления">
            <header>
              <div>
                <strong>Уведомления</strong>
                <span>{unreadNotifications.length > 0 ? `${unreadNotifications.length} новых` : "новых нет"}</span>
              </div>
              <button disabled={notifications.length === 0 || unreadNotifications.length === 0} onClick={markAllRead} type="button">
                Прочитать все
              </button>
            </header>

            <div className="notification-list">
              {notifications.length > 0 ? (
                notifications.map((notification) => (
                  <button
                    className={`notification-item ${notification.tone ?? "info"} ${readIds.has(notification.id) ? "read" : ""}`}
                    key={notification.id}
                    onClick={() => openNotification(notification)}
                    type="button"
                  >
                    <i />
                    <span>
                      <strong>{notification.title}</strong>
                      <small>{notification.message}</small>
                    </span>
                    {notification.time ? <time>{notification.time}</time> : null}
                  </button>
                ))
              ) : (
                <div className="notification-empty">
                  <strong>Новых уведомлений нет</strong>
                  <span>События по обходам, заявкам и безопасности появятся здесь.</span>
                </div>
              )}
            </div>
          </section>
        ) : null}
      </div>

      <div className="user-pill">
        <UserAccountPanel user={currentUser} mockMode={mockMode} onLogout={onLogout} onChangePassword={onChangePassword} passwordError={passwordError} onOpenSettings={onOpenUserSettings} />
        <button className="topbar-logout" onClick={onLogout} title="Выйти из аккаунта" type="button">
          <ChromeIcon name="logout" />
        </button>
      </div>
    </header>
  );
}

function readNotificationIds(key: string) {
  try {
    const parsed = JSON.parse(safeLocalStorage()?.getItem(key) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function safeLocalStorage() {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
