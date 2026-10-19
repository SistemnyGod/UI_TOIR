import { useRef, useState } from "react";

import { assertDataOwnerContext, captureDataOwnerContext, type DataOwnerContext } from "@/auth/dataOwnerContext";
import { invalidateWorkDraftForContext, waitForWorkDraftForContext } from "@/db/repositories/workDraftRepository";
import { createRepeatWorkDraft, createWorkTaskLocally, updateWorkTaskLocally } from "@/db/repositories/workTaskRepository";
import { MobileEmployeeDto, MobileEmuSectionDto, WorkItemDto, WorkTaskDto } from "@/domain/emu/emuTypes";
import { repeatWorkDroppedNotice } from "@/domain/emu/repeatWorkPolicy";
import { defaultEmployeeId, defaultSectionId, type TaskFilter, type TaskModalState, type WorkStatusSetters, type WorkTab } from "@/features/emuTask/workAccountingModel";
import type { useWorkDrafts } from "@/features/emuTask/useWorkDrafts";

type TaskDraft = { sectionId?: string; text?: string; employeeId?: string };

/** The create / edit / repeat work form. */
export function useTaskForm({ drafts, employees, sections, reloadLocal, setTab, setTaskFilter, setMenuTask, setLoading, setMessage }: {
  drafts: ReturnType<typeof useWorkDrafts>;
  employees: MobileEmployeeDto[];
  sections: MobileEmuSectionDto[];
  reloadLocal: () => Promise<void>;
  setTab: (tab: WorkTab) => void;
  setTaskFilter: (filter: TaskFilter) => void;
  setMenuTask: (task: WorkItemDto | null) => void;
} & WorkStatusSetters) {
  const [modal, setModal] = useState<TaskModalState>(null);
  const [draftKey, setDraftKey] = useState("");
  const [draftContext, setDraftContext] = useState<DataOwnerContext | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [text, setText] = useState("");
  const saveInFlightRef = useRef(false);

  async function openCreate() {
    await drafts.openDraft<TaskDraft>("task", "new", (context, key, draft) => {
      setEmployeeId(draft?.employeeId ?? defaultEmployeeId(employees));
      setDraftKey(key); setDraftContext(context);
      setSectionId(draft?.sectionId ?? defaultSectionId(sections));
      setText(draft?.text ?? ""); setModal({ mode: "create" });
      drafts.installDraft("task", "new", key, context, { employeeId: draft?.employeeId ?? defaultEmployeeId(employees), sectionId: draft?.sectionId ?? defaultSectionId(sections), text: draft?.text ?? "" });
    });
  }

  // A repeat always opens its own new draft; it never reuses or overwrites a
  // saved "Создать работу" draft.
  async function openRepeat(item: WorkItemDto) {
    await drafts.openExclusive(async isCurrent => {
      const context = await captureDataOwnerContext();
      const repeat = await createRepeatWorkDraft(context, item.itemId);
      await assertDataOwnerContext(context);
      if (!isCurrent()) return;
      setMenuTask(null);
      setEmployeeId(repeat.payload.employeeId); setSectionId(repeat.payload.sectionId); setText(repeat.payload.text);
      setDraftKey(repeat.draftKey); setDraftContext(context);
      setModal({ mode: "create", repeated: true });
      drafts.installDraft("task", "new", repeat.draftKey, context, { ...repeat.payload });
      drafts.setDraftNotice(repeatWorkDroppedNotice(repeat.dropped));
    }, "Не удалось повторить работу.");
  }

  async function openEdit(task: WorkTaskDto) {
    await drafts.openDraft<TaskDraft>("task", task.taskId, (context, key, draft) => {
      setEmployeeId(draft?.employeeId ?? task.employeeId ?? defaultEmployeeId(employees));
      setDraftKey(key); setDraftContext(context);
      setSectionId(draft?.sectionId ?? task.sectionId ?? defaultSectionId(sections));
      setText(draft?.text ?? task.title); setMenuTask(null); setModal({ mode: "edit", task });
      drafts.installDraft("task", task.taskId, key, context, { employeeId: draft?.employeeId ?? task.employeeId ?? defaultEmployeeId(employees), sectionId: draft?.sectionId ?? task.sectionId ?? defaultSectionId(sections), text: draft?.text ?? task.title });
    });
  }

  async function save() {
    if (saveInFlightRef.current) return;
    const employee = employees.find((item) => item.employeeId === employeeId);
    const section = sections.find((item) => item.sectionId === sectionId);
    if (!employee || !section || !text.trim()) {
      setMessage("Выберите сотрудника, участок и заполните задачу.");
      return;
    }

    saveInFlightRef.current = true;
    setLoading(true);
    setMessage(null);
    try {
      await drafts.pauseForm();
      const entityId = modal?.mode === "edit" ? modal.task?.taskId : "new";
      if (draftContext && draftKey) {
        invalidateWorkDraftForContext(draftContext, draftKey, "task", entityId);
        await waitForWorkDraftForContext(draftContext, draftKey, "task", entityId);
      }
      if (!draftContext || !draftKey) throw new Error("Форма закрыта. Откройте её заново.");
      await assertDataOwnerContext(draftContext);
      if (modal?.mode === "edit" && modal.task) {
        await updateWorkTaskLocally({
          task: modal.task,
          sectionId: section.sectionId,
          sectionName: section.name,
          taskDescription: text,
          draftKey
        });
        setMessage("Изменение работы сохранено на телефоне и будет отправлено на сервер.");
      } else {
        await createWorkTaskLocally({
          employeeId: employee.employeeId,
          employeeName: employee.fullName,
          sectionId: section.sectionId,
          sectionName: section.name,
          taskDescription: text,
          draftKey
        });
        setTab("tasks"); setTaskFilter("active");
        setMessage("Работа создана на телефоне");
      }

      drafts.finishForm();
      setModal(null);
      await reloadLocal();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить работу.");
    } finally {
      drafts.resumeForm();
      saveInFlightRef.current = false;
      setLoading(false);
    }
  }

  return {
    modal, employeeId, sectionId, text,
    setEmployeeId: (value: string) => { drafts.editDraft("employeeId", value); setEmployeeId(value); },
    setSectionId: (value: string) => { drafts.editDraft("sectionId", value); setSectionId(value); },
    setText: (value: string) => { drafts.editDraft("text", value); setText(value); },
    close: () => setModal(null),
    openCreate, openRepeat, openEdit, save
  };
}
