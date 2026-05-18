import type { ScreenConfig, ScreenId } from "../types";
import { ChromeIcon } from "./ChromeIcon";
import { NavIcon } from "./NavIcon";

export function Sidebar({
  screen,
  screens,
  sidebarCollapsed,
  onNavigate,
  onToggleCollapsed,
}: {
  screen: ScreenId;
  screens: ScreenConfig[];
  sidebarCollapsed: boolean;
  onNavigate: (screen: ScreenId) => void;
  onToggleCollapsed: () => void;
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <ChromeIcon name="shield" />
        </div>
        <div>
          <strong>Патруль 360</strong>
          <span>Территориальные обходы</span>
        </div>
      </div>
      <nav className="nav-list" aria-label="Основные разделы">
        {screens.map((item) => (
          <button
            className={`nav-item ${screen === item.id ? "active" : ""}`}
            key={item.id}
            onClick={() => onNavigate(item.id)}
            type="button"
          >
            <span className="nav-icon">
              <NavIcon screen={item.id} />
            </span>
            {item.label}
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <button className="collapse-button" onClick={onToggleCollapsed} type="button">
          {sidebarCollapsed ? "› Развернуть меню" : "‹ Свернуть меню"}
        </button>
        <div className="sidebar-version">
          <ChromeIcon name="shield" />
          <div>
            <strong>Патруль 360</strong>
            <small>v2.0.0</small>
          </div>
        </div>
      </div>
    </aside>
  );
}
