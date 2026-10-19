import { useState } from "react";
import { CheckCircle2, Download, FileText, Printer, Maximize2 } from "lucide-react";
import type { PpeIssueDocumentDto } from "../../../api/contracts";
import { DocumentPaper } from "./DocumentPaper";
import { DocumentConfirmation } from "./DocumentConfirmation";
import { DocumentPrintDialog } from "./DocumentPrintDialog";
import { PreparedPdf } from "./PreparedPdf";
import "../styles/ppe-document-files.css";

type Kind = "norms" | "signature";
type PrintKind = Kind | "both";
type Props = { busy: boolean; canManage: boolean; canExport: boolean; document: PpeIssueDocumentDto | null; hasErrors: boolean; previewType: PrintKind; previewUrl: string; previewName?: string; filePending?: string; fileError?: string; onPreview: (type: PrintKind) => boolean | void | Promise<boolean | void>; onConfirm: () => boolean | void | Promise<boolean | void>; onDownload: (type: PrintKind, format: "docx" | "pdf") => boolean | void | Promise<boolean | void> };
export function DocumentReview(p: Props) {
  const [kind, setKind] = useState<Kind>("norms");
  const [zoom, setZoom] = useState("fit");
  const [full, setFull] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileBusy = p.busy || Boolean(p.filePending);
  if (!p.document) return <div className="ppe-document-state">Сначала сохраните состав документа.</div>;
  const document = p.document;
  const paper = <DocumentPaper document={document} type={kind} />;
  return <div className="ppe-document-review">
    {p.hasErrors ? <div className="ppe-document-alert is-error" role="alert"><div><strong>Перед подтверждением исправьте:</strong>{document.validation.errors.map((problem, index) => <p key={index}>{problem.message}</p>)}</div></div> : null}
    <div className="ppe-document-actions" aria-label="Подготовка файлов">{p.canExport ? <><button className="button secondary" disabled={fileBusy} onClick={() => { void p.onDownload(kind, "docx"); }} type="button"><FileText size={18} /> Скачать Word</button><button className="button secondary" disabled={fileBusy} onClick={() => { void p.onDownload(kind, "pdf"); }} type="button"><Download size={18} /> Скачать PDF</button><button className="button secondary" disabled={fileBusy} onClick={() => { void p.onPreview(kind); }} type="button"><Printer size={18} /> Подготовить выбранную форму</button><button className="button secondary" disabled={fileBusy} onClick={() => { void p.onPreview("both"); }} type="button"><Printer size={18} /> Подготовить обе формы</button></> : <span>Печать доступна пользователям с правом экспорта.</span>}</div>
    {p.filePending ? <p className="ppe-document-file-state" role="status">{p.filePending.startsWith("preview:") ? "Подготавливаем PDF для просмотра…" : "Подготавливаем файл для скачивания…"} Текущий документ и предыдущий PDF сохраняются.</p> : null}
    {p.fileError ? <p className="ppe-document-file-error" role="alert">{p.fileError}</p> : null}
    {p.canExport && p.previewUrl ? <PreparedPdf key={p.previewUrl} url={p.previewUrl} downloadName={p.previewName ?? "ppe.pdf"} label={p.previewType === "both" ? "Обе печатные формы" : p.previewType === "norms" ? "Личная карточка · PDF" : "Выдача и подписи · PDF"} /> : null}
    <div className="ppe-review-layout">
      <aside className="ppe-document-picker"><h2>Документы</h2>{(["norms", "signature"] as const).map((type, index) => <button type="button" key={type} aria-pressed={kind === type} className={kind === type ? "is-selected" : ""} onClick={() => setKind(type)}><FileText size={36} /><strong>{index + 1 < 10 ? "0" : ""}{index + 1} · {type === "norms" ? "Личная карточка" : "Выдача и подписи"}</strong><small>A4 · {type === "norms" ? "Книжная" : "Альбомная"}</small></button>)}<p className="ppe-ref-muted">Количество копий и выбор принтера — в диалоге печати PDF.</p><p className="ppe-ref-muted">Печать и скачивание не подтверждают выдачу.</p></aside>
      <div className="ppe-ref-viewer"><div className="ppe-viewer-toolbar"><strong>{kind === "norms" ? "Личная карточка" : "Выдача, возврат и подписи"}</strong><label>Масштаб<select value={zoom} onChange={event => setZoom(event.target.value)}><option value="fit">По ширине</option><option value="100">100%</option></select></label><button className="button ghost" aria-label="Развернуть документ" onClick={() => setFull(true)} type="button"><Maximize2 size={18} /></button></div>
        <div className={`ppe-paper-canvas ${zoom === "100" ? "actual-size" : ""}`}>{paper}</div>
        <p className="ppe-ref-muted ppe-viewer-note">Предпросмотр состава. Точные переносы страниц и печать доступны в PDF.</p>
      </div>
    </div>
    <div className="ppe-document-actions"><span className="ppe-ref-muted">{document.status === "confirmed" ? "Выдача подтверждена" : document.status === "cancelled" ? "Черновик отменён" : "Документ сохранён как черновик"}</span>{p.canManage && document.status === "draft" ? <button className="button primary" disabled={p.busy || p.hasErrors} onClick={() => setConfirmOpen(true)} type="button"><CheckCircle2 size={18} /> Подтвердить выдачу</button> : null}</div>
    {full ? <DocumentPrintDialog key={document.id} document={document} initialKind={kind} onClose={() => setFull(false)} /> : null}
    {confirmOpen ? <DocumentConfirmation key={document.id} title="Подтвердить выдачу СИЗ?" subtitle={document.content.employee.fullName} action="Подтвердить выдачу" busy={p.busy} onConfirm={p.onConfirm} onClose={() => setConfirmOpen(false)}><p>Будет подтверждён комплект из {document.content.lines.length} позиций. После подтверждения состав документа нельзя изменить.</p><p>Подтверждайте только фактически выдаваемый сотруднику комплект.</p></DocumentConfirmation> : null}
  </div>;
}
