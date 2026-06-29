import { useEffect, useMemo, useRef, useState } from "react";
import type { SessionUserDto } from "../../api/contracts";
import { ChromeIcon } from "./ChromeIcon";

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
}: {
  currentUser: SessionUserDto | null;
  notifications?: TopbarNotification[];
  searchQuery: string;
  onLogout: () => void;
  onRunSearch: (query: string) => void;
  onSearchQueryChange: (query: string) => void;
  onNotify: (message: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(() => readNotificationIds());
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
    safeLocalStorage()?.setItem("patrol360.notifications.read", JSON.stringify([...next]));
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
        <span className="avatar mini">{getInitial(currentUser?.displayName ?? currentUser?.login)}</span>
        <div className="user-copy">
          <strong>{currentUser?.displayName ?? "Пользователь панели"}</strong>
          <small>{currentUser?.roles[0] ?? "Оператор"}</small>
        </div>
        <button className="topbar-logout" onClick={onLogout} title="Выйти из аккаунта" type="button">
          <ChromeIcon name="logout" />
        </button>
      </div>
    </header>
  );
}

function getInitial(value?: string) {
  return value?.trim()[0]?.toUpperCase() ?? "П";
}

function readNotificationIds() {
  try {
    const parsed = JSON.parse(safeLocalStorage()?.getItem("patrol360.notifications.read") ?? "[]");
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
