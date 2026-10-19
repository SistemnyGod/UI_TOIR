import * as Crypto from "expo-crypto";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { assertDataOwnerContext, captureDataOwnerContext, type DataOwnerContext } from "@/auth/dataOwnerContext";
import { deleteWorkDraftForContext, listWorkDraftsForContext, saveWorkDraftForContext, type WorkDraftKind } from "@/db/repositories/workDraftRepository";
import { MobileEmployeeDto } from "@/domain/emu/emuTypes";
import { formatDateTime, formatShortName } from "@/features/emuTask/WorkAccountingPresentation";
import type { WorkStatusSetters } from "@/features/emuTask/workAccountingModel";
import { registerFormNavigationGuard } from "@/services/formNavigationGuard";
import { createFormDraftController } from "@/services/pointDraftController";
import type { ActionSheetItem } from "@/ui/ActionSheet";

type FormValue = Record<string, unknown>;
export type WorkForm = {
  kind: WorkDraftKind;
  entityId: string;
  key: string;
  scope: DataOwnerContext;
  value: FormValue;
  controller: ReturnType<typeof createFormDraftController<FormValue>>;
};

/**
 * The single open work form and its autosaved draft. Only one form can be
 * open at a time; opening another replaces the draft controller. Leaving the
 * screen (tab switch, app background) waits until the latest input is saved.
 */
