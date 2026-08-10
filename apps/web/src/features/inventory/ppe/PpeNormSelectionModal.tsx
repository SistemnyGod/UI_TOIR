import { useMemo, useState } from "react";
import { Search, ShieldCheck } from "lucide-react";
import type { InventoryItemDto, InventoryPpeNormCandidateDto } from "../../../api/contracts";
import { PpeButton, PpeModalShell } from "./PpeUi";
import { PpeNormCandidateList } from "./PpeNormCandidateList";
import { matchesPpeNormCandidate } from "./ppeNormSearch";

export type PpeNormConfirmationOptions = {
  saveMapping: boolean;
  makeDefault: boolean;
};

export function PpeNormSelectionModal({ candidates, item, quantity, sizeText, additionalReason: initialAdditionalReason = "", loading, error, onClose, onConfirm, onAddAdditional }: {
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

  return (
    <PpeModalShell
      ariaLabel="Подходящие нормы АТОМ"
      className="ppe-norm-selection-modal"
      description="Норма не выбирается автоматически. Подтвердите подходящую строку вручную."
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
      <section className="ppe-norm-candidate-tools" aria-label="Поиск норм сотрудника">
        <label className="ppe-issue-search"><Search size={17} /><input aria-label="Поиск по нормам АТОМ" id="ppe-norm-selection-search" onChange={(event) => setQuery(event.target.value)} placeholder="Название нормы, пункт или вид СИЗ" value={query} /></label>
        <PpeButton onClick={() => setShowAll((value) => !value)} variant="link">{showAll ? "Показать только подходящие" : "Показать все нормы сотрудника"}</PpeButton>
      </section>
      <fieldset className="ppe-norm-mapping-policy">
        <legend>Как использовать это решение?</legend>
        <label><input checked={!saveMapping} name="ppe-mapping-policy" onChange={() => setSaveMapping(false)} type="radio" />Только для этой выдачи</label>
        <label><input checked={saveMapping} name="ppe-mapping-policy" onChange={() => setSaveMapping(true)} type="radio" />Сохранить как допустимое соответствие</label>
        <label className="is-suboption"><input checked={makeDefault} disabled={!saveMapping} onChange={(event) => setMakeDefault(event.target.checked)} type="checkbox" />Сделать основным соответствием</label>
      </fieldset>
      <PpeNormCandidateList candidates={filteredCandidates} error={error} loading={loading} onConfirm={(candidate) => onConfirm(candidate, { makeDefault: saveMapping && makeDefault, saveMapping })} />
      {onAddAdditional ? <section className={`ppe-norm-additional ${additionalOpen ? "is-open" : ""}`}>
        <PpeButton aria-expanded={additionalOpen} onClick={() => setAdditionalOpen((value) => !value)} variant="link">
          {additionalOpen ? "Скрыть дополнительную выдачу" : "Подходящей нормы нет — оформить дополнительную выдачу"}
        </PpeButton>
        {additionalOpen ? <label className="ppe-norm-additional-reason"><span>Основание дополнительной выдачи <em>*</em></span><textarea aria-required="true" onChange={(event) => setAdditionalReason(event.target.value)} placeholder="Укажите причину или основание" rows={2} value={additionalReason} /></label> : null}
      </section> : null}
    </PpeModalShell>
  );
}
