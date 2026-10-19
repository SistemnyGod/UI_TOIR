import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import type { PpeIssueDocumentDto, PpeIssueDocumentSummaryDto } from "../../../api/contracts";
import { formatDocumentStatus, formatRuDate } from "./documentDraft";

export type DocumentStep = 1 | 2 | 3 | 4;

export function DocumentSteps({ step }: { step: DocumentStep }) {
  return <ol className="ppe-document-steps" aria-label="Этапы оформления">
    {["Сотрудник", "Проверка", "Комплект СИЗ", "Документы"].map((label, index) => <li
      className={step === index + 1 ? "is-active" : step > index + 1 ? "is-done" : ""}
      aria-current={step === index + 1 ? "step" : undefined} key={label}>
      <span>{index + 1}</span>{label}</li>)}
  </ol>;
}

export function DocumentFooter({ step, canManage, busy, immutable, document, canSave, hasLines, onStep, onSave, onNext, onValidate }: {
  step: DocumentStep; canManage: boolean; busy: boolean; immutable: boolean; document: PpeIssueDocumentDto | null;
  canSave: boolean; hasLines: boolean; onStep: (step: DocumentStep) => void; onSave: () => void; onNext: () => void; onValidate: () => void;
}) {
  if (!canManage) return document ? <footer className="ppe-document-footer">
    <button className="button secondary" disabled={step <= 1 || busy} onClick={() => onStep((step - 1) as DocumentStep)} type="button">Назад</button>
    <button className="button secondary" disabled={step >= 4 || busy} onClick={() => onStep((step + 1) as DocumentStep)} type="button">Далее</button>
  </footer> : null;
  return <footer className="ppe-document-footer">
    <button className="button ghost" disabled={step === 1 || busy || immutable} onClick={() => onStep((step - 1) as DocumentStep)} type="button">
      <ArrowLeft size={16} /> Назад</button>
    {document ? <span className="ppe-document-saved" data-status={document.status}>
      {document.status === "draft" ? "Черновик" : document.status === "confirmed" ? "Выдача подтверждена" : "Черновик отменён"} · версия {document.version}
    </span> : null}
    {!immutable ? <button className="button secondary" disabled={busy || !canSave} onClick={onSave} type="button">Сохранить черновик</button> : null}
    {step < 3 ? <button className="button primary" disabled={immutable || busy || !canSave} onClick={onNext} type="button">Далее <ArrowRight size={16} />
    </button>
      : step === 3 ? <button className="button primary" disabled={immutable || busy || !hasLines} onClick={onValidate} type="button">
        <CheckCircle2 size={16} /> Предпросмотр документов</button> : null}
  </footer>;
}

export function DocumentHistory({ history, busy, onOpen }: { history: Pick<PpeIssueDocumentSummaryDto, "id" | "employeeName" | "documentDate" | "status" | "linesCount">[]; busy: boolean; onOpen: (id: string) => void }) {
  if (!history.length) return null;
  return <section className="ppe-document-history">
    <h2>Документы сотрудника</h2>{history.map(item => <button disabled={busy} key={item.id} onClick={() => onOpen(item.id)} type="button">
      <span>{formatRuDate(item.documentDate)} · {item.employeeName}</span>
      <small>{formatDocumentStatus(item.status)} · {item.linesCount} строк</small>
    </button>)}</section>;
}
