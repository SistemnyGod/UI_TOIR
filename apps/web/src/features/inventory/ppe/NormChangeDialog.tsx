import { DocumentConfirmation } from "./DocumentConfirmation";
import type { NormChoice } from "./usePpeNormTransition";

export function NormChangeDialog({ choice, onConfirm, onClose, busy = false }: { choice: NormChoice; onConfirm: () => boolean; onClose: () => void; busy?: boolean }) {
  return <DocumentConfirmation title="Изменить нормативный набор?" subtitle={choice.detail ? `${choice.detail.normSet.positionName} · ${choice.detail.normSet.versionName}` : "Норма будет снята с документа"} action={choice.id ? "Применить норму" : "Снять норму"} danger busy={busy} onConfirm={onConfirm} onClose={onClose} closeOnSuccess={false}>
    <p>{choice.mode === "current" ? "Состав нормы изменился на сервере." : "В выбранной норме отсутствуют некоторые позиции текущего комплекта."} После применения будут удалены только перечисленные позиции. Остальные введённые данные сохранятся.</p>
    <p>Позиций к удалению: <strong>{choice.removed.length}</strong></p>
    <ul className="ppe-norm-change-lines" aria-label="Позиции, отсутствующие в новой норме">{choice.removed.map(line => <li key={line.id}><strong>{line.itemName}</strong><span>{line.quantity} {line.unitSymbol}</span></li>)}</ul>
    <p>Кнопка «Вернуться» оставит прежний нормативный набор и весь комплект без изменений.</p>
  </DocumentConfirmation>;
}
