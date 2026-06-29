import type { ReactNode } from "react";
import { Plus } from "lucide-react";

type IssueChecklistStepProps = {
  hasZeroPrice: boolean;
  linesTable: ReactNode;
  onAddItems: () => void;
};

export function IssueChecklistStep({ hasZeroPrice, linesTable, onAddItems }: IssueChecklistStepProps) {
  return (
    <section className="inventory-ppe-wizard-panel">
      <div className="inventory-ppe-panel-actions">
        <div>
          <h3>Положено по нормам и фактическая выдача</h3>
          <p>Сначала проверьте строку нормы, затем выберите номенклатуру и отдельно укажите модель, марку или артикул.</p>
        </div>
        <button className="button primary" onClick={onAddItems} type="button">
          <Plus size={16} />
          Добавить СИЗ
        </button>
      </div>
      <div className="inventory-ppe-scenario-strip" aria-label="Правильный сценарий выдачи СИЗ">
        <ScenarioStep index="1" title="Норма" text="Полное нормативное наименование, пункт нормы и периодичность." />
        <ScenarioStep index="2" title="Номенклатура" text="Конкретная позиция учета. Она не заменяет норму." />
        <ScenarioStep index="3" title="Модель / марка" text="СОМЗ, Форвард, Эксперт К3, SIM-06/K выводятся отдельно." />
        <ScenarioStep index="4" title="Факт выдачи" text="Дата, количество, цена и статус. В лист подписи попадает только выданное." />
      </div>
      {hasZeroPrice ? (
        <div className="inventory-ppe-inline-warning">
          Есть позиции без цены. Перед печатью и подтверждением выдачи проверьте цену, чтобы сумма в карточке и листе подписи была корректной.
        </div>
      ) : null}
      {linesTable}
    </section>
  );
}

function ScenarioStep({ index, text, title }: { index: string; text: string; title: string }) {
  return (
    <div>
      <span>{index}</span>
      <strong>{title}</strong>
      <small>{text}</small>
    </div>
  );
}
