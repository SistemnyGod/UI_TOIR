import { useRef, useState } from "react";

import { assertDataOwnerContext, type DataOwnerContext } from "@/auth/dataOwnerContext";
import { invalidateWorkDraftForContext, waitForWorkDraftForContext } from "@/db/repositories/workDraftRepository";
import { completeWorkTaskLocally, joinWorkTaskLocally, pauseWorkTaskLocally, replaceWorkTaskParticipantLocally, resumeWorkTaskLocally, startPlannedWorkLocally } from "@/db/repositories/workTaskRepository";
import { MobileEmployeeDto, WorkItemDto, WorkTaskDto } from "@/domain/emu/emuTypes";
import type { ParticipationAction } from "@/features/emuTask/WorkAccountingForms";
import { defaultEmployeeId, type TaskFilter, type WorkStatusSetters } from "@/features/emuTask/workAccountingModel";
import type { useWorkDrafts } from "@/features/emuTask/useWorkDrafts";

/**
 * Actions on an existing work: start / join / replace a participant, pause,
 * resume and complete. Start, join, replace and complete open a form with
 * its own draft; pause and resume apply at once.
 */
export function useTaskActions({ drafts, employees, reloadLocal, setTaskFilter, setMenuTask, setLoading, setMessage }: {
  drafts: ReturnType<typeof useWorkDrafts>;
  employees: MobileEmployeeDto[];
  reloadLocal: () => Promise<void>;
  setTaskFilter: (filter: TaskFilter) => void;
  setMenuTask: (task: WorkItemDto | null) => void;
} & WorkStatusSetters) {
  const [completeTask, setCompleteTask] = useState<WorkTaskDto | null>(null);
  const [completeComment, setCompleteComment] = useState("");
  const [completionDraftKey, setCompletionDraftKey] = useState("");
  const [completionDraftContext, setCompletionDraftContext] = useState<DataOwnerContext | null>(null);
  const [participationAction, setParticipationAction] = useState<ParticipationAction | null>(null);
  const [participationEmployeeId, setParticipationEmployeeId] = useState("");
  const [participationPreviousEmployeeId, setParticipationPreviousEmployeeId] = useState("");
  const [participationReason, setParticipationReason] = useState("");
  const participationSaving = useRef(false);
  const completionSaveInFlightRef = useRef(false);

  async function applyTaskAction(action: () => Promise<void>, successMessage: string, errorMessage: string) {
    setLoading(true);
    setMessage(null);
    try {
      await action();
      setMenuTask(null);
      await reloadLocal();
      setMessage(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : errorMessage);
    } finally {
      setLoading(false);
    }
  }

  async function openComplete(task: WorkTaskDto) {
    await drafts.openDraft<{ comment?: string }>("taskCompletion", task.taskId, (context, key, draft) => {
      setMenuTask(null); setCompleteTask(task);
      setCompletionDraftKey(key); setCompletionDraftContext(context); setCompleteComment(draft?.comment ?? "");
      drafts.installDraft("taskCompletion", task.taskId, key, context, { comment: draft?.comment ?? "" });
    });
  }

  async function saveCompletion() {
    if (completionSaveInFlightRef.current) return;
    if (!completeTask) {
      return;
    }

    if (!completeComment.trim()) {
      setMessage("Заполните результат работы перед завершением.");
      return;
    }

    completionSaveInFlightRef.current = true;
    setLoading(true);
    setMessage(null);
    try {
      await drafts.pauseForm();
      if (completionDraftContext && completionDraftKey) {
        invalidateWorkDraftForContext(completionDraftContext, completionDraftKey, "taskCompletion", completeTask.taskId);
        await waitForWorkDraftForContext(completionDraftContext, completionDraftKey, "taskCompletion", completeTask.taskId);
      }
      if (!completionDraftContext || !completionDraftKey) throw new Error("Форма закрыта. Откройте её заново.");
      await assertDataOwnerContext(completionDraftContext);
      await completeWorkTaskLocally(completeTask, completeComment.trim(), completionDraftKey);
      drafts.finishForm();
      setCompleteTask(null);
      setCompleteComment("");
      await reloadLocal();
      setMessage("Работа завершена на телефоне и будет отправлена на сервер.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось завершить работу.");
    } finally {
      drafts.resumeForm();
      completionSaveInFlightRef.current = false;
      setLoading(false);
    }
  }

  async function openParticipation(mode: ParticipationAction["mode"], item: WorkItemDto) {
    const kind = mode === "start" ? "workStart" : mode === "join" ? "workJoin" : "workReplace";
    await drafts.openDraft<{ employeeId?: string; previousEmployeeId?: string; reason?: string }>(kind, item.itemId, (context, key, draft) => {
      const employeeId = draft?.employeeId ?? defaultEmployeeId(employees);
      const previousEmployeeId = draft?.previousEmployeeId ?? "";
      const reason = draft?.reason ?? "";
      setParticipationEmployeeId(employeeId); setParticipationPreviousEmployeeId(previousEmployeeId); setParticipationReason(reason);
      setMenuTask(null); setParticipationAction({ mode, item });
      drafts.installDraft(kind, item.itemId, key, context, { employeeId, previousEmployeeId, reason });
    });
  }

  async function saveParticipation() {
    if (participationSaving.current) return;
    if (!participationAction) {
      return;
    }
    const employee = employees.find((item) => item.employeeId === participationEmployeeId);
    if (!employee) {
      setMessage("Выберите фактического исполнителя.");
      return;
    }
    if (participationAction.mode === "replace" && (!participationPreviousEmployeeId || !participationReason.trim())) {
      setMessage("Выберите прежнего исполнителя и укажите причину замены.");
      return;
    }

    participationSaving.current = true;
    setLoading(true);
    setMessage(null);
    try {
      const form = drafts.currentForm();
      if (!form) throw new Error("Откройте форму заново.");
      await form.controller.pause();
      await assertDataOwnerContext(form.scope);
      if (form.kind !== "workStart" && form.kind !== "workJoin" && form.kind !== "workReplace") throw new Error("Форма изменилась. Откройте её заново.");
      const draft = { key: form.key, kind: form.kind, entityId: form.entityId };
      if (participationAction.mode === "start") {
        await startPlannedWorkLocally(participationAction.item, employee, draft);
      } else if (participationAction.mode === "join") {
        await joinWorkTaskLocally(participationAction.item, employee, participationReason, draft);
      } else {
        await replaceWorkTaskParticipantLocally(
          participationAction.item,
          participationPreviousEmployeeId,
          employee,
          participationReason, draft
        );
      }
      form.controller.close(); drafts.detachForm();
      setParticipationAction(null);
      await reloadLocal();
      setTaskFilter("active");
      setMessage("Действие сохранено на телефоне и будет отправлено в ЭМУ.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось изменить исполнителя работы.");
    } finally {
      participationSaving.current = false; drafts.resumeForm();
      setLoading(false);
    }
  }

  return {
    completion: {
      task: completeTask, comment: completeComment,
      setComment: (value: string) => { drafts.editDraft("comment", value); setCompleteComment(value); },
      close: () => setCompleteTask(null),
      open: openComplete, save: saveCompletion
    },
    participation: {
      action: participationAction, employeeId: participationEmployeeId, previousEmployeeId: participationPreviousEmployeeId, reason: participationReason,
      setEmployeeId: (value: string) => { drafts.editDraft("employeeId", value); setParticipationEmployeeId(value); },
      setPreviousEmployeeId: (value: string) => { drafts.editDraft("previousEmployeeId", value); setParticipationPreviousEmployeeId(value); },
      setReason: (value: string) => { drafts.editDraft("reason", value); setParticipationReason(value); },
      close: () => setParticipationAction(null),
      open: openParticipation, save: saveParticipation
    },
    pause: (task: Parameters<typeof pauseWorkTaskLocally>[0]) => applyTaskAction(() => pauseWorkTaskLocally(task, ""), "Работа поставлена на паузу.", "Не удалось поставить работу на паузу."),
    resume: (task: Parameters<typeof resumeWorkTaskLocally>[0]) => applyTaskAction(() => resumeWorkTaskLocally(task, ""), "Работа продолжена.", "Не удалось продолжить работу."),
    /** The card's primary «Продолжить» button uses its own wording. */
    resumeFromCard: (task: Parameters<typeof resumeWorkTaskLocally>[0]) => applyTaskAction(() => resumeWorkTaskLocally(task, "Продолжение работы"), "Работа продолжена", "Не удалось продолжить")
  };
}
