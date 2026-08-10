import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import type { InventoryPpeNormCandidateDto } from "../../../api/contracts";
import { PpeButton } from "./PpeUi";
import { ppeNormCandidateStatusLabel } from "./ppeStatusCatalog";

export function PpeNormCandidateList({ candidates, loading, error, onConfirm }: {
  candidates: InventoryPpeNormCandidateDto[];
  loading: boolean;
  error: string;
  onConfirm: (candidate: InventoryPpeNormCandidateDto) => void;
}) {
  if (loading) return <div className="ppe-issue-empty-inline"><ShieldCheck size={18} />Поиск применимых норм…</div>;
  if (error) return <div className="ppe-issue-error" role="alert">{error}</div>;
  if (!candidates.length) return <div className="ppe-issue-empty-inline"><AlertTriangle size={18} /><span><strong>Подходящая опубликованная норма не найдена.</strong> Проверьте должность сотрудника и опубликуйте проверенный набор в разделе «Настройки учета → Нормы СИЗ».</span></div>;

  return <div className="ppe-norm-candidate-list">
    {candidates.map((candidate) => {
      const blocked = candidate.status === "limit_exhausted" || candidate.status === "manual_control_required";
      const statusText = ppeNormCandidateStatusLabel(candidate.status);
      return <article className={`ppe-norm-candidate-card is-${candidate.status}`} key={candidate.normRowId}>
        <header><div><span>{statusText}</span><strong>{candidate.normItemName}</strong><small>{candidate.normPoint || "Пункт нормы не указан"}</small></div>{candidate.status === "confirmed_mapping" ? <CheckCircle2 aria-label="Сохранённое соответствие" size={20} /> : <ShieldCheck aria-hidden="true" size={20} />}</header>
        <dl>
          <div><dt>Норма</dt><dd>{candidate.quantityText || candidate.quantity}</dd></div>
          <div><dt>Период</dt><dd>{candidate.issuePeriodText || "—"}</dd></div>
          <div><dt>Срок, мес.</dt><dd>{candidate.lifeMonths ?? "—"}</dd></div>
          <div><dt>Уже выдано</dt><dd>{candidate.alreadyIssuedQuantity}</dd></div>
          <div><dt>Доступно права</dt><dd>{candidate.availableQuantity}</dd></div>
          {candidate.previouslyConfirmedCount > 0 ? <div><dt>Предыдущих выдач</dt><dd>{candidate.previouslyConfirmedCount}</dd></div> : null}
        </dl>
        {candidate.reasons.map((reason) => <p key={reason}>{reason}</p>)}
        {candidate.warnings.map((warning) => <p className="is-warning" key={warning}><AlertTriangle size={14} />{warning}</p>)}
        <PpeButton disabled={blocked} onClick={() => onConfirm(candidate)} variant={candidate.status === "confirmed_mapping" ? "primary" : "secondary"}>{blocked ? "Недоступно" : "Выбрать норму"}</PpeButton>
      </article>;
    })}
  </div>;
}
