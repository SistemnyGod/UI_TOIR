import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { createShiftRemarkLocally, listShiftRemarksPage, ShiftRemark } from "@/db/repositories/shiftRemarkRepository";
import {
  completeWorkTaskLocally,
  createWorkTaskLocally,
  joinWorkTaskLocally,
  getWorkListVisibleLimit,
  listEmuSections,
  listLocalWorkItemsPage,
  listMobileEmployees,
  pauseWorkTaskLocally,
  replaceWorkTaskParticipantLocally,
  resumeWorkTaskLocally,
  setWorkListVisibleLimit,
  startPlannedWorkLocally,
  updateWorkTaskLocally
} from "@/db/repositories/workTaskRepository";
import { MobileEmployeeDto, MobileEmuSectionDto, WorkItemDto, WorkTaskDto } from "@/domain/emu/emuTypes";
import type { LocalWorkItemsFilter } from "@/db/repositories/workTaskRepository";
import { canAttachEmuMedia, canCompleteEmuTask, canEditEmuTask, canPauseEmuTask, canResumeEmuTask, canStartEmuTask } from "@/domain/emu/emuStateMachine";
import {
  formatDateTime,
  formatParticipants,
  formatShortName,
  formatWorkAttachments,
  workDeliveryPresentation,
  remarkStatusLabel,
  remarkStatusTone,
  statusLabel,
  statusTone,
  workAccountingStyles as styles
} from "@/features/emuTask/WorkAccountingPresentation";
import { useAppTheme } from "@/features/settings/themePreference";
import {
  attachRemarkMediaFromGallery,
  attachRemarkPhotoFromCamera,
  attachRemarkVideoFromCamera,
  attachWorkMediaFromGallery,
  attachWorkPhotoFromCamera,
  attachWorkVideoFromCamera
} from "@/services/mediaAttachmentService";
import { loadMoreWorkItems, loadWorkItemsOfflineFirst } from "@/services/workTaskService";
import { logMobileError } from "@/services/mobileErrorReporter";
import { subscribeToSyncEvents } from "@/sync/syncEvents";
import { assertDataOwnerContext, captureDataOwnerContext } from "@/auth/dataOwnerContext";
import { getPatrolDeviceContext, selectPatrolEmployee } from "@/db/repositories/patrolContextRepository";
import { captureWorkDraftWriteToken, deleteWorkDraftForContext, flushWorkDraftForContext, getWorkDraftContext, invalidateWorkDraftForContext, readWorkDraftForContext, saveWorkDraftForContext, waitForWorkDraftForContext, type WorkDraftContext } from "@/db/repositories/workDraftRepository";
import { useSmoothRefreshIndicator } from "@/sync/useSmoothRefreshIndicator";
import { ActionSheet } from "@/ui/ActionSheet";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";

type WorkTab = "tasks" | "remarks";
type TaskFilter = "mine" | "available" | "history";
type ParticipationAction = { mode: "start" | "join" | "replace"; item: WorkItemDto };
type RemarkAttachmentAfterSave = "later" | "now";
type RemarkAttachmentTarget = { remarkId: string; title: string } | null;

function listScope(kind: "tasks" | "remarks", contextKey: string) {
  return `local:${kind}:${contextKey}`;
}

function requestModalClose(hasUnsavedChanges: boolean, loading: boolean, onClose: () => void) {
  if (loading) {
    return;
  }
  if (!hasUnsavedChanges) {
    onClose();
    return;
  }
  Alert.alert("Сохранить черновик и закрыть?", "Последние изменения будут сохранены на телефоне.", [
    { text: "Продолжить редактирование", style: "cancel" },
    { text: "Сохранить и закрыть", onPress: onClose }
  ]);
}

