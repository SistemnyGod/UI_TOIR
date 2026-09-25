import { useRef, useState } from "react";
import { CheckCircle2, Download, FileText, Printer, Maximize2 } from "lucide-react";
import type { PpeIssueDocumentDto } from "../../../api/contracts";
import { DocumentPaper } from "./DocumentPaper";
import { ModalShell } from "../../../shared/ui/ModalShell";

type Kind = "norms" | "signature";
type PrintKind = Kind | "both";
type Props = { busy: boolean; canManage: boolean; canExport: boolean; document: PpeIssueDocumentDto | null; hasErrors: boolean; previewType: PrintKind; previewUrl: string; onPreview: (type: PrintKind) => void; onConfirm: () => void; onDownload: (type: PrintKind, format: "docx" | "pdf") => void };
export function DocumentReview(p: Props) {
  const [kind, setKind] = useState<Kind>("norms");
  const [zoom, setZoom] = useState("fit");
  const [full, setFull] = useState(false);
  const pdf = useRef<HTMLIFrameElement>(null);
  if (!p.document) return <div className="ppe-document-state">Сначала сохраните состав документа.</div>;
  const document = p.document;
  function print(type: PrintKind) {
    if (p.previewUrl && p.previewType === type) { try { pdf.current?.contentWindow?.focus(); pdf.current?.contentWindow?.print(); } catch { p.onDownload(type, "pdf"); } }
    else p.onPreview(type);
  }
  const paper = <DocumentPaper document={document} type={kind} />;
  return <div className="ppe-document-review">
    {p.hasErrors ? <div className="ppe-document-alert is-error" role="alert"><div><strong>Перед подтверждением исправьте:</strong>{document.validation.errors.map((problem, index) => <p key={index}>{problem.message}</p>)}</div></div> : null}
    <div className="ppe-document-actions">{p.canExport ? <><button className="button secondary" disabled={p.busy} onClick={() => p.onDownload(kind, "docx")} type="button"><FileText size={18} /> Скачать Word</button><button className="button secondary" disabled={p.busy} onClick={() => p.onDownload(kind, "pdf")} type="button"><Download size={18} /> Скачать PDF</button><button className="button secondary" disabled={p.busy} onClick={() => print(kind)} type="button"><Printer size={18} /> {p.previewUrl && p.previewType === kind ? "Печать выбранной формы" : "Подготовить выбранную форму"}</button><button className="button secondary" disabled={p.busy} onClick={() => print("both")} type="button"><Printer size={18} /> {p.previewUrl && p.previewType === "both" ? "Печать обеих форм" : "Подготовить обе формы"}</button></> : <span>Печать доступна пользователям с правом экспорта.</span>}</div>
    <div className="ppe-review-layout">
      <aside className="ppe-document-picker"><h2>Документы</h2>{(["norms", "signature"] as const).map((type, index) => <button type="button" key={type} aria-pressed={kind === type} className={kind === type ? "is-selected" : ""} onClick={() => setKind(type)}><FileText size={36} /><strong>{index + 1 < 10 ? "0" : ""}{index + 1} · {type === "norms" ? "Личная карточка" : "Выдача и подписи"}</strong><small>A4 · {type === "norms" ? "Книжная" : "Альбомная"}</small></button>)}<p className="ppe-ref-muted">Количество копий и выбор принтера — в диалоге печати PDF.</p><p className="ppe-ref-muted">Печать и скачивание не подтверждают выдачу.</p></aside>
      <div className="ppe-ref-viewer"><div className="ppe-viewer-toolbar"><strong>{kind === "norms" ? "Личная карточка" : "Выдача, возврат и подписи"}</strong><label>Масштаб<select value={zoom} onChange={event => setZoom(event.target.value)}><option value="fit">По ширине</option><option value="100">100%</option></select></label><button className="button ghost" aria-label="Развернуть документ" onClick={() => setFull(true)} type="button"><Maximize2 size={18} /></button></div>
        <div className={`ppe-paper-canvas ${zoom === "100" ? "actual-size" : ""}`}>{paper}</div>
        {p.previewUrl && (p.previewType === kind || p.previewType === "both") ? <iframe ref={pdf} title="Печатный PDF" className="ppe-document-preview" src={p.previewUrl} /> : null}
        <p className="ppe-ref-muted ppe-viewer-note">Предпросмотр состава. Точные переносы страниц и печать доступны в PDF.</p>
      </div>
    </div>
    <div className="ppe-document-actions"><span className="ppe-ref-muted">{document.status === "confirmed" ? "Выдача подтверждена" : "Документ сохранён как черновик"}</span>{p.canManage && document.status === "draft" ? <button className="button primary" disabled={p.busy || p.hasErrors} onClick={() => { if (window.confirm("Подтвердить выдачу СИЗ сотруднику? После подтверждения состав документа нельзя изменить.")) p.onConfirm(); }} type="button"><CheckCircle2 size={18} /> Подтвердить выдачу</button> : null}</div>
    {full ? <ModalShell title={kind === "norms" ? "Личная карточка" : "Выдача и подписи"} onClose={() => setFull(false)} className="ppe-ref-modal ppe-full-paper"><div className="ppe-paper-canvas">{paper}</div></ModalShell> : null}
  </div>;
}
