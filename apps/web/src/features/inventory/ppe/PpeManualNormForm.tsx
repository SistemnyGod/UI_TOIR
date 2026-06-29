import type { InventoryItemDto } from "../../../api/contracts";
import type { ManualNormDraft, StoredManualNorm } from "./ppeWizardDomain";

export function PpeManualNormForm({
  draft,
  items,
  manualNorms,
  onAdd,
  onDraftChange,
}: {
  draft: ManualNormDraft;
  items: InventoryItemDto[];
  manualNorms: StoredManualNorm[];
  onAdd: () => void;
  onDraftChange: (patch: Partial<ManualNormDraft>) => void;
}) {
  return (
    <div className="inventory-ppe-reference-list">
      {manualNorms.length ? (
        <div className="inventory-ppe-reference-meta">
          {manualNorms.map((row) => (
            <button
              className="inventory-ppe-reference-chip"
              key={`${row.normName}-${row.normPoint}`}
              onClick={() =>
                onDraftChange({
                  issuePeriodText: row.issuePeriodText,
                  normName: row.normName,
                  normPoint: row.normPoint,
                  quantityText: row.quantityText,
                })
              }
              type="button"
            >
              {row.normName}
            </button>
          ))}
        </div>
      ) : null}
      <article className="inventory-ppe-reference-card">
        <div className="inventory-ppe-reference-card-head">
          <div>
            <strong>Ручная строка нормы</strong>
            <span>Используйте, если нормы по должности еще нет в справочнике.</span>
          </div>
          <button className="button primary" disabled={!draft.normName.trim() || !draft.normPoint.trim() || !draft.catalogItemId} onClick={onAdd} type="button">
            Добавить норму
          </button>
        </div>
        <div className="inventory-ppe-lines-wrap">
          <table className="inventory-ppe-lines-table">
            <tbody>
              <tr>
                <td>
                  <input
                    aria-label="Полное нормативное наименование СИЗ"
                    onChange={(event) => onDraftChange({ normName: event.target.value })}
                    placeholder="Каска защитная от механических воздействий"
                    value={draft.normName}
                  />
                  <span>Не категория и не краткое название позиции.</span>
                </td>
                <td>
                  <input
                    aria-label="Пункт нормы"
                    onChange={(event) => onDraftChange({ normPoint: event.target.value })}
                    placeholder="п. 1.3.1 Приложения № 2"
                    value={draft.normPoint}
                  />
                </td>
                <td>
                  <input
                    aria-label="Периодичность выдачи"
                    list="ppe-issue-period-options"
                    onChange={(event) => onDraftChange({ issuePeriodText: event.target.value })}
                    value={draft.issuePeriodText}
                  />
                </td>
              </tr>
              <tr>
                <td>
                  <select
                    aria-label="Номенклатура"
                    onChange={(event) => {
                      const item = items.find((row) => row.id === event.target.value);
                      onDraftChange({
                        brandModelArticle: item ? buildModelDescription(item) : draft.brandModelArticle,
                        catalogItemId: event.target.value,
                      });
                    }}
                    value={draft.catalogItemId}
                  >
                    <option value="">Выберите номенклатуру</option>
                    {items.slice(0, 100).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    aria-label="Модель, марка или артикул"
                    list="ppe-model-suggestions"
                    onChange={(event) => onDraftChange({ brandModelArticle: event.target.value })}
                    placeholder="СОМЗ, Форвард, Эксперт К3, SIM-06/K"
                    value={draft.brandModelArticle}
                  />
                </td>
                <td>
                  <input
                    aria-label="Количество по норме"
                    onChange={(event) => onDraftChange({ quantityText: event.target.value })}
                    value={draft.quantityText}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </div>
  );
}

function buildModelDescription(item: InventoryItemDto) {
  return [item.brandName, item.modelName, item.article, item.protectionClass].filter(Boolean).join(", ");
}
