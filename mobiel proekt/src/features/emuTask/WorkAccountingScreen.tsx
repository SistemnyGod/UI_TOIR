import { TaskModal, RemarkModal, CompleteTaskModal, ParticipationModal, type ParticipationAction, type RemarkAttachmentAfterSave } from './WorkAccountingForms';
import { TaskMenu, getTaskPrimaryAction } from './WorkTaskActions';
import { needsRetainedPage, compareWorkRows, compareRemarkRows } from '@/sync/retainedListWindow';
import { TransientNotice } from "@/ui/TransientNotice";
import { useStableListAnchor } from "@/ui/useStableListAnchor";
import { createFormDraftController } from "@/services/pointDraftController";
import { registerFormNavigationGuard } from "@/services/formNavigationGuard";

import * as Crypto from "expo-crypto";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, FlatList, Pressable, Text, View } from "react-native";

import { createShiftRemarkLocally, listShiftRemarksPage, ShiftRemark } from "@/db/repositories/shiftRemarkRepository";
import { completeWorkTaskLocally, createRepeatWorkDraft, createWorkTaskLocally, joinWorkTaskLocally, getWorkListVisibleLimit, listEmuSections, listLocalWorkItemsPage, listMobileEmployees, pauseWorkTaskLocally, replaceWorkTaskParticipantLocally, resumeWorkTaskLocally, setWorkListVisibleLimit, startPlannedWorkLocally, updateWorkTaskLocally } from "@/db/repositories/workTaskRepository";
import { MobileEmployeeDto, MobileEmuSectionDto, WorkItemDto, WorkTaskDto } from "@/domain/emu/emuTypes";
import type { LocalWorkItemsFilter } from "@/db/repositories/workTaskRepository";

import { formatDateTime, formatShortName, remarkStatusLabel, remarkStatusTone, useWorkAccountingStyles } from "@/features/emuTask/WorkAccountingPresentation";
import { WorkTaskCard } from "@/features/emuTask/WorkTaskCard";
import { useAppTheme } from "@/features/settings/themePreference";
import { attachRemarkMediaFromGallery, attachRemarkPhotoFromCamera, attachRemarkVideoFromCamera, attachWorkMediaFromGallery, attachWorkPhotoFromCamera, attachWorkVideoFromCamera } from "@/services/mediaAttachmentService";
import { loadMoreWorkItems, loadWorkItemsOfflineFirst } from "@/services/workTaskService";
import { logMobileError } from "@/services/mobileErrorReporter";
import { subscribeToSyncEvents } from "@/sync/syncEvents";
import { assertDataOwnerContext, captureDataOwnerContext, type DataOwnerContext } from "@/auth/dataOwnerContext";
import { deleteWorkDraftForContext, invalidateWorkDraftForContext, listWorkDraftsForContext, type WorkDraftKind, saveWorkDraftForContext, waitForWorkDraftForContext } from "@/db/repositories/workDraftRepository";
import { retainEqualItems } from "@/sync/retainEqualItems";
import { repeatWorkDroppedNotice } from "@/domain/emu/repeatWorkPolicy";
import { ActionSheet, type ActionSheetItem } from "@/ui/ActionSheet";

import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";

type WorkTab = "tasks" | "remarks";
type TaskFilter = "active" | "history";

type RemarkAttachmentTarget = { remarkId: string; title: string } | null;

function listScope(kind: "tasks" | "remarks", contextKey: string) {
  return `local:${kind}:${contextKey}`;
}

