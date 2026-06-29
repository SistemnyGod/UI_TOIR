import { Plus } from "lucide-react";

export function PpePickerFooterActions({
  canAdd,
  onAdd,
  onClose,
}: {
  canAdd: boolean;
  onAdd: () => void;
  onClose: () => void;
}) {
  return (
    <footer className="inventory-ppe-picker-actions">
      <button className="button ghost" onClick={onClose} type="button">
        Отмена
      </button>
      <button className="button primary" disabled={!canAdd} onClick={onAdd} type="button">
        <Plus size={16} />
        Добавить в карточку
      </button>
    </footer>
  );
}