export function WorkAccountingScreen() {
  const { colors } = useAppTheme();
  const [tab, setTab] = useState<WorkTab>("tasks");
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("mine");
  const [tasks, setTasks] = useState<WorkItemDto[]>([]);
  const [remarks, setRemarks] = useState<ShiftRemark[]>([]);
  const [taskHasMore, setTaskHasMore] = useState(true);
  const [remarkHasMore, setRemarkHasMore] = useState(true);
  const [employees, setEmployees] = useState<MobileEmployeeDto[]>([]);
  const [sections, setSections] = useState<MobileEmuSectionDto[]>([]);
  const [currentEmployeeId, setCurrentEmployeeId] = useState("");
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [taskModal, setTaskModal] = useState<{ mode: "create" | "edit"; task?: WorkTaskDto } | null>(null);
  const [remarkModalOpen, setRemarkModalOpen] = useState(false);
  const [menuTask, setMenuTask] = useState<WorkItemDto | null>(null);
  const [completeTask, setCompleteTask] = useState<WorkTaskDto | null>(null);
  const [completeComment, setCompleteComment] = useState("");
  const [taskDraftEmployeeId, setTaskDraftEmployeeId] = useState("");
  const [remarkDraftEmployeeId, setRemarkDraftEmployeeId] = useState("");
  const [completionDraftEmployeeId, setCompletionDraftEmployeeId] = useState("");
  const [taskDraftContext, setTaskDraftContext] = useState<WorkDraftContext | null>(null);
  const [remarkDraftContext, setRemarkDraftContext] = useState<WorkDraftContext | null>(null);
  const [completionDraftContext, setCompletionDraftContext] = useState<WorkDraftContext | null>(null);
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
  const loadingMoreRef = useRef(false);
  const draftStateRef = useRef({
    taskModal,
    taskDraftEmployeeId,
    taskDraftContext,
    taskSectionId,
    taskEmployeeId,
    taskText,
    remarkModalOpen,
    remarkDraftEmployeeId,
    remarkDraftContext,
    remarkSectionId,
    remarkEmployeeId,
    remarkComment,
    remarkAttachmentAfterSave,
    completeTask,
    completionDraftEmployeeId,
    completionDraftContext,
    completeComment
  });
  const taskSaveInFlightRef = useRef(false);
  const remarkSaveInFlightRef = useRef(false);
  const completionSaveInFlightRef = useRef(false);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);
  useEffect(() => {
    remarksRef.current = remarks;
  }, [remarks]);
  useEffect(() => {
    draftStateRef.current = {
      taskModal,
      taskDraftEmployeeId,
      taskDraftContext,
      taskSectionId,
      taskEmployeeId,
      taskText,
      remarkModalOpen,
      remarkDraftEmployeeId,
      remarkDraftContext,
      remarkSectionId,
      remarkEmployeeId,
      remarkComment,
      remarkAttachmentAfterSave,
      completeTask,
      completionDraftEmployeeId,
      completionDraftContext,
      completeComment
    };
  }, [taskModal, taskDraftEmployeeId, taskDraftContext, taskSectionId, taskEmployeeId, taskText, remarkModalOpen, remarkDraftEmployeeId, remarkDraftContext, remarkSectionId, remarkEmployeeId, remarkComment, remarkAttachmentAfterSave, completeTask, completionDraftEmployeeId, completionDraftContext, completeComment]);
  const { beginRefresh, endRefresh, showRefreshIndicator } = useSmoothRefreshIndicator();

  const reloadLocal = useCallback(async (reset = false) => {
    const ownerContext = await captureDataOwnerContext();
    const contextKey = `${ownerContext.ownerUserId}:${ownerContext.contourId}:${taskFilter}:${currentEmployeeId || "none"}`;
    const contextChanged = listContextRef.current !== contextKey;
    const shouldReset = reset || contextChanged;
    const generation = ++listGenerationRef.current;
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
    const localFilter: LocalWorkItemsFilter = taskFilter;
    const localEmployeeId = currentEmployeeId || null;
    let taskPage = await listLocalWorkItemsPage(25, null, localFilter, localEmployeeId);
    await assertDataOwnerContext(ownerContext);
    const loadedTasks = [...taskPage.items];
    while (loadedTasks.length < targetTaskCount && taskPage.nextCursor) {
      taskPage = await listLocalWorkItemsPage(25, taskPage.nextCursor, localFilter, localEmployeeId);
      await assertDataOwnerContext(ownerContext);
      loadedTasks.push(...taskPage.items);
    }
    let remarkPage = await listShiftRemarksPage(25, null);
    await assertDataOwnerContext(ownerContext);
    const loadedRemarks = [...remarkPage.items];
    while (loadedRemarks.length < targetRemarkCount && remarkPage.nextCursor) {
      remarkPage = await listShiftRemarksPage(25, remarkPage.nextCursor);
      await assertDataOwnerContext(ownerContext);
      loadedRemarks.push(...remarkPage.items);
    }
    const [nextEmployees, nextSections, context] = await Promise.all([
      listMobileEmployees(),
      listEmuSections(),
      getPatrolDeviceContext()
    ]);
    await assertDataOwnerContext(ownerContext);
    if (generation !== listGenerationRef.current) return;
    setTasks(loadedTasks);
    setRemarks(loadedRemarks);
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
    setEmployees(nextEmployees);
    setSections(nextSections);
    const selected = context.employeeId && nextEmployees.some(item => item.employeeId === context.employeeId)
      ? context.employeeId : nextEmployees.length === 1 ? nextEmployees[0].employeeId : "";
    setCurrentEmployeeId(selected);
    if (selected && selected !== context.employeeId) await selectPatrolEmployee(selected);
  }, [currentEmployeeId, taskFilter]);

  useFocusEffect(useCallback(() => subscribeToSyncEvents((event) => {
    if (!event.snapshotRefreshed && !event.refreshedZones?.includes("workItems")) {
      return;
    }

    beginRefresh();
    void reloadLocal()
      .catch((error) => {
        void logMobileError("emu.work-accounting.sync-refresh.failed", error);
        setRefreshError("Показаны сохранённые данные. Обновление с сервера не удалось.");
      })
      .finally(endRefresh);
  }), [reloadLocal, beginRefresh, endRefresh]));
  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      setLoading(true);

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

      const serverEmployeeId = taskFilter === "available" ? null : (currentEmployeeId || null);
      void loadWorkItemsOfflineFirst(handleRefreshSuccess, handleRefreshFailure, serverEmployeeId)
        .then(() => reloadLocal(true))
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
      };
    }, [reloadLocal, taskFilter, currentEmployeeId])
  );

  async function openCreateTask() {
    const employeeId = defaultEmployeeId();
    const draftContext = await getWorkDraftContext();
    const draft = employeeId && draftContext ? await readWorkDraftForContext<{ sectionId?: string; text?: string; employeeId?: string }>(draftContext, employeeId, "task") : null;
    setTaskEmployeeId(draft?.employeeId ?? employeeId);
    setTaskDraftEmployeeId(employeeId);
    setTaskDraftContext(draftContext);
    setTaskSectionId(defaultSectionId());
    setTaskSectionId(draft?.sectionId ?? defaultSectionId());
    setTaskText(draft?.text ?? "");
    setTaskModal({ mode: "create" });
  }

  async function openEditTask(task: WorkTaskDto) {
    // The draft owner is the employee selected on this device. The employee
    // stored inside the form remains independent and may belong to the task.
    const draftOwnerEmployeeId = defaultEmployeeId();
    const draftContext = await getWorkDraftContext();
    const draft = draftOwnerEmployeeId && draftContext ? await readWorkDraftForContext<{ sectionId?: string; text?: string; employeeId?: string }>(draftContext, draftOwnerEmployeeId, "task", task.taskId) : null;
    setTaskEmployeeId(draft?.employeeId ?? task.employeeId ?? draftOwnerEmployeeId);
    setTaskDraftEmployeeId(draftOwnerEmployeeId);
    setTaskDraftContext(draftContext);
    setTaskSectionId(draft?.sectionId ?? task.sectionId ?? defaultSectionId());
    setTaskText(draft?.text ?? task.title);
    setMenuTask(null);
    setTaskModal({ mode: "edit", task });
  }

  async function openCompleteTask(task: WorkTaskDto) {
    const draftOwnerEmployeeId = defaultEmployeeId();
    const draftContext = await getWorkDraftContext();
    const draft = draftOwnerEmployeeId && draftContext ? await readWorkDraftForContext<{ comment?: string }>(draftContext, draftOwnerEmployeeId, "taskCompletion", task.taskId) : null;
    setMenuTask(null);
    setCompleteTask(task);
    setCompletionDraftEmployeeId(draftOwnerEmployeeId);
    setCompletionDraftContext(draftContext);
    setCompleteComment(draft?.comment ?? "");
  }

  async function openCreateRemark() {
    const employeeId = defaultEmployeeId();
    const draftContext = await getWorkDraftContext();
    const draft = employeeId && draftContext ? await readWorkDraftForContext<{ sectionId?: string; comment?: string; employeeId?: string; attachmentAfterSave?: RemarkAttachmentAfterSave }>(draftContext, employeeId, "remark") : null;
    setRemarkEmployeeId(draft?.employeeId ?? employeeId);
    setRemarkDraftEmployeeId(employeeId);
    setRemarkDraftContext(draftContext);
    setRemarkSectionId(draft?.sectionId ?? defaultSectionId());
    setRemarkComment(draft?.comment ?? "");
    setRemarkAttachmentAfterSave(draft?.attachmentAfterSave ?? "later");
    setRemarkModalOpen(true);
  }

  useEffect(() => {
    if (!taskModal || !taskDraftEmployeeId) return;
    const entityId = taskModal.mode === "edit" ? taskModal.task?.taskId ?? "new" : "new";
    const token = taskDraftContext ? captureWorkDraftWriteToken(taskDraftContext, taskDraftEmployeeId, "task", entityId) : null;
    const timer = setTimeout(() => {
      if (!taskDraftContext) return;
      void saveWorkDraftForContext(taskDraftContext, taskDraftEmployeeId, "task", { sectionId: taskSectionId, employeeId: taskEmployeeId, text: taskText }, entityId, token ?? undefined)
        .then((saved) => { if (saved) setDraftNotice("Черновик сохранён"); })
        .catch(() => setDraftNotice("Не удалось сохранить черновик"));
    }, 350);
    return () => clearTimeout(timer);
  }, [taskModal, taskDraftEmployeeId, taskDraftContext, taskSectionId, taskEmployeeId, taskText]);

  useEffect(() => {
    if (!remarkModalOpen || !remarkDraftEmployeeId) return;
    const token = remarkDraftContext ? captureWorkDraftWriteToken(remarkDraftContext, remarkDraftEmployeeId, "remark") : null;
    const timer = setTimeout(() => {
      if (!remarkDraftContext) return;
      void saveWorkDraftForContext(remarkDraftContext, remarkDraftEmployeeId, "remark", { sectionId: remarkSectionId, employeeId: remarkEmployeeId, comment: remarkComment, attachmentAfterSave: remarkAttachmentAfterSave }, "new", token ?? undefined)
        .then((saved) => { if (saved) setDraftNotice("Черновик сохранён"); })
        .catch(() => setDraftNotice("Не удалось сохранить черновик"));
    }, 350);
    return () => clearTimeout(timer);
  }, [remarkModalOpen, remarkDraftEmployeeId, remarkDraftContext, remarkSectionId, remarkEmployeeId, remarkComment, remarkAttachmentAfterSave]);

  useEffect(() => {
    if (!completeTask || !completionDraftEmployeeId) return;
    const token = completionDraftContext ? captureWorkDraftWriteToken(completionDraftContext, completionDraftEmployeeId, "taskCompletion", completeTask.taskId) : null;
    const timer = setTimeout(() => {
      if (!completionDraftContext) return;
      void saveWorkDraftForContext(completionDraftContext, completionDraftEmployeeId, "taskCompletion", { comment: completeComment }, completeTask.taskId, token ?? undefined)
        .then((saved) => { if (saved) setDraftNotice("Черновик сохранён"); })
        .catch(() => setDraftNotice("Не удалось сохранить черновик"));
    }, 350);
    return () => clearTimeout(timer);
  }, [completeTask, completionDraftEmployeeId, completionDraftContext, completeComment]);

  async function flushTaskDraft() {
    if (!taskModal || !taskDraftEmployeeId || !taskDraftContext) return;
    await flushWorkDraftForContext(taskDraftContext, taskDraftEmployeeId, "task", { sectionId: taskSectionId, employeeId: taskEmployeeId, text: taskText }, taskModal.mode === "edit" ? taskModal.task?.taskId : "new");
    setDraftNotice("Черновик сохранён");
  }

  async function flushRemarkDraft() {
    if (!remarkModalOpen || !remarkDraftEmployeeId || !remarkDraftContext) return;
    await flushWorkDraftForContext(remarkDraftContext, remarkDraftEmployeeId, "remark", { sectionId: remarkSectionId, employeeId: remarkEmployeeId, comment: remarkComment, attachmentAfterSave: remarkAttachmentAfterSave });
    setDraftNotice("Черновик сохранён");
  }

  async function flushCompletionDraft() {
    if (!completeTask || !completionDraftEmployeeId || !completionDraftContext) return;
    await flushWorkDraftForContext(completionDraftContext, completionDraftEmployeeId, "taskCompletion", { comment: completeComment }, completeTask.taskId);
    setDraftNotice("Черновик сохранён");
  }

  async function closeWithDraft(flush: () => Promise<void>, close: () => void) {
    try {
      await flush();
      close();
    } catch {
      setMessage("Черновик не сохранён. Повторите попытку или удалите черновик явно.");
    }
  }

  async function clearTaskDraft() {
    if (!taskModal || !taskDraftEmployeeId || !taskDraftContext) return;
    try {
      invalidateWorkDraftForContext(taskDraftContext, taskDraftEmployeeId, "task", taskModal.mode === "edit" ? taskModal.task?.taskId : "new");
      await deleteWorkDraftForContext(taskDraftContext, taskDraftEmployeeId, "task", taskModal.mode === "edit" ? taskModal.task?.taskId : "new");
      setTaskModal(null);
      setTaskText("");
      setDraftNotice("Черновик удалён");
    } catch {
      setMessage("Не удалось удалить черновик. Повторите попытку.");
    }
  }

  async function clearRemarkDraft() {
    if (!remarkDraftEmployeeId || !remarkDraftContext) return;
    try {
      invalidateWorkDraftForContext(remarkDraftContext, remarkDraftEmployeeId, "remark");
      await deleteWorkDraftForContext(remarkDraftContext, remarkDraftEmployeeId, "remark");
      setRemarkModalOpen(false);
      setRemarkComment("");
      setDraftNotice("Черновик удалён");
    } catch {
      setMessage("Не удалось удалить черновик. Повторите попытку.");
    }
  }

  async function clearCompletionDraft() {
    if (!completeTask || !completionDraftEmployeeId || !completionDraftContext) return;
    try {
      invalidateWorkDraftForContext(completionDraftContext, completionDraftEmployeeId, "taskCompletion", completeTask.taskId);
      await deleteWorkDraftForContext(completionDraftContext, completionDraftEmployeeId, "taskCompletion", completeTask.taskId);
      setCompleteTask(null);
      setCompleteComment("");
      setDraftNotice("Черновик удалён");
    } catch {
      setMessage("Не удалось удалить черновик. Повторите попытку.");
    }
  }

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "background" && state !== "inactive") return;
      const snapshot = draftStateRef.current;
      const writes: Promise<void>[] = [];
      if (snapshot.taskModal && snapshot.taskDraftEmployeeId && snapshot.taskDraftContext) {
        writes.push(flushWorkDraftForContext(snapshot.taskDraftContext, snapshot.taskDraftEmployeeId, "task", {
          sectionId: snapshot.taskSectionId,
          employeeId: snapshot.taskEmployeeId,
          text: snapshot.taskText
        }, snapshot.taskModal.mode === "edit" ? snapshot.taskModal.task?.taskId : "new"));
      }
      if (snapshot.remarkModalOpen && snapshot.remarkDraftEmployeeId && snapshot.remarkDraftContext) {
        writes.push(flushWorkDraftForContext(snapshot.remarkDraftContext, snapshot.remarkDraftEmployeeId, "remark", {
          sectionId: snapshot.remarkSectionId,
          employeeId: snapshot.remarkEmployeeId,
          comment: snapshot.remarkComment,
          attachmentAfterSave: snapshot.remarkAttachmentAfterSave
        }));
      }
      if (snapshot.completeTask && snapshot.completionDraftEmployeeId && snapshot.completionDraftContext) {
        writes.push(flushWorkDraftForContext(snapshot.completionDraftContext, snapshot.completionDraftEmployeeId, "taskCompletion", {
          comment: snapshot.completeComment
        }, snapshot.completeTask.taskId));
      }
      void Promise.all(writes).catch(() => {
        setDraftNotice("Не удалось сохранить черновик перед сворачиванием приложения");
      });
    });
    return () => subscription.remove();
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
      if (taskDraftContext && taskDraftEmployeeId) {
        invalidateWorkDraftForContext(taskDraftContext, taskDraftEmployeeId, "task", taskModal?.mode === "edit" ? taskModal.task?.taskId : "new");
        await waitForWorkDraftForContext(taskDraftContext, taskDraftEmployeeId, "task", taskModal?.mode === "edit" ? taskModal.task?.taskId : "new");
      }
      if (taskModal?.mode === "edit" && taskModal.task) {
        await updateWorkTaskLocally({
          task: taskModal.task,
          sectionId: section.sectionId,
          sectionName: section.name,
          taskDescription: taskText,
          draftEmployeeId: taskDraftEmployeeId
        });
        setMessage("Изменение работы сохранено на телефоне и будет отправлено на сервер.");
      } else {
        await createWorkTaskLocally({
          employeeId: employee.employeeId,
          employeeName: employee.fullName,
          sectionId: section.sectionId,
          sectionName: section.name,
          taskDescription: taskText,
          draftEmployeeId: taskDraftEmployeeId
        });
        setMessage("Работа создана на телефоне и появится в ЭМУ после синхронизации.");
      }

      setTaskModal(null);
      await reloadLocal();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить работу.");
    } finally {
      taskSaveInFlightRef.current = false;
      setLoading(false);
    }
  }

  async function handleLoadMore() {
    if (loadingMoreRef.current || loadingMore) return;
    if (tab === "remarks" && !remarkHasMore) return;
    if (tab === "tasks" && !taskHasMore && !taskCursorRef.current) return;
    loadingMoreRef.current = true;
    const generation = listGenerationRef.current;
    if (tab === "remarks") {
      setLoadingMore(true);
      try {
        const page = await listShiftRemarksPage(25, remarkCursorRef.current);
        if (generation !== listGenerationRef.current) return;
        setRemarks(previous => [...previous, ...page.items]);
        const contextKey = listContextRef.current;
        if (contextKey) void setWorkListVisibleLimit(listScope("remarks", contextKey), remarksRef.current.length + page.items.length);
        remarkCursorRef.current = page.nextCursor;
        setRemarkHasMore(Boolean(page.nextCursor));
      } catch (error) {
        setRefreshError(error instanceof Error ? error.message : "Не удалось загрузить следующие замечания.");
      } finally {
        loadingMoreRef.current = false;
        if (generation === listGenerationRef.current) setLoadingMore(false);
      }
      return;
    }
    setLoadingMore(true);
    try {
      const scope = taskFilter === "history" ? "history" : "active";
      const employeeId = currentEmployeeId || null;
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
        if (!added.length && !serverNext) setMessage("Больше работ в этой истории нет.");
      }
      if (added.length > 0) {
        const known = new Set(tasksRef.current.map(item => item.itemId));
        const unique = added.filter(item => !known.has(item.itemId));
        if (unique.length) {
          setTasks(previous => [...previous, ...unique]);
          const contextKey = listContextRef.current;
          if (contextKey) void setWorkListVisibleLimit(listScope("tasks", contextKey), tasksRef.current.length + unique.length);
        }
      }
      taskCursorRef.current = page.nextCursor;
      setTaskHasMore(Boolean(page.nextCursor) || added.length > 0 || Boolean(serverNext));
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : "Не удалось загрузить следующую страницу работ.");
    } finally {
      loadingMoreRef.current = false;
      if (generation === listGenerationRef.current) setLoadingMore(false);
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
      if (remarkDraftContext && remarkDraftEmployeeId) {
        invalidateWorkDraftForContext(remarkDraftContext, remarkDraftEmployeeId, "remark");
        await waitForWorkDraftForContext(remarkDraftContext, remarkDraftEmployeeId, "remark");
      }
      const remarkId = await createShiftRemarkLocally({
        comment: remarkComment,
        sectionId: section.sectionId,
        sectionName: section.name,
        employeeId: employee.employeeId,
        employeeName: employee.fullName,
        draftEmployeeId: remarkDraftEmployeeId
      });
      setRemarkModalOpen(false);
      await reloadLocal();
      setMessage("Замечание сохранено на телефоне и будет отправлено на сервер.");

      if (remarkAttachmentAfterSave === "now") {
        setAttachmentRemark({ remarkId, title: section.name });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить замечание.");
    } finally {
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
      if (completionDraftContext && completionDraftEmployeeId) {
        invalidateWorkDraftForContext(completionDraftContext, completionDraftEmployeeId, "taskCompletion", completeTask.taskId);
        await waitForWorkDraftForContext(completionDraftContext, completionDraftEmployeeId, "taskCompletion", completeTask.taskId);
      }
      await completeWorkTaskLocally(completeTask, completeComment.trim(), completionDraftEmployeeId);
      setCompleteTask(null);
      setCompleteComment("");
      await reloadLocal();
      setMessage("Работа завершена на телефоне и будет отправлена на сервер.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось завершить работу.");
    } finally {
      completionSaveInFlightRef.current = false;
      setLoading(false);
    }
  }

  function defaultEmployeeId() {
    return currentEmployeeId || (employees.length === 1 ? employees[0].employeeId : "");
  }

  function defaultSectionId() {
    return sections[0]?.sectionId ?? "";
  }

  async function changeSelectedEmployee(employeeId: string) {
    try {
      // A form belongs to the employee selected when it was opened. Finish its
      // local write before changing the device-wide executor.
      if (taskModal) await flushTaskDraft();
      if (remarkModalOpen) await flushRemarkDraft();
      if (completeTask) await flushCompletionDraft();
      setCurrentEmployeeId(employeeId);
      await selectPatrolEmployee(employeeId);
    } catch {
      setMessage("Не удалось сохранить черновик перед сменой исполнителя.");
    }
  }

  const filteredTasks = tasks.filter((task) => {
    const belongsToCurrentEmployee = Boolean(currentEmployeeId) && (task.actualParticipants.some((item) => item.employeeId === currentEmployeeId)
      || task.assignedEmployees.some((item) => item.employeeId === currentEmployeeId));
    const completed = task.status === "completedLocal" || task.status === "completedServer" || task.status === "cancelled";
    if (taskFilter === "history") {
      return completed && belongsToCurrentEmployee;
    }
    if (taskFilter === "available") {
      return !completed && !belongsToCurrentEmployee;
    }
    return !completed && belongsToCurrentEmployee;
  });
  const visibleRemarks = remarks;

  function openParticipationAction(mode: ParticipationAction["mode"], item: WorkItemDto) {
    const defaultEmployee = employees.length === 1 ? employees[0].employeeId : "";
    const previous = item.actualParticipants.find((participant) => !participant.isCurrentMobileEmployee && !participant.finishedAt);
    setParticipationEmployeeId(defaultEmployee);
    setParticipationPreviousEmployeeId(previous?.employeeId ?? "");
    setParticipationReason("");
    setMenuTask(null);
    setParticipationAction({ mode, item });
  }

  async function handleParticipationAction() {
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

    setLoading(true);
    setMessage(null);
    try {
      if (participationAction.mode === "start") {
        await startPlannedWorkLocally(participationAction.item, employee);
      } else if (participationAction.mode === "join") {
        await joinWorkTaskLocally(participationAction.item, employee, participationReason);
      } else {
        await replaceWorkTaskParticipantLocally(
          participationAction.item,
          participationPreviousEmployeeId,
          employee,
          participationReason
        );
      }
      setParticipationAction(null);
      await reloadLocal();
      setTaskFilter("mine");
      setMessage("Действие сохранено на телефоне и будет отправлено в ЭМУ.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось изменить исполнителя работы.");
    } finally {
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
    <Screen scroll={false} title="Работы" subtitle="Учет работ и замечания по смене доступны оффлайн.">
      <FlatList<WorkItemDto | ShiftRemark>
        contentContainerStyle={{ padding: 16, paddingBottom: 104, gap: 13 }}
        data={tab === "tasks" ? filteredTasks : visibleRemarks}
        keyExtractor={(item) => tab === "tasks" ? (item as WorkItemDto).itemId : (item as ShiftRemark).remarkId}
        ListHeaderComponent={<>
      <View style={styles.segment}>
        <SegmentButton active={tab === "tasks"} label="Учет работ" onPress={() => setTab("tasks")} />
        <SegmentButton active={tab === "remarks"} label="Замечания" onPress={() => setTab("remarks")} />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Исполнитель работ</Text>
        {employees.length === 0 ? <Text style={styles.readOnlyValue}>Справочник сотрудников загружается</Text> : (
          <OptionPicker
            label="Исполнитель работ"
            options={employees.map(employee => ({ id: employee.employeeId, label: formatShortName(employee.fullName) }))}
            selectedId={currentEmployeeId}
            onSelect={(employeeId) => {
              void changeSelectedEmployee(employeeId);
            }}
          />
        )}
      </View>

      {message ? <Text style={[styles.message, { color: colors.primary }]}>{message}</Text> : null}
      {draftNotice ? <Text style={[styles.muted, { color: colors.mutedText }]}>{draftNotice}</Text> : null}
      {showRefreshIndicator ? <StatusPill label="Обновляем данные…" tone="neutral" /> : null}
      {refreshError ? <StatusPill label={refreshError} tone="warning" /> : null}

      {tab === "tasks" ? (
        <>
          <PrimaryButton disabled={loading} icon="add-circle-outline" label="Создать и начать" onPress={openCreateTask} />
          <View style={styles.segment}>
            <SegmentButton active={taskFilter === "mine"} label="Мои" onPress={() => setTaskFilter("mine")} />
            <SegmentButton active={taskFilter === "available"} label="Доступные" onPress={() => setTaskFilter("available")} />
            <SegmentButton active={taskFilter === "history"} label="История" onPress={() => setTaskFilter("history")} />
          </View>
        </>
      ) : (
        <>
          <PrimaryButton disabled={loading} icon="add-circle-outline" label="Создать замечание" onPress={openCreateRemark} />
        </>
      )}
        </>}
        ListEmptyComponent={<EmptyCard title={tab === "tasks" ? "Работ нет" : "Замечаний нет"} text={tab === "tasks" ? "Создайте работу на телефоне или дождитесь назначения из ЭМУ." : "Добавьте замечание по смене, участку и приложите фото при необходимости."} />}
        ListFooterComponent={(tab === "tasks" ? filteredTasks.length : visibleRemarks.length) > 0 && (tab === "tasks" ? taskHasMore : remarkHasMore) ? <PrimaryButton disabled={loadingMore} icon="chevron-down-outline" label={loadingMore ? "Загружаем…" : "Загрузить ещё"} onPress={handleLoadMore} variant="secondary" /> : null}
        onEndReached={() => { if (tab === "tasks") void handleLoadMore(); }}
        onEndReachedThreshold={0.4}
        removeClippedSubviews
        renderItem={({ item }) => tab === "tasks" ? (() => {
          const task = item as WorkItemDto;
          return <Card><View style={styles.row}><View style={styles.titleBox}><Text style={[styles.cardTitle, { color: colors.text }]}>{task.title}</Text><Text style={[styles.text, { color: colors.mutedText }]}>{task.sectionName ?? "Участок не указан"}</Text></View><Pressable accessibilityRole="button" onPress={() => setMenuTask(task)} style={styles.iconButton}><Ionicons color={colors.mutedText} name="ellipsis-horizontal" size={22} /></Pressable></View><View style={styles.metaRow}><StatusPill label={statusLabel(task.status)} tone={statusTone(task.status)} /><StatusPill {...workDeliveryPresentation(task.syncStatus)} /></View><Text style={[styles.text, { color: colors.mutedText }]}>Исполнители: {formatParticipants(task)}</Text><Text style={[styles.muted, { color: colors.mutedText }]}>{formatWorkAttachments(task)}</Text>{task.deliveryError ? <Text style={[styles.muted, { color: "#b91c1c" }]}>{task.deliveryError}</Text> : null}<Text style={[styles.muted, { color: colors.mutedText }]}>Создано: {formatDateTime(task.createdAtLocal)}</Text></Card>;
        })() : (() => {
          const remark = item as ShiftRemark;
          return <Card><View style={styles.row}><View style={styles.titleBox}><Text style={[styles.cardTitle, { color: colors.text }]}>{remark.sectionName ?? "Замечание"}</Text><Text style={[styles.text, { color: colors.mutedText }]} numberOfLines={4}>{remark.comment}</Text></View><StatusPill label={remarkStatusLabel(remark.status)} tone={remarkStatusTone(remark.status)} /></View><Text style={[styles.text, { color: colors.mutedText }]}>Исполнитель: {remark.employeeName ? formatShortName(remark.employeeName) : "не указан"}</Text><Text style={[styles.muted, { color: colors.mutedText }]}>Дата: {formatDateTime(remark.createdAtLocal)}</Text><Text style={[styles.muted, { color: colors.mutedText }]}>Вложения: {remark.mediaClientFileIds.length}</Text><PrimaryButton disabled={loading} icon="attach-outline" label="Добавить вложение" onPress={() => setAttachmentRemark({ remarkId: remark.remarkId, title: remark.sectionName ?? "Замечание" })} variant="secondary" /></Card>;
        })()}
      />

      <TaskModal
        employees={employees}
        error={taskModal ? message : null}
        loading={loading}
        modal={taskModal}
        onClose={() => void closeWithDraft(flushTaskDraft, () => setTaskModal(null))}
        onDeleteDraft={() => void clearTaskDraft()}
        onSave={handleSaveTask}
        sections={sections}
        setTaskEmployeeId={setTaskEmployeeId}
        setTaskSectionId={setTaskSectionId}
        setTaskText={setTaskText}
        taskEmployeeId={taskEmployeeId}
        taskSectionId={taskSectionId}
        taskText={taskText}
      />

      <RemarkModal
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
        setRemarkComment={setRemarkComment}
        setRemarkEmployeeId={setRemarkEmployeeId}
        setRemarkAttachmentAfterSave={setRemarkAttachmentAfterSave}
        setRemarkSectionId={setRemarkSectionId}
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
        onStart={(task) => openParticipationAction("start", task)}
        task={menuTask}
      />

      <ParticipationModal
        action={participationAction}
        employeeId={participationEmployeeId}
        employees={employees}
        loading={loading}
        onClose={() => setParticipationAction(null)}
        onSave={handleParticipationAction}
        previousEmployeeId={participationPreviousEmployeeId}
        reason={participationReason}
        setEmployeeId={setParticipationEmployeeId}
        setPreviousEmployeeId={setParticipationPreviousEmployeeId}
        setReason={setParticipationReason}
      />

      <CompleteTaskModal
        comment={completeComment}
        error={completeTask ? message : null}
        loading={loading}
        onChangeComment={setCompleteComment}
        onClose={() => void closeWithDraft(flushCompletionDraft, () => setCompleteTask(null))}
        onDeleteDraft={() => void clearCompletionDraft()}
        onSave={handleCompleteTask}
        task={completeTask}
      />
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

function SegmentButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.segmentButton, active ? styles.segmentButtonActive : null]}>
      <Text style={[styles.segmentText, active ? styles.segmentTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function TaskModal({
  error,
  employees,
  loading,
  modal,
  onClose,
  onDeleteDraft,
  onSave,
  sections,
  setTaskEmployeeId,
  setTaskSectionId,
  setTaskText,
  taskEmployeeId,
  taskSectionId,
  taskText
}: {
  error: string | null;
  employees: MobileEmployeeDto[];
  loading: boolean;
  modal: { mode: "create" | "edit"; task?: WorkTaskDto } | null;
  onClose: () => void;
  onDeleteDraft: () => void;
  onSave: () => void;
  sections: MobileEmuSectionDto[];
  setTaskEmployeeId: (value: string) => void;
  setTaskSectionId: (value: string) => void;
  setTaskText: (value: string) => void;
  taskEmployeeId: string;
  taskSectionId: string;
  taskText: string;
}) {
  const insets = useSafeAreaInsets();
  const hasUnsavedChanges = modal?.mode === "create" ? taskText.trim().length > 0 : Boolean(modal?.task && (taskText !== modal.task.title || taskEmployeeId !== (modal.task.employeeId ?? "") || taskSectionId !== (modal.task.sectionId ?? "")));

  return (
    <Modal animationType="slide" onRequestClose={() => requestModalClose(hasUnsavedChanges, loading, onClose)} transparent visible={Boolean(modal)}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 18}
        style={styles.modalBackdrop}
      >
        <View accessibilityViewIsModal style={styles.modalCard}>
          <Text accessibilityRole="header" style={styles.modalTitle}>{modal?.mode === "edit" ? "Изменить работу" : "Создать работу"}</Text>
          {error ? <Text style={[styles.message, { color: "#b91c1c" }]}>{error}</Text> : null}
          <ScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.modalScroll}
          >
            <OptionPicker label="Исполнитель" options={employees.map((item) => ({ id: item.employeeId, label: formatShortName(item.fullName) }))} selectedId={taskEmployeeId} onSelect={setTaskEmployeeId} />
            <OptionPicker label="Участок" options={sections.map((item) => ({ id: item.sectionId, label: item.name }))} selectedId={taskSectionId} onSelect={setTaskSectionId} />
            <Text style={styles.label}>Дата и время</Text>
            <Text style={styles.readOnlyValue}>Автоматически при сохранении</Text>
            <Text style={styles.label}>Задача</Text>
            <TextInput accessibilityLabel="Задача" multiline onChangeText={setTaskText} placeholder="Что нужно выполнить?" placeholderTextColor="#9ca3af" style={[styles.input, styles.textarea]} textAlignVertical="top" value={taskText} />
          </ScrollView>
          <View style={[styles.modalActions, { paddingBottom: Math.max(insets.bottom + 12, 22) }]}>
            <PrimaryButton disabled={loading} label="Удалить черновик" onPress={onDeleteDraft} variant="secondary" />
            <PrimaryButton disabled={loading} label="Отмена" onPress={() => requestModalClose(hasUnsavedChanges, loading, onClose)} variant="secondary" />
            <PrimaryButton disabled={loading} label="Сохранить" onPress={onSave} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function RemarkModal({
  error,
  employees,
  loading,
  onClose,
  onDeleteDraft,
  onSave,
  open,
  remarkAttachmentAfterSave,
  remarkComment,
  remarkEmployeeId,
  remarkSectionId,
  sections,
  setRemarkAttachmentAfterSave,
  setRemarkComment,
  setRemarkEmployeeId,
  setRemarkSectionId
}: {
  error: string | null;
  employees: MobileEmployeeDto[];
  loading: boolean;
  onClose: () => void;
  onDeleteDraft: () => void;
  onSave: () => void;
  open: boolean;
  remarkAttachmentAfterSave: RemarkAttachmentAfterSave;
  remarkComment: string;
  remarkEmployeeId: string;
  remarkSectionId: string;
  sections: MobileEmuSectionDto[];
  setRemarkAttachmentAfterSave: (value: RemarkAttachmentAfterSave) => void;
  setRemarkComment: (value: string) => void;
  setRemarkEmployeeId: (value: string) => void;
  setRemarkSectionId: (value: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const hasUnsavedChanges = remarkComment.trim().length > 0 || remarkAttachmentAfterSave !== "later";

  return (
    <Modal animationType="slide" onRequestClose={() => requestModalClose(hasUnsavedChanges, loading, onClose)} transparent visible={open}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 18}
        style={styles.modalBackdrop}
      >
        <View accessibilityViewIsModal style={styles.modalCard}>
          <Text accessibilityRole="header" style={styles.modalTitle}>Новое замечание</Text>
          {error ? <Text style={[styles.message, { color: "#b91c1c" }]}>{error}</Text> : null}
          <ScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.modalScroll}
          >
            <OptionPicker label="Исполнитель" options={employees.map((item) => ({ id: item.employeeId, label: formatShortName(item.fullName) }))} selectedId={remarkEmployeeId} onSelect={setRemarkEmployeeId} />
            <OptionPicker label="Участок" options={sections.map((item) => ({ id: item.sectionId, label: item.name }))} selectedId={remarkSectionId} onSelect={setRemarkSectionId} />
            <Text style={styles.label}>Дата</Text>
            <Text style={styles.readOnlyValue}>Автоматически при сохранении</Text>
            <Text style={styles.label}>Описание замечания</Text>
            <TextInput accessibilityLabel="Описание замечания" multiline onChangeText={setRemarkComment} placeholder="Опишите замечание" placeholderTextColor="#9ca3af" style={[styles.input, styles.textarea]} textAlignVertical="top" value={remarkComment} />
            <Text style={styles.label}>Вложения</Text>
            <View style={styles.inlineActions}>
              <ChoiceButton active={remarkAttachmentAfterSave === "later"} label="Добавить позже" onPress={() => setRemarkAttachmentAfterSave("later")} />
              <ChoiceButton active={remarkAttachmentAfterSave === "now"} label="Добавить сейчас" onPress={() => setRemarkAttachmentAfterSave("now")} />
            </View>
            <Text style={styles.helperText}>После сохранения можно добавить фото, видео или выбрать несколько файлов из галереи.</Text>
          </ScrollView>
          <View style={[styles.modalActions, { paddingBottom: Math.max(insets.bottom + 12, 22) }]}>
            <PrimaryButton disabled={loading} label="Удалить черновик" onPress={onDeleteDraft} variant="secondary" />
            <PrimaryButton disabled={loading} label="Отмена" onPress={() => requestModalClose(hasUnsavedChanges, loading, onClose)} variant="secondary" />
            <PrimaryButton disabled={loading} label="Сохранить" onPress={onSave} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function CompleteTaskModal({
  comment,
  error,
  loading,
  onChangeComment,
  onClose,
  onDeleteDraft,
  onSave,
  task
}: {
  comment: string;
  error: string | null;
  loading: boolean;
  onChangeComment: (value: string) => void;
  onClose: () => void;
  onDeleteDraft: () => void;
  onSave: () => void;
  task: WorkTaskDto | null;
}) {
  const insets = useSafeAreaInsets();

  const hasUnsavedChanges = comment.trim().length > 0;
  return (
    <Modal animationType="slide" onRequestClose={() => requestModalClose(hasUnsavedChanges, loading, onClose)} transparent visible={Boolean(task)}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 18}
        style={styles.modalBackdrop}
      >
        <View accessibilityViewIsModal style={styles.modalCard}>
          <Text accessibilityRole="header" style={styles.modalTitle}>Завершить работу</Text>
          {error ? <Text style={[styles.message, { color: "#b91c1c" }]}>{error}</Text> : null}
          <ScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.modalScroll}
          >
            <Text style={styles.label}>Работа</Text>
            <Text style={styles.readOnlyValue}>{task?.title ?? "-"}</Text>
            <Text style={styles.label}>Участок</Text>
            <Text style={styles.readOnlyValue}>{task?.sectionName ?? "Участок не указан"}</Text>
            <Text style={styles.label}>Результат выполнения</Text>
            <TextInput
              multiline
              onChangeText={onChangeComment}
              accessibilityLabel="Результат выполнения"
              placeholder="Что выполнено?"
              placeholderTextColor="#9ca3af"
              style={[styles.input, styles.textarea]}
              textAlignVertical="top"
              value={comment}
            />
          </ScrollView>
          <View style={[styles.modalActions, { paddingBottom: Math.max(insets.bottom + 12, 22) }]}>
            <PrimaryButton disabled={loading} label="Удалить черновик" onPress={onDeleteDraft} variant="secondary" />
            <PrimaryButton disabled={loading} label="Отмена" onPress={() => requestModalClose(hasUnsavedChanges, loading, onClose)} variant="secondary" />
            <PrimaryButton disabled={loading} icon="checkmark-circle-outline" label="Завершить" onPress={onSave} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function TaskMenu({
  loading,
  onClose,
  onComplete,
  onEdit,
  onPause,
  onResume,
  onJoin,
  onAttach,
  onReplace,
  onStart,
  task
}: {
  loading: boolean;
  onClose: () => void;
  onComplete: (task: WorkItemDto) => void;
  onEdit: (task: WorkItemDto) => void;
  onPause: (task: WorkItemDto) => void;
  onResume: (task: WorkItemDto) => void;
  onJoin: (task: WorkItemDto) => void;
  onAttach: (task: WorkItemDto) => void;
  onReplace: (task: WorkItemDto) => void;
  onStart: (task: WorkItemDto) => void;
  task: WorkItemDto | null;
}) {
  const insets = useSafeAreaInsets();
  const primaryAction = task ? getTaskPrimaryAction(task, {
    onComplete,
    onJoin,
    onResume,
    onStart
  }) : null;
  const secondaryActions = task ? getTaskSecondaryActions(task, {
    onAttach,
    onEdit,
    onPause,
    onReplace
  }) : [];

  return (
    <Modal animationType="fade" onRequestClose={() => requestModalClose(false, loading, onClose)} transparent visible={Boolean(task)}>
      <View style={[styles.menuBackdrop, { paddingBottom: Math.max(insets.bottom + 12, 22) }]}>
        <View accessibilityLabel={task?.title ?? "Действия с работой"} accessibilityViewIsModal style={styles.menuCard}>
          <Text accessibilityRole="header" style={styles.modalTitle}>{task?.title ?? "Работа"}</Text>
          {task ? <Text style={styles.menuSubtitle}>{task.sectionName ?? "Участок не указан"} · {statusLabel(task.status)}</Text> : null}
          {primaryAction ? (
            <PrimaryButton disabled={loading} icon={primaryAction.icon} label={primaryAction.label} onPress={primaryAction.onPress} />
          ) : null}
          {secondaryActions.length > 0 ? (
            <View style={styles.menuSecondaryList}>
              {secondaryActions.map((action) => (
                <MenuSecondaryAction
                  disabled={loading}
                  icon={action.icon}
                  key={action.label}
                  label={action.label}
                  onPress={action.onPress}
                  danger={action.danger}
                />
              ))}
            </View>
          ) : null}
          <PrimaryButton disabled={loading} label="Закрыть" onPress={onClose} variant="ghost" />
        </View>
      </View>
    </Modal>
  );
}

type TaskMenuCallbackMap = {
  onAttach: (task: WorkItemDto) => void;
  onComplete: (task: WorkItemDto) => void;
  onEdit: (task: WorkItemDto) => void;
  onJoin: (task: WorkItemDto) => void;
  onPause: (task: WorkItemDto) => void;
  onReplace: (task: WorkItemDto) => void;
  onResume: (task: WorkItemDto) => void;
  onStart: (task: WorkItemDto) => void;
};

function getTaskPrimaryAction(
  task: WorkItemDto,
  handlers: Pick<TaskMenuCallbackMap, "onComplete" | "onJoin" | "onResume" | "onStart">
) {
  if (task.capabilities.canStart && canStartEmuTask(task.status)) {
    return { icon: "play-outline" as const, label: "Начать работу", onPress: () => handlers.onStart(task) };
  }
  if (task.capabilities.canJoin && canStartEmuTask(task.status)) {
    return { icon: "person-add-outline" as const, label: "Присоединиться", onPress: () => handlers.onJoin(task) };
  }
  if (task.capabilities.canResume && canResumeEmuTask(task.status)) {
    return { icon: "play-outline" as const, label: "Продолжить", onPress: () => handlers.onResume(task) };
  }
  if (task.capabilities.canComplete && canCompleteEmuTask(task.status)) {
    return { icon: "checkmark-circle-outline" as const, label: "Завершить", onPress: () => handlers.onComplete(task) };
  }
  return null;
}

function getTaskSecondaryActions(
  task: WorkItemDto,
  handlers: Pick<TaskMenuCallbackMap, "onAttach" | "onEdit" | "onPause" | "onReplace">
) {
  const actions: {
    danger?: boolean;
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    onPress: () => void;
  }[] = [];

  if (task.capabilities.canReplace && canStartEmuTask(task.status)) {
    actions.push({ icon: "swap-horizontal-outline", label: "Принять вместо исполнителя", onPress: () => handlers.onReplace(task) });
  }
  if (task.capabilities.canPause && canPauseEmuTask(task.status)) {
    actions.push({ icon: "pause-outline", label: "Остановить", onPress: () => handlers.onPause(task), danger: true });
  }
  if (task.capabilities.canComplete && canEditEmuTask(task.status)) {
    actions.push({ icon: "create-outline", label: "Изменить", onPress: () => handlers.onEdit(task) });
  }
  if (task.kind === "workSession" && canAttachEmuMedia(task.status)) {
    actions.push({ icon: "attach-outline", label: "Добавить вложение", onPress: () => handlers.onAttach(task) });
  }
  return actions;
}

function MenuSecondaryAction({
  danger,
  disabled,
  icon,
  label,
  onPress
}: {
  danger?: boolean;
  disabled?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuSecondaryAction,
        disabled ? styles.disabledAction : null,
        pressed && !disabled ? styles.menuSecondaryPressed : null
      ]}
    >
      <Ionicons color={danger ? "#ef4444" : "#1e5bff"} name={icon} size={18} />
      <Text style={[styles.menuSecondaryText, danger ? styles.menuSecondaryDanger : null]}>{label}</Text>
    </Pressable>
  );
}

function ParticipationModal({
  action,
  employeeId,
  employees,
  loading,
  onClose,
  onSave,
  previousEmployeeId,
  reason,
  setEmployeeId,
  setPreviousEmployeeId,
  setReason
}: {
  action: ParticipationAction | null;
  employeeId: string;
  employees: MobileEmployeeDto[];
  loading: boolean;
  onClose: () => void;
  onSave: () => void;
  previousEmployeeId: string;
  reason: string;
  setEmployeeId: (value: string) => void;
  setPreviousEmployeeId: (value: string) => void;
  setReason: (value: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const previousOptions = action?.item.actualParticipants
    .filter((participant) => !participant.finishedAt && !participant.isCurrentMobileEmployee)
    .map((participant) => ({ id: participant.employeeId, label: formatShortName(participant.fullName) })) ?? [];
  const title = action?.mode === "replace"
    ? "Принять вместо исполнителя"
    : action?.mode === "join"
      ? "Присоединиться к работе"
      : "Начать работу";
  const hasUnsavedChanges = Boolean(reason.trim() || previousEmployeeId);

  return (
    <Modal animationType="slide" onRequestClose={() => requestModalClose(hasUnsavedChanges, loading, onClose)} transparent visible={Boolean(action)}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalBackdrop}>
        <View accessibilityViewIsModal style={styles.modalCard}>
          <Text accessibilityRole="header" style={styles.modalTitle}>{title}</Text>
          <ScrollView contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.readOnlyValue}>{action?.item.title ?? "-"}</Text>
            <OptionPicker
              label="Фактический исполнитель"
              onSelect={setEmployeeId}
              options={employees.map((employee) => ({ id: employee.employeeId, label: formatShortName(employee.fullName) }))}
              selectedId={employeeId}
            />
            {action?.mode === "replace" ? (
              <OptionPicker label="Прежний исполнитель" onSelect={setPreviousEmployeeId} options={previousOptions} selectedId={previousEmployeeId} />
            ) : null}
            {action?.mode !== "start" ? (
              <>
                <Text style={styles.label}>{action?.mode === "replace" ? "Причина замены" : "Примечание"}</Text>
                <TextInput
                  multiline
                  onChangeText={setReason}
                  placeholder={action?.mode === "replace" ? "Почему меняется исполнитель?" : "Что будете выполнять?"}
                  placeholderTextColor="#9ca3af"
                  accessibilityLabel={action?.mode === "replace" ? "Причина замены" : "Примечание"}
                  style={[styles.input, styles.textarea]}
                  value={reason}
                />
              </>
            ) : null}
          </ScrollView>
          <View style={[styles.modalActions, { paddingBottom: Math.max(insets.bottom + 12, 22) }]}>
            <PrimaryButton disabled={loading} label="Отмена" onPress={() => requestModalClose(hasUnsavedChanges, loading, onClose)} variant="secondary" />
            <PrimaryButton disabled={loading} label={action?.mode === "replace" ? "Подтвердить замену" : "Продолжить"} onPress={onSave} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function OptionPicker({
  label,
  onSelect,
  options,
  selectedId
}: {
  label: string;
  onSelect: (value: string) => void;
  options: { id: string; label: string }[];
  selectedId: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View accessibilityLabel={label} accessibilityRole="radiogroup" style={styles.optionWrap}>
        {options.map((option) => (
          <ChoiceButton active={option.id === selectedId} key={option.id} label={option.label} onPress={() => onSelect(option.id)} />
        ))}
      </View>
    </View>
  );
}

function ChoiceButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={onPress} style={[styles.choice, active ? styles.choiceActive : null]}>
      <Text style={[styles.choiceText, active ? styles.choiceTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function EmptyCard({ text, title }: { text: string; title: string }) {
  return (
    <Card>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.text}>{text}</Text>
    </Card>
  );
}
