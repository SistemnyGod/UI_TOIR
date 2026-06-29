import type { EmuWorkSessionDto } from "../../../../api/contracts";
import type { EmuWorkspace } from "../../../../hooks/useEmuWorkspace";
import { collectWorkingConflicts } from "../workAccountingUtils";

export function CatalogSummary({ onOpenCatalogs, workspace }: { onOpenCatalogs: () => void; workspace: EmuWorkspace }) {
  const sections = workspace.settings.sections;
  const waitReasons = workspace.settings.waitReasons;
  const notCompletedReasons = workspace.settings.notCompletedReasons;
  const templates = workspace.settings.workTemplates;
  const summary = [
    { label: "Участки", active: sections.filter((item) => item.isActive).length, total: sections.length },
    { label: "Причины ожидания", active: waitReasons.filter((item) => item.isActive).length, total: waitReasons.length },
    { label: "Причины невыполнения", active: notCompletedReasons.filter((item) => item.isActive).length, total: notCompletedReasons.length },
    { label: "Типовые работы", active: templates.filter((item) => item.isActive).length, total: templates.length },
  ];

  return (
    <section className="emu-catalog-summary">
      <div>
        <strong>Справочники ЭМУ</strong>
        <span>Участки, причины ожидания, причины невыполнения и типовые работы используются в карточках без перезагрузки экрана.</span>
      </div>
      <div className="emu-catalog-summary-items">
        {summary.map((item) => (
          <article key={item.label}>
            <span>{item.label}</span>
            <strong>{item.active}</strong>
            <em>активно из {item.total}</em>
          </article>
        ))}
      </div>
      <button className="emu-secondary-button" onClick={onOpenCatalogs} type="button">
        Открыть справочники
      </button>
    </section>
  );
}

export function WorkAttentionSummary({ activeWork }: { activeWork: EmuWorkSessionDto[] }) {
  const carriedOver = activeWork.filter((work) => work.isCarriedOver);
  const conflicts = collectWorkingConflicts(activeWork);
  const items = [
    carriedOver.length > 0 ? `${carriedOver.length} забытых работ перенесены на текущие сутки` : "",
    conflicts.length > 0 ? `${conflicts.length} сотрудников одновременно работают в нескольких карточках` : "",
  ].filter(Boolean);

  if (items.length === 0) return null;

  return (
    <section className="emu-attention-strip">
      <strong>Требует внимания</strong>
      <div>
        {items.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </section>
  );
}

