import { useState } from "react";
import { Printer } from "lucide-react";
import { Button, ModalShell, useDialogCloseGuard } from "../../../shared/ui";
import type { PrintData, PrintMode } from "./ppeTypes";
import { DocumentConfirmation } from "./DocumentConfirmation";
import { usePpeDialogOperation } from "./usePpeDialogOperation";
import { LegacyPrintCanvas } from "./LegacyPrintCanvas";
import { LegacyPrintFields } from "./LegacyPrintFields";
import "../styles/ppe-legacy-print.css";

type PrintSources = Record<PrintMode, PrintData>;
export function LegacyPrintPreview({ sources, mode, onModeChange, onPrint, onClose }: {
  sources: PrintSources; mode: PrintMode; onModeChange: (mode: PrintMode) => void; onClose: () => void;
  onPrint: (data: PrintData, mode: PrintMode) => boolean | void | Promise<boolean | void>;
}) {
  const [original, setOriginal] = useState(() => structuredClone(sources));
  const [drafts, setDrafts] = useState(() => structuredClone(sources));
  const [editing, setEditing] = useState(false), [refreshing, setRefreshing] = useState(false), [fit, setFit] = useState(true);
  const operation = usePpeDialogOperation();
  const dirty = JSON.stringify(drafts) !== JSON.stringify(original);
  const changed = JSON.stringify(sources) !== JSON.stringify(original);
  const close = useDialogCloseGuard({ dirty, pending: operation.pending, onClose,
    message: "Правки для печати действуют только в этом просмотре. При закрытии они будут потеряны. Данные карточки в базе не изменены." });
  function refresh() { setOriginal(structuredClone(sources)); setDrafts(structuredClone(sources)); operation.setError(""); }
  return <><ModalShell title="Предпросмотр печати" subtitle={drafts[mode].employeeName} className="ppe-legacy-print-dialog" pending={operation.pending} onClose={close.requestClose}
    actions={<><Button variant="ghost" disabled={operation.pending} onClick={close.requestClose}>Закрыть</Button><Button variant="primary" isLoading={operation.pending} onClick={() => { void operation.execute(() => onPrint(drafts[mode], mode), accepted => { if (accepted === false) operation.setError("Печать не подготовлена. Повторите попытку."); }); }}><Printer size={16} aria-hidden="true" />Печать</Button></>}>
    <div className="ppe-legacy-print-tools">
      <div className="ppe-legacy-print-modes" role="group" aria-label="Печатная форма">{(["card", "sheet"] as const).map(value => <Button key={value} variant={mode === value ? "primary" : "secondary"} aria-pressed={mode === value} disabled={operation.pending} onClick={() => { onModeChange(value); operation.setError(""); }}>{value === "card" ? "Личная карточка" : "Лист подписи"}</Button>)}</div>
      <label>Масштаб<select disabled={operation.pending} value={fit ? "fit" : "actual"} onChange={event => setFit(event.target.value === "fit")}><option value="fit">По ширине</option><option value="actual">100%</option></select></label>
      <Button disabled={operation.pending} onClick={() => setEditing(true)}>Правки для печати</Button>
    </div>
    <p className="ppe-legacy-print-hint">{mode === "card" ? "Книжная ориентация" : "Альбомная ориентация"} · Правки применяются только к печати из этого окна. Они не изменяют карточку и серверные файлы PDF/Word.</p>
    {changed ? <div className="ppe-legacy-print-notice" role="status"><span>Карточка обновилась на сервере. Открытый просмотр и ваши правки сохранены.</span><Button disabled={operation.pending} onClick={() => dirty ? setRefreshing(true) : refresh()}>Загрузить обновлённые данные</Button></div> : null}
    {dirty ? <p className="ppe-legacy-print-hint" role="status">Есть локальные правки для печати.</p> : null}
    {operation.error ? <p className="field-error" role="alert">{operation.error}</p> : null}
    <LegacyPrintCanvas data={drafts[mode]} mode={mode} fit={fit} />
  </ModalShell>{close.discardDialog}
    {editing ? <LegacyPrintFields data={drafts[mode]} mode={mode} onClose={() => setEditing(false)} onApply={data => { setDrafts(current => ({ ...current, [mode]: data })); setEditing(false); }} /> : null}
    {refreshing ? <DocumentConfirmation title="Обновить печатные данные?" action="Обновить и сбросить правки" onClose={() => setRefreshing(false)} onConfirm={refresh}><p>Локальные правки обеих печатных форм будут заменены текущими данными карточки. Данные в базе останутся без изменений.</p></DocumentConfirmation> : null}
  </>;
}
