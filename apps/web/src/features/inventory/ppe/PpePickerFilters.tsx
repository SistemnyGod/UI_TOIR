import { Search } from "lucide-react";

export type PpePickerCategoryOption = {
  count: number;
  id: string;
  name: string;
};

export function PpePickerFilters({
  categoryId,
  categoryOptions,
  onCategoryChange,
  onQueryChange,
  query,
}: {
  categoryId: string;
  categoryOptions: PpePickerCategoryOption[];
  onCategoryChange: (categoryId: string) => void;
  onQueryChange: (query: string) => void;
  query: string;
}) {
  return (
    <div className="inventory-ppe-picker-filters">
      <label className="inventory-ppe-search">
        <Search size={17} />
        <input
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Название, артикул, категория, набор"
          value={query}
        />
      </label>
      <select value={categoryId} onChange={(event) => onCategoryChange(event.target.value)}>
        <option value="">Все категории</option>
        {categoryOptions.map((row) => (
          <option key={row.id} value={row.id}>
            {row.name} ({row.count})
          </option>
        ))}
      </select>
    </div>
  );
}
