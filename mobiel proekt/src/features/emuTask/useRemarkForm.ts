import { useRef, useState } from "react";

import { assertDataOwnerContext, type DataOwnerContext } from "@/auth/dataOwnerContext";
import { createShiftRemarkLocally } from "@/db/repositories/shiftRemarkRepository";
import { invalidateWorkDraftForContext, waitForWorkDraftForContext } from "@/db/repositories/workDraftRepository";
import { MobileEmployeeDto, MobileEmuSectionDto } from "@/domain/emu/emuTypes";
import type { RemarkAttachmentAfterSave } from "@/features/emuTask/WorkAccountingForms";
import { defaultEmployeeId, defaultSectionId, type RemarkAttachmentTarget, type WorkStatusSetters, type WorkTab } from "@/features/emuTask/workAccountingModel";
import type { useWorkDrafts } from "@/features/emuTask/useWorkDrafts";

/** The «Новое замечание» form. Saving can go straight on to adding attachments. */
export function useRemarkForm({ drafts, employees, sections, reloadLocal, setTab, onAttachAfterSave, setLoading, setMessage }: {
  drafts: ReturnType<typeof useWorkDrafts>;
  employees: MobileEmployeeDto[];
  sections: MobileEmuSectionDto[];
  reloadLocal: () => Promise<void>;
  setTab: (tab: WorkTab) => void;
  onAttachAfterSave: (target: RemarkAttachmentTarget) => void;
} & WorkStatusSetters) {
  const [open, setOpen] = useState(false);
  const [draftKey, setDraftKey] = useState("");
  const [draftContext, setDraftContext] = useState<DataOwnerContext | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [comment, setComment] = useState("");
  const [attachmentAfterSave, setAttachmentAfterSave] = useState<RemarkAttachmentAfterSave>("later");
  const saveInFlightRef = useRef(false);

  async function openCreate() {
    await drafts.openDraft<{ sectionId?: string; comment?: string; employeeId?: string; attachmentAfterSave?: RemarkAttachmentAfterSave }>("remark", "new", (context, key, draft) => {
      setEmployeeId(draft?.employeeId ?? defaultEmployeeId(employees));
      setDraftKey(key); setDraftContext(context);
      setSectionId(draft?.sectionId ?? defaultSectionId(sections)); setComment(draft?.comment ?? "");
      setAttachmentAfterSave(draft?.attachmentAfterSave ?? "later"); setOpen(true);
      drafts.installDraft("remark", "new", key, context, { employeeId: draft?.employeeId ?? defaultEmployeeId(employees), sectionId: draft?.sectionId ?? defaultSectionId(sections), comment: draft?.comment ?? "", attachmentAfterSave: draft?.attachmentAfterSave ?? "later" });
    });
  }

  async function save() {
    if (saveInFlightRef.current) return;
    const employee = employees.find((item) => item.employeeId === employeeId);
    const section = sections.find((item) => item.sectionId === sectionId);
    if (!employee || !section || !comment.trim()) {
      setMessage("Выберите сотрудника, участок и заполните описание замечания.");
      return;
    }

    saveInFlightRef.current = true;
    setLoading(true);
    setMessage(null);
    try {
      await drafts.pauseForm();
      if (draftContext && draftKey) {
        invalidateWorkDraftForContext(draftContext, draftKey, "remark");
        await waitForWorkDraftForContext(draftContext, draftKey, "remark");
      }
      if (!draftContext || !draftKey) throw new Error("Форма закрыта. Откройте её заново.");
      await assertDataOwnerContext(draftContext);
      const remarkId = await createShiftRemarkLocally({
        comment,
        sectionId: section.sectionId,
        sectionName: section.name,
        employeeId: employee.employeeId,
        employeeName: employee.fullName,
        draftKey
      });
      drafts.finishForm();
      setOpen(false);
      await reloadLocal();
      setTab("remarks");
      setMessage("Замечание сохранено на телефоне");

      if (attachmentAfterSave === "now") {
        onAttachAfterSave({ remarkId, title: section.name });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить замечание.");
    } finally {
      drafts.resumeForm();
      saveInFlightRef.current = false;
      setLoading(false);
    }
  }

  return {
    open, employeeId, sectionId, comment, attachmentAfterSave,
    setEmployeeId: (value: string) => { drafts.editDraft("employeeId", value); setEmployeeId(value); },
    setSectionId: (value: string) => { drafts.editDraft("sectionId", value); setSectionId(value); },
    setComment: (value: string) => { drafts.editDraft("comment", value); setComment(value); },
    setAttachmentAfterSave: (value: RemarkAttachmentAfterSave) => { drafts.editDraft("attachmentAfterSave", value); setAttachmentAfterSave(value); },
    close: () => setOpen(false),
    openCreate, save
  };
}