export function useWorkDrafts({ employees, setLoading, setMessage, onShowDraftChoices, closeForms }: {
  employees: MobileEmployeeDto[];
  /** Called before the saved-drafts picker is shown, to hide the task menu. */
  onShowDraftChoices: () => void;
  /** Hides every work form modal. */
  closeForms: () => void;
} & WorkStatusSetters) {
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  // New drafts belong to the account/form, not to a global employee selection.
  // Existing employee-keyed drafts remain selectable and are never overwritten.
  const [draftChoices, setDraftChoices] = useState<ActionSheetItem[] | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [leaveFailed, setLeaveFailed] = useState(false);
  const openingDraftRef = useRef(false);
  const draftFocusRef = useRef(0);
  const workForm = useRef<WorkForm | null>(null);
  useFocusEffect(useCallback(() => {
    draftFocusRef.current++;
    return () => { draftFocusRef.current++; openingDraftRef.current = false; setDraftChoices(null); };
  }, []));

  /**
   * Runs one form opening at a time. Results that arrive after the screen
   * lost focus are dropped.
   */
  async function openExclusive(run: (isCurrent: () => boolean) => Promise<void>, errorMessage: string) {
    if (openingDraftRef.current) return;
    openingDraftRef.current = true;
    const focus = draftFocusRef.current;
    const isCurrent = () => focus === draftFocusRef.current;
    try {
      await run(isCurrent);
    } catch (error) {
      if (isCurrent()) setMessage(error instanceof Error ? error.message : errorMessage);
    } finally { if (isCurrent()) openingDraftRef.current = false; }
  }

  /** Opens a form from its only saved draft, or lets the user pick one of several. */
  async function openDraft<T>(kind: WorkDraftKind, entityId: string, open: (context: DataOwnerContext, draftKey: string, payload: T | null) => void) {
    await openExclusive(async isCurrent => {
      const owner = await captureDataOwnerContext();
      const context = owner;
      const drafts = await listWorkDraftsForContext<T>(context, kind, entityId);
      await assertDataOwnerContext(owner);
      if (!isCurrent()) return;
      const apply = async (draftKey: string, payload: T | null) => {
        try {
          await assertDataOwnerContext(owner);
          if (!isCurrent()) return;
          setDraftNotice(null);
          open(context, draftKey, payload);
        } catch (error) { if (isCurrent()) setMessage(error instanceof Error ? error.message : "Не удалось открыть черновик."); }
      };
      if (drafts.length <= 1) {
        await apply(drafts[0]?.draftKey ?? `form:${Crypto.randomUUID()}`, drafts[0]?.payload ?? null);
      } else {
        onShowDraftChoices();
        setDraftChoices([
          ...drafts.map((draft, index) => {
            const fields = draft.payload as { text?: string; comment?: string; employeeId?: string };
            const employeeName = employees.find(employee => employee.employeeId === fields.employeeId)?.fullName;
            return { label: `${index + 1}. ${employeeName ? formatShortName(employeeName) + " · " : ""}${formatDateTime(draft.updatedAt)} — ${fields.text || fields.comment || "Без текста"}`,
              icon: "document-text-outline" as const, onPress: () => { void apply(draft.draftKey, draft.payload); } };
          }),
          { label: "Открыть новую форму", icon: "add-outline", onPress: () => { void apply(`form:${Crypto.randomUUID()}`, null); } }
        ]);
      }
    }, "Не удалось прочитать черновики.");
  }

  function installDraft(kind: WorkDraftKind, entityId: string, key: string, scope: DataOwnerContext, value: FormValue) {
    workForm.current?.controller.close();
    setMessage(null); setDraftNotice(null); setLeaveFailed(false);
    const controller = createFormDraftController<FormValue>(async payload => {
      await assertDataOwnerContext(scope);
      await saveWorkDraftForContext(scope, key, kind, payload, entityId);
      setDraftNotice("Черновик сохранён");
    }, error => { setMessage(error instanceof Error ? error.message : "Не удалось сохранить черновик"); });
    workForm.current = { kind, entityId, key, scope, value, controller };
  }
  function editDraft(field: string, value: unknown) {
    const form = workForm.current;
    if (!form) return;
    form.value = { ...form.value, [field]: value };
    form.controller.update(form.value);
    setDraftNotice("Сохраняем…");
  }
  /** Closes the form only after its draft is saved; on failure the form stays open with a retry. */
  async function closeWithDraft(close: () => void) {
    const form = workForm.current;
    if (!form) { close(); return; }
    setSavingDraft(true); setLeaveFailed(false); setMessage(null);
    try {
      await form.controller.requestLeave(() => { close(); if (workForm.current === form) workForm.current = null; });
    } catch (error) {
      setLeaveFailed(true);
      setMessage(error instanceof Error ? error.message : "Черновик не сохранён. Повторите сохранение.");
    } finally { setSavingDraft(false); }
  }
  async function clearDraft() {
    const form = workForm.current;
    if (!form) return;
    setLoading(true);
    try {
      await form.controller.pause();
      await assertDataOwnerContext(form.scope);
      await deleteWorkDraftForContext(form.scope, form.key, form.kind, form.entityId);
      form.controller.close(); workForm.current = null; closeForms(); setDraftNotice(null);
    } catch (error) {
      form.controller.resume(); setMessage(error instanceof Error ? error.message : "Не удалось удалить черновик.");
    } finally { setLoading(false); }
  }
  useFocusEffect(useCallback(() => registerFormNavigationGuard(action => {
    if (!workForm.current) { action(); return; }
    void closeWithDraft(() => { closeForms(); action(); });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- registered once per focus, as before the split
  }), []));
  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => {
      if (state === "background" || state === "inactive") void workForm.current?.controller.flushUntilSettled().catch(error => setMessage(String(error)));
    });
    return () => { subscription.remove(); workForm.current?.controller.close(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- subscribed once per mount, as before the split
  }, []);

  return {
    draftNotice: savingDraft ? "Сохраняем…" : draftNotice,
    setDraftNotice,
    /** Offered on a form after a failed close: saves the draft again and closes all forms. */
    retryLeave: leaveFailed ? () => void closeWithDraft(closeForms) : undefined,
    draftChoices, closeDraftChoices: () => setDraftChoices(null),
    hasOpenForm: () => workForm.current !== null,
    currentForm: () => workForm.current,
    /** Stops autosave while the form is being submitted. */
    pauseForm: async () => { await workForm.current?.controller.pause(); },
    resumeForm: () => { workForm.current?.controller.resume(); },
    /** The form was submitted: its draft is gone with it. */
    finishForm: () => { workForm.current?.controller.close(); workForm.current = null; },
    detachForm: () => { workForm.current = null; },
    openExclusive, openDraft, installDraft, editDraft, closeWithDraft, clearDraft
  };
}
