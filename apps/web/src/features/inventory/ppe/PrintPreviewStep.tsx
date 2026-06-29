import { formatDate, ReadOnlyField } from "./ppeCommon";
import { PrintPaper } from "./ppePrint";
import type { PrintData, PrintMode } from "./ppeTypes";

type PrintPreviewStepProps = {
  mode: PrintMode;
  onModeChange: (mode: PrintMode) => void;
  onPreview: (mode: PrintMode) => void;
  onPrint: (mode: PrintMode) => void;
  printData: PrintData;
};

export function PrintPreviewStep({
  mode,
  onModeChange,
  onPreview,
  onPrint,
  printData,
}: PrintPreviewStepProps) {
  return (
    <section className="inventory-ppe-wizard-panel">
      <h3>Печать и предпросмотр</h3>
      <div className="inventory-ppe-wizard-summary">
        <ReadOnlyField label="Сотрудник" value={printData.employeeName} />
        <ReadOnlyField label="Должность" value={printData.position || "Не указана"} />
        <ReadOnlyField label="Строки" value={String(printData.lines.length)} />
        <ReadOnlyField label="Дата" value={formatDate(new Date().toISOString(), "date")} />
      </div>
      <div className="inventory-ppe-panel-actions">
        <div className="inventory-ppe-print-tabs" role="tablist" aria-label="Предпросмотр формы">
          <button className={mode === "card" ? "is-active" : ""} onClick={() => onModeChange("card")} type="button">
            Личная карточка
          </button>
          <button className={mode === "sheet" ? "is-active" : ""} onClick={() => onModeChange("sheet")} type="button">
            Лист подписи
          </button>
        </div>
        <button className="button ghost" onClick={() => onPreview(mode)} type="button">
          Открыть крупно
        </button>
        <button className="button ghost" onClick={() => onPrint("card")} type="button">
          Печать карточки
        </button>
        <button className="button ghost" onClick={() => onPrint("sheet")} type="button">
          Печать листа
        </button>
      </div>
      <PrintPaper data={printData} mode={mode} />
    </section>
  );
}
