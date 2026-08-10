import { useMemo, useState } from "react";
import { AlertTriangle, Search, ShieldCheck } from "lucide-react";
import type { InventoryItemDto, InventoryPpeNormCandidateDto } from "../../../api/contracts";
import { PpeButton, PpeModalShell } from "./PpeUi";
import { PpeNormCandidateList } from "./PpeNormCandidateList";
import { matchesPpeNormCandidate } from "./ppeNormSearch";
import "../styles/ppe-catalog-picker.css";

export type PpeNormConfirmationOptions = {
  saveMapping: boolean;
  makeDefault: boolean;
};

export function PpeNormSelectionModal({ candidates, item, quantity, sizeText, additionalReason: initialAdditionalReason = "", loading, error, onClose, onConfirm, onAddAdditional, onOpenNormSettings }: {
  candidates: InventoryPpeNormCandidateDto[];
  item: InventoryItemDto;
  quantity: number;
  sizeText: string;
  additionalReason?: string;
  loading: boolean;
  error: string;
  onClose: () => void;
  onConfirm: (candidate: InventoryPpeNormCandidateDto, options: PpeNormConfirmationOptions) => void;
  onAddAdditional?: (reason: string) => void;
  onOpenNormSettings?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [saveMapping, setSaveMapping] = useState(false);
  const [makeDefault, setMakeDefault] = useState(false);
  const [additionalReason, setAdditionalReason] = useState(initialAdditionalReason);
  const [additionalOpen, setAdditionalOpen] = useState(Boolean(initialAdditionalReason));
  const filteredCandidates = useMemo(() => {
    const recommended = candidates.filter((candidate) => candidate.status !== "incompatible");
    const source = showAll || !recommended.length ? candidates : recommended;
    return source.filter((candidate) => matchesPpeNormCandidate(candidate, query));
  }, [candidates, query, showAll]);
  const canShowCandidates = loading || Boolean(error) || filteredCandidates.length > 0;
  const emptyTitle = candidates.length ? "По этому запросу норма не найдена" : "Подходящая норма не найдена";
  const emptyDescription = candidates.length
    ? "Измените поисковый запрос или покажите все нормы сотрудника."
    : "Товар выбран, но для должности сотрудника нет доступной опубликованной нормы. В настройках найдите нужную строку, сопоставьте товар и опубликуйте набор.";

  return (
    <PpeModalShell
      ariaLabel="Подходящие нормы АТОМ"
      className="ppe-norm-selection-modal"
      description="1. Найдите нормативную строку. 2. Выберите её вручную. 3. При необходимости сохраните это соответствие."
      footer={<><PpeButton onClick={onClose} variant="ghost">Отмена</PpeButton>{onAddAdditional && additionalOpen ? <PpeButton disabled={loading || Boolean(error) || !additionalReason.trim()} onClick={() => onAddAdditional(additionalReason.trim())} variant="secondary">Подтвердить дополнительную выдачу</PpeButton> : null}</>}
      initialFocusSelector="#ppe-norm-selection-search"
      onClose={onClose}
      title="Выбранная номенклатура → нормы АТОМ"
    >
      <section className="ppe-norm-selected-item" aria-label="Выбранная номенклатура">
        <ShieldCheck size={20} />
        <div><strong>{item.name}</strong><span>{[item.brandName, item.modelName, item.article].filter(Boolean).join(" · ") || "Модель не указана"}</span></div>
        <dl><div><dt>Размер</dt><dd>{sizeText || "Не указан"}</dd></div><div><dt>Количество</dt><dd>{quantity} {item.unit || "шт."}</dd></div></dl>
      </section>
      <div className="ppe-norm-next-step" role="status">
        <span className="ppe-norm-next-step-number">1</span>
        <div><strong>Сейчас нужно выбрать норму АТОМ</strong><span>Система не добавит её в документ автоматически. Выберите строку, которая соответствует фактически выдаваемому товару.</span></div>
      </div>
      <section className="ppe-norm-candidate-tools" aria-label="Поиск норм сотрудника">
        <label className="ppe-issue-search"><Search size={17} /><span className="sr-only">Поиск нормативной строки</span><input aria-label="Поиск по нормам АТОМ" id="ppe-norm-selection-search" onChange={(event) => setQuery(event.target.value)} placeholder="Например: обувь зимняя, сапоги, п. 4.7" value={query} /></label>
        {candidates.length ? <PpeButton onClick={() => setShowAll((value) => !value)} variant="link">{showAll ? "Только подходящие нормы" : "Показать все нормы сотрудника"}</PpeButton> : null}
      </section>
      {canShowCandidates ? <PpeNormCandidateList candidates={filteredCandidates} error={error} loading={loading} onConfirm={(candidate) => onConfirm(candidate, { makeDefault: saveMapping && makeDefault, saveMapping })} /> : <section className="ppe-norm-empty-state" role="status">
        <AlertTriangle aria-hidden="true" size={22} />
        <div><strong>{emptyTitle}</strong><span>{emptyDescription}</span>{!candidates.length ? <small>После публикации нормы вернитесь к этому документу и повторите подбор.</small> : null}</div>
        {!candidates.length && onOpenNormSettings ? <PpeButton onClick={onOpenNormSettings} size="compact" variant="secondary">Открыть настройки норм</PpeButton> : null}
      </section>}
      {filteredCandidates.length ? <fieldset className="ppe-norm-mapping-policy">
        <legend>После выбора нормы</legend>
        <label><input checked={!saveMapping} name="ppe-mapping-policy" onChange={() => setSaveMapping(false)} type="radio" /><span><strong>Только для этой выдачи</strong><small>Связь не меняет справочник.</small></span></label>
        <label><input checked={saveMapping} name="ppe-mapping-policy" onChange={() => setSaveMapping(true)} type="radio" /><span><strong>Запомнить как допустимое соответствие</strong><small>Товар будет предлагаться для этой нормы в следующий раз.</small></span></label>
        {saveMapping ? <label className="is-suboption"><input checked={makeDefault} onChange={(event) => setMakeDefault(event.target.checked)} type="checkbox" /><span><strong>Сделать основным</strong><small>Использовать первым при следующих выдачах.</small></span></label> : null}
      </fieldset> : null}
      {onAddAdditional ? <section className={`ppe-norm-additional ${additionalOpen ? "is-open" : ""}`}>
        <PpeButton aria-expanded={additionalOpen} onClick={() => setAdditionalOpen((value) => !value)} variant="link">
          {additionalOpen ? "Скрыть дополнительную выдачу" : "Подходящей нормы нет — оформить дополнительную выдачу"}
        </PpeButton>
        {additionalOpen ? <label className="ppe-norm-additional-reason"><span>Основание дополнительной выдачи <em>*</em></span><textarea aria-required="true" onChange={(event) => setAdditionalReason(event.target.value)} placeholder="Укажите причину или основание" rows={2} value={additionalReason} /></label> : null}
      </section> : null}
    </PpeModalShell>
  );
}
