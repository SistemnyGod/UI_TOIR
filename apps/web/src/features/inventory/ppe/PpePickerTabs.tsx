export type PpePickerTab = "items" | "norms" | "manual" | "sets" | "templates";

const TABS: Array<{ id: PpePickerTab; label: string }> = [
  { id: "items", label: "Предметы" },
  { id: "norms", label: "Норма" },
  { id: "manual", label: "Ручная норма" },
  { id: "sets", label: "Наборы" },
  { id: "templates", label: "Шаблоны" },
];

export function PpePickerTabs({
  activeTab,
  onChange,
}: {
  activeTab: PpePickerTab;
  onChange: (tab: PpePickerTab) => void;
}) {
  return (
    <nav className="inventory-ppe-picker-tabs" aria-label="Источники СИЗ">
      {TABS.map((tab) => (
        <button className={activeTab === tab.id ? "is-active" : ""} key={tab.id} onClick={() => onChange(tab.id)} type="button">
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
