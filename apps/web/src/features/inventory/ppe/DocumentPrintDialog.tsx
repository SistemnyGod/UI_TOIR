import { useState } from "react";
import type { PpeIssueDocumentDto } from "../../../api/contracts";
import { Button, ModalShell } from "../../../shared/ui";
import { DocumentPaper } from "./DocumentPaper";
import "../styles/ppe-document-dialogs.css";

export function DocumentPrintDialog({ document, initialKind, onClose }: { document: PpeIssueDocumentDto; initialKind: "norms" | "signature"; onClose: () => void }) {
  const [kind, setKind] = useState(initialKind), [zoom, setZoom] = useState("fit");
  return <ModalShell title="Просмотр печатной формы" subtitle={document.content.employee.fullName} className="ppe-document-print-dialog" onClose={onClose}
    actions={<><span className="ppe-document-dialog-hint">Точные переносы страниц доступны в PDF.</span><Button variant="ghost" onClick={onClose}>Закрыть просмотр</Button></>}>
    <div className="ppe-document-print-controls"><label>Форма<select value={kind} onChange={event => setKind(event.target.value as typeof kind)}><option value="norms">Личная карточка · книжная</option><option value="signature">Выдача и подписи · альбомная</option></select></label><label>Масштаб просмотра<select value={zoom} onChange={event => setZoom(event.target.value)}><option value="fit">По ширине</option><option value="100">100% · прокрутка по горизонтали</option></select></label></div>
    <div className={`ppe-document-print-canvas ${zoom === "100" ? "actual-size" : ""}`} tabIndex={0} aria-label="Печатная форма"><DocumentPaper document={document} type={kind} /></div>
  </ModalShell>;
}
