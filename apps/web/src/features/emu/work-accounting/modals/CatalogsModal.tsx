import "./emuDirectories.css";
import { useId, useState } from "react";
import type { EmuWorkspace } from "../../../../hooks/useEmuWorkspace";
import { Button } from "../../../../shared/ui";
import { ModalFrame } from "../components/ModalFrame";
import { useEmuDialogSession } from "../useEmuDialogSession";
import { ReferenceBlock, type ReferenceDraft } from "./ReferenceBlock";
import { TemplateBlock, type TemplateDraft } from "./TemplateBlock";

type ReferenceTab = "sections" | "waitReasons" | "notCompletedReasons";
type CatalogTab = ReferenceTab | "templates";
const emptyReference = (): ReferenceDraft => ({ name: "", search: "", editing: null });

export function CatalogsModal({ onClose, onNotify, workspace }: { onClose: () => void; onNotify: (message: string) => void; workspace: EmuWorkspace }) {
  const id = useId();
  const [activeTab, setActiveTab] = useState<CatalogTab>("sections");
  const [drafts, setDrafts] = useState<Record<ReferenceTab, ReferenceDraft>>(() => ({ sections: emptyReference(), waitReasons: emptyReference(), notCompletedReasons: emptyReference() }));
  const [template, setTemplate] = useState<TemplateDraft>({ name: "", description: "", sectionId: "", search: "" });
  const dirtyTabs = {
    ...Object.fromEntries(Object.entries(drafts).map(([key, value]) => [key, Boolean(value.name || value.editing && value.editing.name !== value.editing.item.name)])),
    templates: Boolean(template.name || template.description || template.sectionId),
  } as Record<CatalogTab, boolean>;
  const dirty = Object.values(dirtyTabs).some(Boolean);
  const session = useEmuDialogSession({ dirty, onClose, onNotify });
  const tabs: Array<{ id: CatalogTab; label: string; count: number }> = [
    { id: "sections", label: "Участки", count: workspace.settings.sections.length },
    { id: "waitReasons", label: "Причины ожидания", count: workspace.settings.waitReasons.length },
    { id: "notCompletedReasons", label: "Причины невыполнения", count: workspace.settings.notCompletedReasons.length },
    { id: "templates", label: "Типовые работы", count: workspace.settings.workTemplates.length },
  ];
  const referenceActions = {
    sections: { create: workspace.actions.createSection, update: workspace.actions.updateSection },
    waitReasons: { create: workspace.actions.createWaitReason, update: workspace.actions.updateWaitReason },
    notCompletedReasons: { create: workspace.actions.createNotCompletedReason, update: workspace.actions.updateNotCompletedReason },
  };

  return <ModalFrame className="emu-catalogs-modal-frame" title="Справочники ЭМУ" wide
    subtitle="Участки, причины и типовые работы для оперативной доски"
    onClose={session.close} pending={session.pending} leaveDialog={session.leaveDialog}
    actions={<div className="emu-directory-actions">
      {session.error ? <p className="emu-work-form-error" role="alert">{session.error}</p> : null}
      <p role="status">{session.pending ? "Сохраняем изменения…" : dirty ? "Есть несохранённый ввод. Используйте «Добавить» или «Сохранить» в нужном разделе." : "Записи сохраняются кнопками «Добавить» и «Сохранить»."}</p>
      <Button disabled={session.pending} onClick={session.close} variant="primary">Готово</Button>
    </div>}>
    <nav className="emu-catalog-tabs" role="tablist" aria-label="Разделы справочников">
      {tabs.map((tab, index) => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id}
        aria-controls={`${id}-panel-${tab.id}`} id={`${id}-tab-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1}
        className="emu-catalog-tab" onClick={() => setActiveTab(tab.id)} onKeyDown={event => {
          const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : -1;
          if (next < 0) return;
          event.preventDefault(); setActiveTab(tabs[next].id); document.getElementById(`${id}-tab-${tabs[next].id}`)?.focus();
        }}>
        <span>{tab.label}{dirtyTabs[tab.id] ? <span aria-label="Есть несохранённый ввод"> *</span> : null}</span><em>{tab.count}</em>
      </button>)}
    </nav>
    <div role="tabpanel" aria-labelledby={`${id}-tab-${activeTab}`} id={`${id}-panel-${activeTab}`} className="emu-catalog-content">
      {activeTab === "templates" ? <TemplateBlock draft={template} onChange={setTemplate} session={session} workspace={workspace} /> : <ReferenceBlock key={activeTab}
        draft={drafts[activeTab]} onChange={draft => setDrafts(current => ({ ...current, [activeTab]: draft }))}
        items={workspace.settings[activeTab]} session={session} title={tabs.find(tab => tab.id === activeTab)!.label}
        protectSystemOther={activeTab === "sections"}
        onCreate={name => referenceActions[activeTab].create({ name })}
        onUpdate={(item, patch) => referenceActions[activeTab].update(item.id, { name: patch.name ?? item.name, isActive: patch.isActive ?? item.isActive, sortOrder: item.sortOrder })} />}
    </div>
  </ModalFrame>;
}
