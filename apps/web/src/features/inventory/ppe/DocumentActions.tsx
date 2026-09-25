import { useState } from "react";
import { Ellipsis, Plus, Trash2, ArrowLeftRight } from "lucide-react";
import { ModalShell } from "../../../shared/ui/ModalShell";

export function DocumentActions({ busy, draft, cardId, onCardId, onNew, onCancel, onMigrate }: { busy: boolean; draft: boolean; cardId: string; onCardId: (value: string) => void; onNew: () => void; onCancel: () => void; onMigrate: () => void }) {
  const [open, setOpen] = useState(false);
  return <><button className="button secondary" type="button" disabled={busy} aria-haspopup="dialog" onClick={() => setOpen(true)}><Ellipsis size={18} /> Действия</button>
    {open ? <ModalShell title="Действия с выдачей" className="ppe-ref-modal ppe-actions-modal" onClose={() => setOpen(false)}>
      <div className="ppe-actions-section"><button className="button secondary" disabled={busy} type="button" onClick={() => { setOpen(false); onNew(); }}><Plus size={18} /> Новая выдача</button><p>Начать оформление для другого сотрудника.</p></div>
      {draft ? <div className="ppe-actions-section"><button className="button danger" disabled={busy} type="button" onClick={() => { setOpen(false); onCancel(); }}><Trash2 size={18} /> Отменить черновик</button><p>Действие потребует подтверждения.</p></div> : null}
      <details className="ppe-actions-section"><summary>Перенести старый черновик</summary><p>Для ранее созданной личной карточки СИЗ.</p><label>Идентификатор карточки<input value={cardId} disabled={busy} onChange={event => onCardId(event.target.value)} /></label><button className="button secondary" disabled={busy || !cardId.trim()} type="button" onClick={() => { setOpen(false); onMigrate(); }}><ArrowLeftRight size={18} /> Перенести черновик</button></details>
    </ModalShell> : null}
  </>;
}