export function WorkAccountingScreen() {
  const styles = useWorkAccountingStyles();
  const { colors } = useAppTheme();
  const [tab, setTab] = useState<WorkTab>("tasks");
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("active");
  const [tasks, setTasks] = useState<WorkItemDto[]>([]);
  const [remarks, setRemarks] = useState<ShiftRemark[]>([]);
  const [taskHasMore, setTaskHasMore] = useState(true);
  const [remarkHasMore, setRemarkHasMore] = useState(true);
  const [employees, setEmployees] = useState<MobileEmployeeDto[]>([]);
  const [sections, setSections] = useState<MobileEmuSectionDto[]>([]);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [taskModal, setTaskModal] = useState<{ mode: "create" | "edit"; task?: WorkTaskDto; repeated?: boolean } | null>(null);
  const [remarkModalOpen, setRemarkModalOpen] = useState(false);
  const [menuTask, setMenuTask] = useState<WorkItemDto | null>(null);
  const [completeTask, setCompleteTask] = useState<WorkTaskDto | null>(null);
  const [completeComment, setCompleteComment] = useState("");
  const [taskDraftKey, setTaskDraftKey] = useState("");
  const [remarkDraftKey, setRemarkDraftKey] = useState("");
  const [completionDraftKey, setCompletionDraftKey] = useState("");
  const [taskDraftContext, setTaskDraftContext] = useState<DataOwnerContext | null>(null);
  const [remarkDraftContext, setRemarkDraftContext] = useState<DataOwnerContext | null>(null);
  const [completionDraftContext, setCompletionDraftContext] = useState<DataOwnerContext | null>(null);
  const [taskEmployeeId, setTaskEmployeeId] = useState("");
  const [taskSectionId, setTaskSectionId] = useState("");
  const [taskText, setTaskText] = useState("");
  const [remarkEmployeeId, setRemarkEmployeeId] = useState("");
  const [remarkSectionId, setRemarkSectionId] = useState("");
  const [remarkComment, setRemarkComment] = useState("");
  const [remarkAttachmentAfterSave, setRemarkAttachmentAfterSave] = useState<RemarkAttachmentAfterSave>("later");
  const [participationAction, setParticipationAction] = useState<ParticipationAction | null>(null);
  const [participationEmployeeId, setParticipationEmployeeId] = useState("");
  const [participationPreviousEmployeeId, setParticipationPreviousEmployeeId] = useState("");
  const [participationReason, setParticipationReason] = useState("");
  const [attachmentTask, setAttachmentTask] = useState<WorkItemDto | null>(null);
  const [attachmentRemark, setAttachmentRemark] = useState<RemarkAttachmentTarget>(null);
  const listContextRef = useRef<string | null>(null);
  const taskCursorRef = useRef<string | null>(null);
  const remarkCursorRef = useRef<string | null>(null);
  const tasksRef = useRef<WorkItemDto[]>([]);
  const remarksRef = useRef<ShiftRemark[]>([]);
  const listGenerationRef = useRef(0);
  const listFocusedRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const pendingReloadRef = useRef(false);
  const hasLoadedListRef = useRef(false);
  const localReloadRef = useRef<object | null>(null);
  const reloadLocalRef = useRef<(reset?: boolean) => Promise<void>>(async () => undefined);
  const drainReload = useCallback(() => {
    if (!listFocusedRef.current || !pendingReloadRef.current) return;
    pendingReloadRef.current = false;
    void reloadLocalRef.current().catch(error => {
      if (listFocusedRef.current) setRefreshError("Показаны сохранённые данные. Обновление с сервера не удалось.");
      void logMobileError("emu.work-accounting.deferred-refresh.failed", error);
    });
  }, []);

  const reloadLocal = useCallback(async (reset = false) => {
    if (!listFocusedRef.current) return;
    if (!reset && (loadingMoreRef.current || localReloadRef.current)) {
      pendingReloadRef.current = true;
      return;
    }
    const operation = {};
    localReloadRef.current = operation;
    try {
      const generation = ++listGenerationRef.current;
      loadingMoreRef.current = false;
      setLoadingMore(false);
      const ownerContext = await captureDataOwnerContext();
      const contextKey = `${ownerContext.ownerUserId}:${ownerContext.contourId}:${taskFilter}:account`;
      const contextChanged = listContextRef.current !== contextKey;
      const shouldReset = reset || contextChanged;
      if (!listFocusedRef.current || generation !== listGenerationRef.current) return;
      if (shouldReset) {
        taskCursorRef.current = null;
        remarkCursorRef.current = null;
        listContextRef.current = contextKey;
      }
      const taskListScope = listScope("tasks", contextKey);
      const remarkListScope = listScope("remarks", contextKey);
      const [storedTaskLimit, storedRemarkLimit] = shouldReset
        ? await Promise.all([getWorkListVisibleLimit(taskListScope), getWorkListVisibleLimit(remarkListScope)])
        : [tasksRef.current.length, remarksRef.current.length];
      const targetTaskCount = shouldReset ? storedTaskLimit : tasksRef.current.length;
      const targetRemarkCount = shouldReset ? storedRemarkLimit : remarksRef.current.length;
      const taskBoundary = shouldReset ? undefined : tasksRef.current.at(-1);
      const remarkBoundary = shouldReset ? undefined : remarksRef.current.at(-1);
      const localFilter: LocalWorkItemsFilter = taskFilter;
      const localEmployeeId = null;
      let taskPage = await listLocalWorkItemsPage(25, null, localFilter, localEmployeeId);
      await assertDataOwnerContext(ownerContext);
      const loadedTasks = [...taskPage.items];
      while (needsRetainedPage(loadedTasks, targetTaskCount, taskBoundary, compareWorkRows) && taskPage.nextCursor) {
        taskPage = await listLocalWorkItemsPage(25, taskPage.nextCursor, localFilter, localEmployeeId);
        await assertDataOwnerContext(ownerContext);
        loadedTasks.push(...taskPage.items);
      }
      let remarkPage = await listShiftRemarksPage(25, null);
      await assertDataOwnerContext(ownerContext);
      const loadedRemarks = [...remarkPage.items];
      while (needsRetainedPage(loadedRemarks, targetRemarkCount, remarkBoundary, compareRemarkRows) && remarkPage.nextCursor) {
        remarkPage = await listShiftRemarksPage(25, remarkPage.nextCursor);
        await assertDataOwnerContext(ownerContext);
        loadedRemarks.push(...remarkPage.items);
      }
      const [nextEmployees, nextSections] = await Promise.all([
        listMobileEmployees(),
        listEmuSections()
      ]);
      await assertDataOwnerContext(ownerContext);
      if (!listFocusedRef.current || generation !== listGenerationRef.current) return;
      hasLoadedListRef.current = true;
      tasksRef.current = loadedTasks;
      remarksRef.current = loadedRemarks;
      setTasks(previous => retainEqualItems(previous, loadedTasks, item => item.itemId));
      setRemarks(previous => retainEqualItems(previous, loadedRemarks, item => item.remarkId));
      taskCursorRef.current = taskPage.nextCursor;
      remarkCursorRef.current = remarkPage.nextCursor;
      // A local page can end while the server still has an older page. Keep the
      // continuation action available until that server boundary is checked.
      setTaskHasMore(Boolean(taskPage.nextCursor) || loadedTasks.length === targetTaskCount);
      setRemarkHasMore(Boolean(remarkPage.nextCursor));
      await Promise.all([
        setWorkListVisibleLimit(taskListScope, loadedTasks.length),
        setWorkListVisibleLimit(remarkListScope, loadedRemarks.length)
      ]);
      await assertDataOwnerContext(ownerContext);
      if (generation !== listGenerationRef.current) return;
      setEmployees(previous => retainEqualItems(previous, nextEmployees, item => item.employeeId));
      setSections(previous => retainEqualItems(previous, nextSections, item => item.sectionId));
      setRefreshError(null);
    } finally {
      if (localReloadRef.current === operation) {
        localReloadRef.current = null;
        drainReload();
      }
    }
  }, [drainReload, taskFilter]);
  useEffect(() => { reloadLocalRef.current = reloadLocal; }, [reloadLocal]);

  useFocusEffect(useCallback(() => subscribeToSyncEvents((event) => {
    if (!event.snapshotRefreshed && !event.refreshedZones?.includes("workItems")) {
      return;
    }

    void reloadLocal()
      .catch((error) => {
        void logMobileError("emu.work-accounting.sync-refresh.failed", error);
        setRefreshError("Показаны сохранённые данные. Обновление с сервера не удалось.");
      });
  }), [reloadLocal]));
  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      listFocusedRef.current = true;
      setLoadingMore(false);
      setLoading(!hasLoadedListRef.current);

      const handleRefreshSuccess = async () => {
        if (!isMounted) return;
        await reloadLocal();
        if (isMounted) {
          setRefreshError(null);
        }
      };
      const handleRefreshFailure = () => {
        if (isMounted) {
          setRefreshError("Показаны сохранённые данные. Обновление с сервера не удалось.");
        }
      };

      void loadWorkItemsOfflineFirst(handleRefreshSuccess, handleRefreshFailure, null, taskFilter)
        .then(() => { if (isMounted) return reloadLocal(); })
        .then(() => {
          if (isMounted) setMessage(null);
        })
        .finally(() => {
          if (isMounted) {
            setLoading(false);
          }
        });

      return () => {
        isMounted = false;
        listFocusedRef.current = false;
        listGenerationRef.current++;
        loadingMoreRef.current = false;
        pendingReloadRef.current = false;
      };
    }, [reloadLocal, taskFilter])
  );

  // New drafts belong to the account/form, not to a global employee selection.
  // Existing employee-keyed drafts remain selectable and are never overwritten.
  const [draftChoices, setDraftChoices] = useState<ActionSheetItem[] | null>(null);
  const openingDraftRef = useRef(false);
  const draftFocusRef = useRef(0);
  useFocusEffect(useCallback(() => {
    draftFocusRef.current++;
    return () => { draftFocusRef.current++; openingDraftRef.current = false; setDraftChoices(null); };
  }, []));

  async function openDraft<T>(kind: WorkDraftKind, entityId: string, open: (context: DataOwnerContext, draftKey: string, payload: T | null) => void) {
    if (openingDraftRef.current) return;
    openingDraftRef.current = true;
    const focus = draftFocusRef.current;
    try {
      const owner = await captureDataOwnerContext();
      const context = owner;
      const drafts = await listWorkDraftsForContext<T>(context, kind, entityId);
      await assertDataOwnerContext(owner);
      if (focus !== draftFocusRef.current) return;
      const apply = async (draftKey: string, payload: T | null) => {
        try {
          await assertDataOwnerContext(owner);
          if (focus !== draftFocusRef.current) return;
          setDraftNotice(null);
          open(context, draftKey, payload);
        } catch (error) { if (focus === draftFocusRef.current) setMessage(error instanceof Error ? error.message : "Не удалось открыть черновик."); }
      };
      if (drafts.length <= 1) {
        await apply(drafts[0]?.draftKey ?? `form:${Crypto.randomUUID()}`, drafts[0]?.payload ?? null);
      } else {
        setMenuTask(null);
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
    } catch (error) {
      if (focus === draftFocusRef.current) setMessage(error instanceof Error ? error.message : "Не удалось прочитать черновики.");
    } finally { if (focus === draftFocusRef.current) openingDraftRef.current = false; }
  }

  async function openCreateTask() {
    await openDraft<{ sectionId?: string; text?: string; employeeId?: string }>("task", "new", (context, key, draft) => {
      setTaskEmployeeId(draft?.employeeId ?? defaultEmployeeId());
      setTaskDraftKey(key); setTaskDraftContext(context);
      setTaskSectionId(draft?.sectionId ?? defaultSectionId());
      setTaskText(draft?.text ?? ""); setTaskModal({ mode: "create" });
      installDraft("task", "new", key, context, { employeeId: draft?.employeeId ?? defaultEmployeeId(), sectionId: draft?.sectionId ?? defaultSectionId(), text: draft?.text ?? "" });
    });
  }

  // A repeat always opens its own new draft; it never reuses or overwrites a
  // saved "Создать работу" draft.
  async function openRepeatTask(item: WorkItemDto) {
    if (openingDraftRef.current) return;
    openingDraftRef.current = true;
    const focus = draftFocusRef.current;
    try {
      const context = await captureDataOwnerContext();
      const repeat = await createRepeatWorkDraft(context, item.itemId);
      await assertDataOwnerContext(context);
      if (focus !== draftFocusRef.current) return;
      setMenuTask(null);
      setTaskEmployeeId(repeat.payload.employeeId); setTaskSectionId(repeat.payload.sectionId); setTaskText(repeat.payload.text);
      setTaskDraftKey(repeat.draftKey); setTaskDraftContext(context);
      setTaskModal({ mode: "create", repeated: true });
      installDraft("task", "new", repeat.draftKey, context, { ...repeat.payload });
      setDraftNotice(repeatWorkDroppedNotice(repeat.dropped));
    } catch (error) {
      if (focus === draftFocusRef.current) setMessage(error instanceof Error ? error.message : "Не удалось повторить работу.");
    } finally { if (focus === draftFocusRef.current) openingDraftRef.current = false; }
  }

  async function openEditTask(task: WorkTaskDto) {
    await openDraft<{ sectionId?: string; text?: string; employeeId?: string }>("task", task.taskId, (context, key, draft) => {
      setTaskEmployeeId(draft?.employeeId ?? task.employeeId ?? defaultEmployeeId());
      setTaskDraftKey(key); setTaskDraftContext(context);
      setTaskSectionId(draft?.sectionId ?? task.sectionId ?? defaultSectionId());
      setTaskText(draft?.text ?? task.title); setMenuTask(null); setTaskModal({ mode: "edit", task });
      installDraft("task", task.taskId, key, context, { employeeId: draft?.employeeId ?? task.employeeId ?? defaultEmployeeId(), sectionId: draft?.sectionId ?? task.sectionId ?? defaultSectionId(), text: draft?.text ?? task.title });
    });
  }

  async function openCompleteTask(task: WorkTaskDto) {
    await openDraft<{ comment?: string }>("taskCompletion", task.taskId, (context, key, draft) => {
      setMenuTask(null); setCompleteTask(task);
      setCompletionDraftKey(key); setCompletionDraftContext(context); setCompleteComment(draft?.comment ?? "");
      installDraft("taskCompletion", task.taskId, key, context, { comment: draft?.comment ?? "" });
    });
  }

  async function openCreateRemark() {
    await openDraft<{ sectionId?: string; comment?: string; employeeId?: string; attachmentAfterSave?: RemarkAttachmentAfterSave }>("remark", "new", (context, key, draft) => {
      setRemarkEmployeeId(draft?.employeeId ?? defaultEmployeeId());
      setRemarkDraftKey(key); setRemarkDraftContext(context);
      setRemarkSectionId(draft?.sectionId ?? defaultSectionId()); setRemarkComment(draft?.comment ?? "");
      setRemarkAttachmentAfterSave(draft?.attachmentAfterSave ?? "later"); setRemarkModalOpen(true);
      installDraft("remark", "new", key, context, { employeeId: draft?.employeeId ?? defaultEmployeeId(), sectionId: draft?.sectionId ?? defaultSectionId(), comment: draft?.comment ?? "", attachmentAfterSave: draft?.attachmentAfterSave ?? "later" });
    });
  }

  type FormValue = Record<string, unknown>;
  const workForm = useRef<{ kind: WorkDraftKind; entityId: string; key: string; scope: DataOwnerContext; value: FormValue; controller: ReturnType<typeof createFormDraftController<FormValue>> } | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [leaveFailed, setLeaveFailed] = useState(false);
  const participationSaving = useRef(false);
  const taskSaveInFlightRef = useRef(false);
  const remarkSaveInFlightRef = useRef(false);
  const completionSaveInFlightRef = useRef(false);

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
  function closeModal() {
    setTaskModal(null); setRemarkModalOpen(false); setCompleteTask(null); setParticipationAction(null);
  }
  async function closeWithDraft(_flush: unknown, close: () => void) {
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
  const flushTaskDraft = () => workForm.current?.controller.flushUntilSettled();
  const flushRemarkDraft = flushTaskDraft;
  const flushCompletionDraft = flushTaskDraft;
  async function clearDraft() {
    const form = workForm.current;
    if (!form) return;
    setLoading(true);
    try {
      await form.controller.pause();
      await assertDataOwnerContext(form.scope);
      await deleteWorkDraftForContext(form.scope, form.key, form.kind, form.entityId);
      form.controller.close(); workForm.current = null; closeModal(); setDraftNotice(null);
    } catch (error) {
      form.controller.resume(); setMessage(error instanceof Error ? error.message : "Не удалось удалить черновик.");
    } finally { setLoading(false); }
  }
  const clearTaskDraft = clearDraft;
  const clearRemarkDraft = clearDraft;
  const clearCompletionDraft = clearDraft;
  useFocusEffect(useCallback(() => registerFormNavigationGuard(action => {
    if (!workForm.current) { action(); return; }
    void closeWithDraft(null, () => { closeModal(); action(); });
  }), []));
  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => {
      if (state === "background" || state === "inactive") void workForm.current?.controller.flushUntilSettled().catch(error => setMessage(String(error)));
    });
    return () => { subscription.remove(); workForm.current?.controller.close(); };
  }, []);

  async function handleSaveTask() {
    if (taskSaveInFlightRef.current) return;
    const employee = employees.find((item) => item.employeeId === taskEmployeeId);
    const section = sections.find((item) => item.sectionId === taskSectionId);
    if (!employee || !section || !taskText.trim()) {
      setMessage("Выберите сотрудника, участок и заполните задачу.");
      return;
    }

    taskSaveInFlightRef.current = true;
    setLoading(true);
    setMessage(null);
    try {
      await workForm.current?.controller.pause();
      if (taskDraftContext && taskDraftKey) {
        invalidateWorkDraftForContext(taskDraftContext, taskDraftKey, "task", taskModal?.mode === "edit" ? taskModal.task?.taskId : "new");
        await waitForWorkDraftForContext(taskDraftContext, taskDraftKey, "task", taskModal?.mode === "edit" ? taskModal.task?.taskId : "new");
      }
      if (!taskDraftContext || !taskDraftKey) throw new Error("Форма закрыта. Откройте её заново.");
      await assertDataOwnerContext(taskDraftContext);
      if (taskModal?.mode === "edit" && taskModal.task) {
        await updateWorkTaskLocally({
          task: taskModal.task,
          sectionId: section.sectionId,
          sectionName: section.name,
          taskDescription: taskText,
          draftKey: taskDraftKey
        });
        setMessage("Изменение работы сохранено на телефоне и будет отправлено на сервер.");
      } else {
        await createWorkTaskLocally({
          employeeId: employee.employeeId,
          employeeName: employee.fullName,
          sectionId: section.sectionId,
          sectionName: section.name,
          taskDescription: taskText,
          draftKey: taskDraftKey
        });
        setTab("tasks"); setTaskFilter("active");
        setMessage("Работа создана на телефоне");
      }

      workForm.current?.controller.close(); workForm.current = null;
      setTaskModal(null);
      await reloadLocal();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить работу.");
    } finally {
      workForm.current?.controller.resume();
      taskSaveInFlightRef.current = false;
      setLoading(false);
    }
  }

  async function handleLoadMore() {
    if (!listFocusedRef.current || loadingMoreRef.current || loadingMore || localReloadRef.current) return;
    if (tab === "remarks" && !remarkHasMore) return;
    if (tab === "tasks" && !taskHasMore && !taskCursorRef.current) return;
    loadingMoreRef.current = true;
    const generation = listGenerationRef.current;
    if (tab === "remarks") {
      setLoadingMore(true);
      try {
        const page = await listShiftRemarksPage(25, remarkCursorRef.current);
        if (generation !== listGenerationRef.current) return;
        const existingIds = new Set(remarksRef.current.map(item => item.remarkId));
        const additions = page.items.filter(item => !existingIds.has(item.remarkId));
        remarksRef.current = [...remarksRef.current, ...additions];
        setRemarks(remarksRef.current);
        const contextKey = listContextRef.current;
        if (contextKey) void setWorkListVisibleLimit(listScope("remarks", contextKey), remarksRef.current.length);
        remarkCursorRef.current = page.nextCursor;
        setRemarkHasMore(Boolean(page.nextCursor));
      } catch (error) {
        if (generation === listGenerationRef.current) setRefreshError(error instanceof Error ? error.message : "Не удалось загрузить следующие замечания.");
      } finally {
        if (generation === listGenerationRef.current) { loadingMoreRef.current = false; setLoadingMore(false); drainReload(); }
      }
      return;
    }
    setLoadingMore(true);
    try {
      const scope = taskFilter === "history" ? "history" : "active";
      const employeeId = null;
      const localFilter: LocalWorkItemsFilter = taskFilter;
      // Consume already cached rows first. Offline mode must never wait for
      // the network before exposing a page that is already on the device.
      let page = await listLocalWorkItemsPage(25, taskCursorRef.current, localFilter, employeeId);
      if (generation !== listGenerationRef.current) return;
      let added = page.items;
      let serverNext: string | null = null;
      const knownBefore = new Set(tasksRef.current.map(item => item.itemId));
      const firstPageHasNewRows = added.some(item => !knownBefore.has(item.itemId));
      if (!firstPageHasNewRows && !page.nextCursor) {
        serverNext = await loadMoreWorkItems(scope, employeeId);
        if (generation !== listGenerationRef.current) return;
        const known = new Set(tasksRef.current.map(item => item.itemId));
        const collected: WorkItemDto[] = [];
        let cursor: string | null = null;
        do {
          page = await listLocalWorkItemsPage(25, cursor, localFilter, employeeId);
          if (generation !== listGenerationRef.current) return;
          for (const item of page.items) if (!known.has(item.itemId)) collected.push(item);
          cursor = page.nextCursor;
        } while (collected.length < 25 && cursor);
        added = collected.slice(0, 25);
        // A confirmed end is list state, never a form error or a notification.
      }
      if (added.length > 0) {
        const known = new Set(tasksRef.current.map(item => item.itemId));
        const unique = added.filter(item => !known.has(item.itemId));
        if (unique.length) {
          tasksRef.current = [...tasksRef.current, ...unique];
          setTasks(tasksRef.current);
          const contextKey = listContextRef.current;
          if (contextKey) void setWorkListVisibleLimit(listScope("tasks", contextKey), tasksRef.current.length);
        }
      }
      taskCursorRef.current = page.nextCursor;
      setTaskHasMore(Boolean(page.nextCursor) || added.length > 0 || Boolean(serverNext));
    } catch (error) {
      if (generation === listGenerationRef.current) setRefreshError(error instanceof Error ? error.message : "Не удалось загрузить следующую страницу работ.");
    } finally {
      if (generation === listGenerationRef.current) { loadingMoreRef.current = false; setLoadingMore(false); drainReload(); }
    }
  }

  async function handleSaveRemark() {
    if (remarkSaveInFlightRef.current) return;
    const employee = employees.find((item) => item.employeeId === remarkEmployeeId);
    const section = sections.find((item) => item.sectionId === remarkSectionId);
    if (!employee || !section || !remarkComment.trim()) {
      setMessage("Выберите сотрудника, участок и заполните описание замечания.");
      return;
    }

    remarkSaveInFlightRef.current = true;
    setLoading(true);
    setMessage(null);
    try {
      await workForm.current?.controller.pause();
      if (remarkDraftContext && remarkDraftKey) {
        invalidateWorkDraftForContext(remarkDraftContext, remarkDraftKey, "remark");
        await waitForWorkDraftForContext(remarkDraftContext, remarkDraftKey, "remark");
      }
      if (!remarkDraftContext || !remarkDraftKey) throw new Error("Форма закрыта. Откройте её заново.");
      await assertDataOwnerContext(remarkDraftContext);
      const remarkId = await createShiftRemarkLocally({
        comment: remarkComment,
        sectionId: section.sectionId,
        sectionName: section.name,
        employeeId: employee.employeeId,
        employeeName: employee.fullName,
        draftKey: remarkDraftKey
      });
      workForm.current?.controller.close(); workForm.current = null;
      setRemarkModalOpen(false);
      await reloadLocal();
      setTab("remarks");
      setMessage("Замечание сохранено на телефоне");

      if (remarkAttachmentAfterSave === "now") {
        setAttachmentRemark({ remarkId, title: section.name });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить замечание.");
    } finally {
      workForm.current?.controller.resume();
      remarkSaveInFlightRef.current = false;
      setLoading(false);
    }
  }

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

  async function handleCompleteTask() {
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
      await workForm.current?.controller.pause();
      if (completionDraftContext && completionDraftKey) {
        invalidateWorkDraftForContext(completionDraftContext, completionDraftKey, "taskCompletion", completeTask.taskId);
        await waitForWorkDraftForContext(completionDraftContext, completionDraftKey, "taskCompletion", completeTask.taskId);
      }
      if (!completionDraftContext || !completionDraftKey) throw new Error("Форма закрыта. Откройте её заново.");
      await assertDataOwnerContext(completionDraftContext);
      await completeWorkTaskLocally(completeTask, completeComment.trim(), completionDraftKey);
      workForm.current?.controller.close(); workForm.current = null;
      setCompleteTask(null);
      setCompleteComment("");
      await reloadLocal();
      setMessage("Работа завершена на телефоне и будет отправлена на сервер.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось завершить работу.");
    } finally {
      workForm.current?.controller.resume();
      completionSaveInFlightRef.current = false;
      setLoading(false);
    }
  }

  function defaultEmployeeId() {
    return employees.length === 1 ? employees[0].employeeId : "";
  }

  function defaultSectionId() {
    return sections[0]?.sectionId ?? "";
  }

  const filteredTasks = tasks;
  const visibleRemarks = remarks;
  const listAnchor = useStableListAnchor(tab === 'tasks' ? tasks.map(item => item.itemId) : remarks.map(item => item.remarkId));

  async function openParticipationAction(mode: ParticipationAction["mode"], item: WorkItemDto) {
    const kind = mode === "start" ? "workStart" : mode === "join" ? "workJoin" : "workReplace";
    await openDraft<{ employeeId?: string; previousEmployeeId?: string; reason?: string }>(kind, item.itemId, (context, key, draft) => {
      const employeeId = draft?.employeeId ?? defaultEmployeeId();
      const previousEmployeeId = draft?.previousEmployeeId ?? "";
      const reason = draft?.reason ?? "";
      setParticipationEmployeeId(employeeId); setParticipationPreviousEmployeeId(previousEmployeeId); setParticipationReason(reason);
      setMenuTask(null); setParticipationAction({ mode, item });
      installDraft(kind, item.itemId, key, context, { employeeId, previousEmployeeId, reason });
    });
  }

  async function handleParticipationAction() {
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
      const form = workForm.current;
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
      form.controller.close(); workForm.current = null;
      setParticipationAction(null);
      await reloadLocal();
      setTaskFilter("active");
      setMessage("Действие сохранено на телефоне и будет отправлено в ЭМУ.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось изменить исполнителя работы.");
    } finally {
      participationSaving.current = false; workForm.current?.controller.resume();
      setLoading(false);
    }
  }

  async function handleAttachWorkMedia(kind: "photo" | "video" | "gallery") {
    const workTaskId = attachmentTask?.workSessionId ?? attachmentTask?.itemId ?? null;
    if (!workTaskId || attachmentTask?.kind === "planTask") {
      setMessage("Сначала начните работу, затем добавьте вложения.");
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      if (kind === "photo") {
        await attachWorkPhotoFromCamera(workTaskId);
        setMessage("Фото сохранено на телефоне и будет отправлено в ЭМУ.");
      } else if (kind === "video") {
        await attachWorkVideoFromCamera(workTaskId);
        setMessage("Видео сохранено на телефоне и будет отправлено в ЭМУ.");
      } else {
        const result = await attachWorkMediaFromGallery(workTaskId);
        if (result.status === "attached") {
          const suffix = result.errors.length ? ` Отклонено: ${result.errors.join("; ")}` : "";
          setMessage(`Добавлено вложений: ${result.attachedCount}. Фото: ${result.photoCount}, видео: ${result.videoCount}.${suffix}`);
        }
      }
      setAttachmentTask(null);
      await reloadLocal();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось добавить вложение к работе.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAttachRemarkMedia(kind: "photo" | "video" | "gallery") {
    if (!attachmentRemark) {
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      if (kind === "photo") {
        await attachRemarkPhotoFromCamera(attachmentRemark.remarkId);
        setMessage("Фото замечания сохранено на телефоне и будет отправлено на сервер.");
      } else if (kind === "video") {
        await attachRemarkVideoFromCamera(attachmentRemark.remarkId);
        setMessage("Видео замечания сохранено на телефоне и будет отправлено на сервер.");
      } else {
        const result = await attachRemarkMediaFromGallery(attachmentRemark.remarkId);
        if (result.status === "attached") {
          const suffix = result.errors.length ? ` Отклонено: ${result.errors.join("; ")}` : "";
          setMessage(`Добавлено вложений к замечанию: ${result.attachedCount}. Фото: ${result.photoCount}, видео: ${result.videoCount}.${suffix}`);
        }
      }
      setAttachmentRemark(null);
      await reloadLocal();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось добавить вложение к замечанию.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen compactHeader plainBackground scroll={false} title="" bottomActionBackground="transparent"
      floatingNotice={<TransientNotice message={taskModal || remarkModalOpen || completeTask || participationAction ? null : message ?? refreshError} />}
      bottomAction={<View style={{ alignItems: "center" }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Создать работу или замечание"
          accessibilityState={{ disabled: loading }} disabled={loading} onPress={() => setCreateMenuOpen(true)}
          style={({ pressed }) => ({ width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center",
            backgroundColor: loading ? colors.disabled : pressed ? colors.primaryPressed : colors.primary })}>
          <Ionicons name="add" size={28} color={loading ? colors.disabledText : colors.onPrimary} />
        </Pressable>
      </View>}>
      <View style={{ paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Text style={styles.helperText}>{tab === "remarks" ? "Замечания" : taskFilter === "history" ? "История работ" : "Активные работы"}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Настроить фильтр" onPress={() => setFilterMenuOpen(true)}
          style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="options-outline" size={24} color={colors.primary} />
        </Pressable>
      </View>
      <FlatList<WorkItemDto | ShiftRemark>
        maintainVisibleContentPosition={listAnchor}
        contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 13 }}
        data={tab === "tasks" ? filteredTasks : visibleRemarks}
        keyExtractor={(item) => tab === "tasks" ? (item as WorkItemDto).itemId : (item as ShiftRemark).remarkId}
        ListEmptyComponent={<EmptyCard title={tab === "tasks" ? "Работ нет" : "Замечаний нет"} text={tab === "tasks" ? "Создайте работу на телефоне или дождитесь назначения из ЭМУ." : "Добавьте замечание по смене, участку и приложите фото при необходимости."} />}
        ListFooterComponent={(tab === "tasks" ? filteredTasks.length : visibleRemarks.length) > 0 && (tab === "tasks" ? taskHasMore : remarkHasMore) ? <PrimaryButton disabled={loadingMore} icon="chevron-down-outline" label={loadingMore ? "Загружаем…" : "Загрузить ещё"} onPress={handleLoadMore} variant="secondary" /> : null}
        onEndReached={() => { if (tab === "tasks" && !workForm.current) void handleLoadMore(); }}
        onEndReachedThreshold={0.4}
        removeClippedSubviews={false}
        renderItem={({ item }) => tab === "tasks" ? (() => {
          const task = item as WorkItemDto;
          const primary = getTaskPrimaryAction(task, { onStart: item => void openParticipationAction("start", item), onJoin: item => void openParticipationAction("join", item), onResume: task => void applyTaskAction(() => resumeWorkTaskLocally(task as WorkTaskDto, "Продолжение работы"), "Работа продолжена", "Не удалось продолжить"), onComplete: task => void openCompleteTask(task as WorkTaskDto) });
          return <WorkTaskCard task={task} primary={primary} loading={loading} onMenu={() => setMenuTask(task)} />;
        })() : (() => {
          const remark = item as ShiftRemark;
          return <Card><View style={styles.row}><View style={styles.titleBox}><Text style={[styles.cardTitle, { color: colors.text }]}>{remark.sectionName ?? "Замечание"}</Text><Text style={[styles.text, { color: colors.mutedText }]} numberOfLines={4}>{remark.comment}</Text></View><StatusPill label={remarkStatusLabel(remark.status)} tone={remarkStatusTone(remark.status)} /></View><Text style={[styles.text, { color: colors.mutedText }]}>Исполнитель: {remark.employeeName ? formatShortName(remark.employeeName) : "не указан"}</Text><Text style={[styles.muted, { color: colors.mutedText }]}>Дата: {formatDateTime(remark.createdAtLocal)}</Text><Text style={[styles.muted, { color: colors.mutedText }]}>Вложения: {remark.mediaClientFileIds.length}</Text><PrimaryButton disabled={loading} icon="attach-outline" label="Добавить вложение" onPress={() => setAttachmentRemark({ remarkId: remark.remarkId, title: remark.sectionName ?? "Замечание" })} variant="secondary" /></Card>;
        })()}
      />

      <ActionSheet title="Что создать?" visible={createMenuOpen} onClose={() => setCreateMenuOpen(false)} actions={[
        { label: "Создать работу", icon: "construct-outline", onPress: openCreateTask },
        { label: "Создать замечание", icon: "chatbox-ellipses-outline", onPress: openCreateRemark }
      ]} />
      <ActionSheet title="Показать" visible={filterMenuOpen} onClose={() => setFilterMenuOpen(false)} actions={[
        { label: "Активные работы", icon: tab === "tasks" && taskFilter === "active" ? "checkmark-circle" : "construct-outline", onPress: () => { setTab("tasks"); setTaskFilter("active"); } },
        { label: "История работ", icon: tab === "tasks" && taskFilter === "history" ? "checkmark-circle" : "time-outline", onPress: () => { setTab("tasks"); setTaskFilter("history"); } },
        { label: "Замечания", icon: tab === "remarks" ? "checkmark-circle" : "chatbox-ellipses-outline", onPress: () => setTab("remarks") }
      ]} />
      <TaskModal
        draftNotice={savingDraft ? "Сохраняем…" : draftNotice}
        onRetry={leaveFailed ? () => void closeWithDraft(null, closeModal) : undefined}
        employees={employees}
        error={taskModal ? message : null}
        loading={loading}
        modal={taskModal}
        onClose={() => void closeWithDraft(flushTaskDraft, () => setTaskModal(null))}
        onDeleteDraft={() => void clearTaskDraft()}
        onSave={handleSaveTask}
        sections={sections}
        setTaskEmployeeId={value => { editDraft("employeeId", value); setTaskEmployeeId(value); }}
        setTaskSectionId={value => { editDraft("sectionId", value); setTaskSectionId(value); }}
        setTaskText={value => { editDraft("text", value); setTaskText(value); }}
        taskEmployeeId={taskEmployeeId}
        taskSectionId={taskSectionId}
        taskText={taskText}
      />

      <RemarkModal
        draftNotice={savingDraft ? "Сохраняем…" : draftNotice}
        onRetry={leaveFailed ? () => void closeWithDraft(null, closeModal) : undefined}
        employees={employees}
        error={remarkModalOpen ? message : null}
        loading={loading}
        onClose={() => void closeWithDraft(flushRemarkDraft, () => setRemarkModalOpen(false))}
        onDeleteDraft={() => void clearRemarkDraft()}
        onSave={handleSaveRemark}
        open={remarkModalOpen}
        remarkComment={remarkComment}
        remarkEmployeeId={remarkEmployeeId}
        remarkAttachmentAfterSave={remarkAttachmentAfterSave}
        remarkSectionId={remarkSectionId}
        sections={sections}
        setRemarkComment={value => { editDraft("comment", value); setRemarkComment(value); }}
        setRemarkEmployeeId={value => { editDraft("employeeId", value); setRemarkEmployeeId(value); }}
        setRemarkAttachmentAfterSave={value => { editDraft("attachmentAfterSave", value); setRemarkAttachmentAfterSave(value); }}
        setRemarkSectionId={value => { editDraft("sectionId", value); setRemarkSectionId(value); }}
      />

      <TaskMenu
        loading={loading}
        onClose={() => setMenuTask(null)}
        onComplete={(task) => void openCompleteTask(task)}
        onEdit={(task) => void openEditTask(task)}
        onPause={(task) =>
          applyTaskAction(
            () => pauseWorkTaskLocally(task, ""),
            "Работа поставлена на паузу.",
            "Не удалось поставить работу на паузу."
          )
        }
        onResume={(task) =>
          applyTaskAction(
            () => resumeWorkTaskLocally(task, ""),
            "Работа продолжена.",
            "Не удалось продолжить работу."
          )
        }
        onJoin={(task) => openParticipationAction("join", task)}
        onAttach={(task) => {
          setMenuTask(null);
          setAttachmentTask(task);
        }}
        onReplace={(task) => openParticipationAction("replace", task)}
        onRepeat={(task) => void openRepeatTask(task)}
        onStart={(task) => openParticipationAction("start", task)}
        task={menuTask}
      />

      <ParticipationModal
        error={message}
        draftNotice={savingDraft ? "Сохраняем…" : draftNotice}
        onRetry={leaveFailed ? () => void closeWithDraft(null, closeModal) : undefined}
        onDeleteDraft={() => void clearDraft()}
        action={participationAction}
        employeeId={participationEmployeeId}
        employees={employees}
        loading={loading}
        onClose={() => void closeWithDraft(null, () => setParticipationAction(null))}
        onSave={handleParticipationAction}
        previousEmployeeId={participationPreviousEmployeeId}
        reason={participationReason}
        setEmployeeId={value => { editDraft("employeeId", value); setParticipationEmployeeId(value); }}
        setPreviousEmployeeId={value => { editDraft("previousEmployeeId", value); setParticipationPreviousEmployeeId(value); }}
        setReason={value => { editDraft("reason", value); setParticipationReason(value); }}
      />

      <CompleteTaskModal
        draftNotice={savingDraft ? "Сохраняем…" : draftNotice}
        onRetry={leaveFailed ? () => void closeWithDraft(null, closeModal) : undefined}
        comment={completeComment}
        error={completeTask ? message : null}
        loading={loading}
        onChangeComment={value => { editDraft("comment", value); setCompleteComment(value); }}
        onClose={() => void closeWithDraft(flushCompletionDraft, () => setCompleteTask(null))}
        onDeleteDraft={() => void clearCompletionDraft()}
        onSave={handleCompleteTask}
        task={completeTask}
      />
      <ActionSheet title="Сохранённые черновики" visible={draftChoices !== null} actions={draftChoices ?? []} onClose={() => setDraftChoices(null)} />
      <ActionSheet
        actions={[
          { icon: "camera-outline", label: "Сделать фото", onPress: () => void handleAttachWorkMedia("photo") },
          { icon: "videocam-outline", label: "Снять видео", onPress: () => void handleAttachWorkMedia("video") },
          { icon: "images-outline", label: "Выбрать из галереи", onPress: () => void handleAttachWorkMedia("gallery") }
        ]}
        onClose={() => setAttachmentTask(null)}
        title="Вложение к работе"
        visible={Boolean(attachmentTask)}
      />
      <ActionSheet
        actions={[
          { icon: "camera-outline", label: "Сделать фото", onPress: () => void handleAttachRemarkMedia("photo") },
          { icon: "videocam-outline", label: "Снять видео", onPress: () => void handleAttachRemarkMedia("video") },
          { icon: "images-outline", label: "Выбрать из галереи", onPress: () => void handleAttachRemarkMedia("gallery") }
        ]}
        onClose={() => setAttachmentRemark(null)}
        title={attachmentRemark ? `Вложение: ${attachmentRemark.title}` : "Вложение к замечанию"}
        visible={Boolean(attachmentRemark)}
      />
    </Screen>
  );
}

function EmptyCard({ text, title }: { text: string; title: string }) {
  const styles = useWorkAccountingStyles();
  return (
    <Card>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.text}>{text}</Text>
    </Card>
  );
}
