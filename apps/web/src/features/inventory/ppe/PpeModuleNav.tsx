import { ClipboardList, FileClock, Plus } from "lucide-react";
import type { ScreenId } from "../../../types";

export function PpeModuleNav({ active, onNavigate }: { active: ScreenId; onNavigate: (screen: ScreenId) => void }) {
  const items: Array<{ id: ScreenId; label: string; icon: typeof ClipboardList }> = [
    { id: "inventory-ppe", label: "Карточки", icon: ClipboardList },
    { id: "inventory-ppe-history", label: "История", icon: FileClock },
    { id: "inventory-ppe-create", label: "Создать", icon: Plus },
  ];

  return (
    <nav aria-label="Разделы СИЗ" className="ppe-v2-module-nav">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            aria-current={active === item.id ? "page" : undefined}
            className={active === item.id ? "is-active" : ""}
            key={item.id}
            onClick={() => onNavigate(item.id)}
            type="button"
          >
            <Icon aria-hidden="true" size={16} />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
