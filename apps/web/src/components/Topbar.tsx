import { ChromeIcon } from "./ChromeIcon";

export function Topbar({
  searchQuery,
  onRunSearch,
  onSearchQueryChange,
  onNotify,
}: {
  searchQuery: string;
  onRunSearch: (query: string) => void;
  onSearchQueryChange: (query: string) => void;
  onNotify: (message: string) => void;
}) {
  function enableNotifications() {
    localStorage.setItem("patrol360.notifications.enabled", "true");
    onNotify("Уведомления включены");
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
          placeholder="Поиск по маршрутам, точкам, сотрудникам..."
          value={searchQuery}
        />
        <kbd>/</kbd>
      </label>

      <div className="topbar-alerts">
        <button
          className="notification-button"
          onClick={enableNotifications}
          title="Включить уведомления"
          type="button"
        >
          <ChromeIcon name="bell" />
          <b>!</b>
        </button>
      </div>

      <div className="user-pill">
        <span className="avatar mini">П</span>
        <div className="user-copy">
          <strong>Пользователь панели</strong>
          <small>Оператор</small>
        </div>
      </div>
    </header>
  );
}
