import { INVENTORY_PPE_DEFAULT_NORM_TEXT } from "./inventoryPpeConfig";
import { formatDate, ReadOnlyField } from "./ppeCommon";

type CardParamsStepProps = {
  comment: string;
  linesCount: number;
  onCommentChange: (comment: string) => void;
};

export function CardParamsStep({ comment, linesCount, onCommentChange }: CardParamsStepProps) {
  return (
    <section className="inventory-ppe-wizard-panel">
      <h3>Параметры карточки</h3>
      <div className="inventory-ppe-form-grid">
        <label className="inventory-ppe-field is-wide">
          <span>Основание выдачи</span>
          <textarea
            onChange={(event) => onCommentChange(event.target.value)}
            placeholder={INVENTORY_PPE_DEFAULT_NORM_TEXT}
            value={comment}
          />
        </label>
        <ReadOnlyField label="Дата оформления" value={formatDate(new Date().toISOString(), "date")} />
        <ReadOnlyField label="Строк в карточке" value={String(linesCount)} />
      </div>
    </section>
  );
}
