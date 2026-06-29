import type { InventoryEmployeeDto, InventoryItemDto, InventorySettingsDto } from "../../../api/contracts";
import { formatQuantity, PpeState, toLineFromNorm } from "./ppeCommon";
import type { PickerLineInput } from "./ppeTypes";

type PositionNorm = InventorySettingsDto["positionNorms"][number];

export function PpePositionNormList({
  employee,
  itemsById,
  norms,
  onAdd,
}: {
  employee: InventoryEmployeeDto | null;
  itemsById: Map<string, InventoryItemDto>;
  norms: PositionNorm[];
  onAdd: (lines: PickerLineInput[]) => void;
}) {
  if (!employee) {
    return <PpeState kind="empty" title="Сотрудник не выбран" text="Сначала выберите сотрудника в мастере карточки." />;
  }

  if (!norms.length) {
    return (
      <PpeState
        kind="empty"
        title="Нормы не заданы"
        text="Для должности сотрудника нет активных норм. Выберите предметы вручную или добавьте ручную норму."
      />
    );
  }

  return (
    <div className="inventory-ppe-reference-list">
      {norms.map((norm) => (
        <article className="inventory-ppe-reference-card" key={norm.id}>
          <div className="inventory-ppe-reference-card-head">
            <div>
              <strong>{norm.itemName}</strong>
              <span>{norm.positionName}</span>
            </div>
            <button className="button ghost" onClick={() => onAdd([toLineFromNorm(norm, itemsById)])} type="button">
              Добавить
            </button>
          </div>
          <div className="inventory-ppe-reference-meta">
            <span className="inventory-ppe-reference-chip">{formatQuantity(norm.quantity)} шт.</span>
            <span className="inventory-ppe-reference-chip">{norm.lifeMonths ?? 12} мес.</span>
          </div>
        </article>
      ))}
    </div>
  );
}
