import { Trash2 } from "lucide-react";
import { PpeIssueLineEditor } from "./PpeIssueLineEditor";
import { PpeState } from "./ppeCommon";
import { itemModelDescription } from "./ppeCommon";
import {
  PPE_ISSUE_PERIOD_OPTIONS,
  PPE_ISSUE_STATUS_OPTIONS,
  isPpeSignatureStatus,
  ppeIssueStatusDescription,
  ppeIssueStatusLabel,
} from "./ppeStatusCatalog";
import type { PpeWizardLine } from "./ppeTypes";
import { isPpeSectionLine, parsePriceText, validatePpeIssueLine } from "./ppeWizardDomain";

export function WizardLinesTable({
  lines,
  onPatchLine,
  onRemoveLine,
}: {
  lines: PpeWizardLine[];
  onPatchLine: (index: number, patch: Partial<PpeWizardLine>) => void;
  onRemoveLine: (index: number) => void;
}) {
  if (!lines.length) {
    return (
      <PpeState
        kind="empty"
        title="Позиции пока не добавлены"
        text="Подтяните нормы должности, выберите набор или добавьте ручную норму. Выдача начинается только после выбора нормативной строки."
      />
    );
  }

  return (
    <div className="inventory-ppe-lines-wrap inventory-ppe-wizard-lines">
      <datalist id="ppe-issue-period-options">
        {PPE_ISSUE_PERIOD_OPTIONS.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <datalist id="ppe-line-model-options">
        {Array.from(new Set(lines.map((line) => line.brandModelArticle || itemModelDescription(line.item)).filter(Boolean))).map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <div className="inventory-ppe-line-cards">
        {lines.map((line, index) => {
          const hasZeroPrice = parsePriceText(line.priceText) === 0;
          const isIssued = isPpeSignatureStatus(line.status);
          const isSection = isPpeSectionLine(line);
          const lineErrors = validatePpeIssueLine(line);
          const statusText = ppeIssueStatusLabel(line.status);
          const modelValue = line.brandModelArticle ?? itemModelDescription(line.item);

          return (
            <PpeIssueLineEditor
              hasErrors={lineErrors.length > 0}
              hasWarning={hasZeroPrice}
              isSectionTitle={isSection}
              key={line.item.id + "-" + index}
              line={line}
            >
              <header className="inventory-ppe-line-card-head">
                <div>
                  <span>{isSection ? "Разделитель нормы" : `Строка выдачи ${index + 1}`}</span>
                  <strong>{line.printItemName || line.item.normItemName || line.item.name}</strong>
                </div>
                <div className="inventory-ppe-line-card-actions">
                  <span className={`inventory-ppe-line-status ${isIssued ? "is-issued" : isSection ? "is-section" : "is-muted"}`}>
                    {isSection ? "Не выдается" : statusText}
                  </span>
                  <button className="button ghost danger" onClick={() => onRemoveLine(index)} type="button">
                    <Trash2 size={15} /> Удалить
                  </button>
                </div>
              </header>

              <div className="inventory-ppe-line-card-grid">
                <section className="inventory-ppe-line-section is-norm">
                  <div className="inventory-ppe-line-section-title">
                    <span>1</span>
                    <strong>Норма СИЗ</strong>
                  </div>
                  <label>
                    <span>СИЗ по норме</span>
                    <input
                      aria-label={"Наименование СИЗ по норме " + line.item.name}
                      onChange={(event) => onPatchLine(index, { printItemName: event.target.value })}
                      value={line.printItemName}
                    />
                  </label>
                  {isSection ? (
                    <p className="inventory-ppe-line-note">
                      Эта строка печатается в личной карточке как разделитель и не попадает в лист подписи.
                    </p>
                  ) : (
                    <>
                      <div className="inventory-ppe-norm-meta">
                        <label>
                          <span>Пункт норм</span>
                          <input
                            aria-label={"Пункт нормы " + line.item.name}
                            onChange={(event) => onPatchLine(index, { normPoint: event.target.value })}
                            placeholder="п. 1.3.1 Приложения № 2"
                            value={line.normPoint}
                          />
                        </label>
                        <label>
                          <span>Периодичность</span>
                          <input
                            aria-label={"Периодичность выдачи " + line.item.name}
                            list="ppe-issue-period-options"
                            onChange={(event) => onPatchLine(index, { issuePeriodText: event.target.value })}
                            value={line.issuePeriodText}
                          />
                        </label>
                      </div>
                      <small>Печатается в личной карточке и первой колонке листа подписи.</small>
                    </>
                  )}
                </section>

                <section className="inventory-ppe-line-section is-catalog" aria-disabled={isSection}>
                  <div className="inventory-ppe-line-section-title">
                    <span>2</span>
                    <strong>Номенклатура</strong>
                  </div>
                  <div className="inventory-ppe-catalog-summary">
                    <strong>{line.catalogName || line.item.name}</strong>
                    <span>{line.item.category || "без категории"}</span>
                    <span>{line.item.article || line.item.sku || "без артикула"}</span>
                  </div>
                  <small>Номенклатура уточняет выдачу, но не заменяет нормативное имя.</small>
                </section>

                <section className="inventory-ppe-line-section is-model" aria-disabled={isSection}>
                  <div className="inventory-ppe-line-section-title">
                    <span>3</span>
                    <strong>Модель / марка</strong>
                  </div>
                  <label>
                    <span>Вторая колонка листа подписи</span>
                    <input
                      aria-label={"Модель, марка или артикул " + line.item.name}
                      disabled={isSection}
                      list="ppe-line-model-options"
                      onChange={(event) => onPatchLine(index, { brandModelArticle: event.target.value })}
                      placeholder="СОМЗ, Форвард, Эксперт К3, SIM-06/K"
                      value={modelValue}
                    />
                  </label>
                  <small>Например: СОМЗ, Форвард, Эксперт К3, SIM-06/K.</small>
                </section>

                <section className="inventory-ppe-line-section is-fact">
                  <div className="inventory-ppe-line-section-title">
                    <span>4</span>
                    <strong>Факт выдачи</strong>
                  </div>
                  <div className="inventory-ppe-fact-cell">
                    <label>
                      <span>Кол-во</span>
                      <input
                        disabled={isSection}
                        inputMode="decimal"
                        value={line.quantityText}
                        onChange={(event) => onPatchLine(index, { quantityText: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>Дата выдачи</span>
                      <input
                        aria-label={"Дата выдачи " + line.item.name}
                        disabled={isSection || !isIssued}
                        type="date"
                        value={line.issuedAt}
                        onChange={(event) => onPatchLine(index, { issuedAt: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>Цена</span>
                      <input
                        disabled={isSection}
                        inputMode="decimal"
                        value={line.priceText}
                        onChange={(event) => onPatchLine(index, { priceText: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>Контроль</span>
                      <input
                        aria-label={"Контрольная дата " + line.item.name}
                        disabled={isSection}
                        type="date"
                        value={line.dueAt}
                        onChange={(event) => onPatchLine(index, { dueAt: event.target.value })}
                      />
                    </label>
                  </div>
                  {hasZeroPrice && !isSection ? <span className="inventory-ppe-field-warning">Цена не указана</span> : null}
                </section>

                <section className="inventory-ppe-line-section is-status">
                  <div className="inventory-ppe-line-section-title">
                    <span>5</span>
                    <strong>Статус</strong>
                  </div>
                  <select
                    disabled={isSection}
                    value={line.status}
                    onChange={(event) =>
                      onPatchLine(index, {
                        issuedAt: isPpeSignatureStatus(event.target.value) ? line.issuedAt || new Date().toISOString().slice(0, 10) : line.issuedAt,
                        status: event.target.value,
                      })
                    }
                  >
                    {PPE_ISSUE_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {ppeIssueStatusLabel(option.value)}
                      </option>
                    ))}
                  </select>
                  <small>{isSection ? "Разделитель остается только в личной карточке." : ppeIssueStatusDescription(line.status)}</small>
                </section>
              </div>

              {lineErrors.length ? (
                <div className="inventory-ppe-line-errors" role="alert">
                  <strong>Проверьте строку перед сохранением</strong>
                  <ul>
                    {lineErrors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </PpeIssueLineEditor>
          );
        })}
      </div>
    </div>
  );
}

