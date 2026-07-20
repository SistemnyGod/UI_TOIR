import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { createShiftRemarkLocally, listShiftRemarks, ShiftRemark } from "@/db/repositories/shiftRemarkRepository";
import {
  completeWorkTaskLocally,
  createWorkTaskLocally,
  joinWorkTaskLocally,
  listEmuSections,
  listLocalWorkItems,
  listMobileEmployees,
  pauseWorkTaskLocally,
  replaceWorkTaskParticipantLocally,
  resumeWorkTaskLocally,
  startPlannedWorkLocally,
  updateWorkTaskLocally
} from "@/db/repositories/workTaskRepository";
import { MobileEmployeeDto, MobileEmuSectionDto, WorkItemDto, WorkTaskDto } from "@/domain/emu/emuTypes";
import {
  formatDateTime,
  formatParticipants,
  formatShortName,
  formatWorkAttachments,
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
import { loadWorkItemsOfflineFirst } from "@/services/workTaskService";
import { triggerForegroundSyncWithRetry } from "@/sync/syncTriggers";
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

export function WorkAccountingScreen() {
  const { colors } = useAppTheme();
  const [tab, setTab] = useState<WorkTab>("tasks");
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("mine");
  const [tasks, setTasks] = useState<WorkItemDto[]>([]);
  const [remarks, setRemarks] = useState<ShiftRemark[]>([]);
  const [employees, setEmployees] = useState<MobileEmployeeDto[]>([]);
  const [sections, setSections] = useState<MobileEmuSectionDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [taskModal, setTaskModal] = useState<{ mode: "create" | "edit"; task?: WorkTaskDto } | null>(null);
  const [remarkModalOpen, setRemarkModalOpen] = useState(false);
  const [menuTask, setMenuTask] = useState<WorkItemDto | null>(null);
  const [completeTask, setCompleteTask] = useState<WorkTaskDto | null>(null);
  const [completeComment, setCompleteComment] = useState("");
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

  const reloadLocal = useCallback(async () => {
    const [nextTasks, nextRemarks, nextEmployees, nextSections] = await Promise.all([
      listLocalWorkItems(),
      listShiftRemarks(),
      listMobileEmployees(),
      listEmuSections()
    ]);
    setTasks(nextTasks);
    setRemarks(nextRemarks);
    setEmployees(nextEmployees);
    setSections(nextSections);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      setLoading(true);

      void Promise.all([loadWorkItemsOfflineFirst(), listShiftRemarks(), listMobileEmployees(), listEmuSections()])
        .then(([nextTasks, nextRemarks, nextEmployees, nextSections]) => {
          if (isMounted) {
            setTasks(nextTasks);
            setRemarks(nextRemarks);
            setEmployees(nextEmployees);
            setSections(nextSections);
            setMessage(null);
          }
        })
        .finally(() => {
          if (isMounted) {
            setLoading(false);
          }
        });

      return () => {
        isMounted = false;
      };
    }, [])
  );

  function openCreateTask() {
    setTaskEmployeeId(defaultEmployeeId());
    setTaskSectionId(defaultSectionId());
    setTaskText("");
    setTaskModal({ mode: "create" });
  }

  function openEditTask(task: WorkTaskDto) {
    setTaskEmployeeId(task.employeeId ?? defaultEmployeeId());
    setTaskSectionId(task.sectionId ?? defaultSectionId());
    setTaskText(task.title);
    setMenuTask(null);
    setTaskModal({ mode: "edit", task });
  }

  function openCompleteTask(task: WorkTaskDto) {
    setMenuTask(null);
    setCompleteTask(task);
    setCompleteComment("");
  }

  function openCreateRemark() {
    setRemarkEmployeeId(defaultEmployeeId());
    setRemarkSectionId(defaultSectionId());
    setRemarkComment("");
    setRemarkAttachmentAfterSave("later");
    setRemarkModalOpen(true);
  }

  async function handleSaveTask() {
    const employee = employees.find((item) => item.employeeId === taskEmployeeId);
    const section = sections.find((item) => item.sectionId === taskSectionId);
    if (!employee || !section || !taskText.trim()) {
      setMessage("Р’С‹Р±РµСЂРёС‚Рµ СЃРѕС‚СЂСѓРґРЅРёРєР°, СѓС‡Р°СЃС‚РѕРє Рё Р·Р°РїРѕР»РЅРёС‚Рµ Р·Р°РґР°С‡Сѓ.");
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      if (taskModal?.mode === "edit" && taskModal.task) {
        await updateWorkTaskLocally({
          task: taskModal.task,
          sectionId: section.sectionId,
          sectionName: section.name,
          taskDescription: taskText
        });
        setMessage("РР·РјРµРЅРµРЅРёРµ СЂР°Р±РѕС‚С‹ СЃРѕС…СЂР°РЅРµРЅРѕ РЅР° С‚РµР»РµС„РѕРЅРµ Рё Р±СѓРґРµС‚ РѕС‚РїСЂР°РІР»РµРЅРѕ РЅР° СЃРµСЂРІРµСЂ.");
      } else {
        await createWorkTaskLocally({
          employeeId: employee.employeeId,
          employeeName: employee.fullName,
          sectionId: section.sectionId,
          sectionName: section.name,
          taskDescription: taskText
        });
        setMessage("Р Р°Р±РѕС‚Р° СЃРѕР·РґР°РЅР° РЅР° С‚РµР»РµС„РѕРЅРµ Рё РїРѕСЏРІРёС‚СЃСЏ РІ Р­РњРЈ РїРѕСЃР»Рµ СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёРё.");
      }

      setTaskModal(null);
      await reloadLocal();
      triggerForegroundSyncWithRetry();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ СЂР°Р±РѕС‚Сѓ.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveRemark() {
    const employee = employees.find((item) => item.employeeId === remarkEmployeeId);
    const section = sections.find((item) => item.sectionId === remarkSectionId);
    if (!employee || !section || !remarkComment.trim()) {
      setMessage("Р’С‹Р±РµСЂРёС‚Рµ СЃРѕС‚СЂСѓРґРЅРёРєР°, СѓС‡Р°СЃС‚РѕРє Рё Р·Р°РїРѕР»РЅРёС‚Рµ РѕРїРёСЃР°РЅРёРµ Р·Р°РјРµС‡Р°РЅРёСЏ.");
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const remarkId = await createShiftRemarkLocally({
        comment: remarkComment,
        sectionId: section.sectionId,
        sectionName: section.name,
        employeeId: employee.employeeId,
        employeeName: employee.fullName
      });
      setRemarkModalOpen(false);
      await reloadLocal();
      setMessage("Р—Р°РјРµС‡Р°РЅРёРµ СЃРѕС…СЂР°РЅРµРЅРѕ РЅР° С‚РµР»РµС„РѕРЅРµ Рё Р±СѓРґРµС‚ РѕС‚РїСЂР°РІР»РµРЅРѕ РЅР° СЃРµСЂРІРµСЂ.");

      if (remarkAttachmentAfterSave === "now") {
        setAttachmentRemark({ remarkId, title: section.name });
      } else {
        triggerForegroundSyncWithRetry();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ Р·Р°РјРµС‡Р°РЅРёРµ.");
    } finally {
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
      triggerForegroundSyncWithRetry();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : errorMessage);
    } finally {
      setLoading(false);
    }
  }

  async function handleCompleteTask() {
    if (!completeTask) {
      return;
    }

    if (!completeComment.trim()) {
      setMessage("Р—Р°РїРѕР»РЅРёС‚Рµ СЂРµР·СѓР»СЊС‚Р°С‚ СЂР°Р±РѕС‚С‹ РїРµСЂРµРґ Р·Р°РІРµСЂС€РµРЅРёРµРј.");
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      await completeWorkTaskLocally(completeTask, completeComment.trim());
      setCompleteTask(null);
      setCompleteComment("");
      await reloadLocal();
      setMessage("Р Р°Р±РѕС‚Р° Р·Р°РІРµСЂС€РµРЅР° РЅР° С‚РµР»РµС„РѕРЅРµ Рё Р±СѓРґРµС‚ РѕС‚РїСЂР°РІР»РµРЅР° РЅР° СЃРµСЂРІРµСЂ.");
      triggerForegroundSyncWithRetry();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РІРµСЂС€РёС‚СЊ СЂР°Р±РѕС‚Сѓ.");
    } finally {
      setLoading(false);
    }
  }

  function defaultEmployeeId() {
    return employees.length === 1 ? employees[0].employeeId : "";
  }

  function defaultSectionId() {
    return sections[0]?.sectionId ?? "";
  }

  const filteredTasks = tasks.filter((task) => {
    const belongsToCurrentEmployee = task.actualParticipants.some((item) => item.isCurrentMobileEmployee)
      || task.assignedEmployees.some((item) => item.isCurrentMobileEmployee);
    const completed = task.status === "completedLocal" || task.status === "completedServer" || task.status === "cancelled";
    if (taskFilter === "history") {
      return completed && belongsToCurrentEmployee;
    }
    if (taskFilter === "available") {
      return !completed && !belongsToCurrentEmployee;
    }
    return !completed && belongsToCurrentEmployee;
  });

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
      setMessage("Р’С‹Р±РµСЂРёС‚Рµ С„Р°РєС‚РёС‡РµСЃРєРѕРіРѕ РёСЃРїРѕР»РЅРёС‚РµР»СЏ.");
      return;
    }
    if (participationAction.mode === "replace" && (!participationPreviousEmployeeId || !participationReason.trim())) {
      setMessage("Р’С‹Р±РµСЂРёС‚Рµ РїСЂРµР¶РЅРµРіРѕ РёСЃРїРѕР»РЅРёС‚РµР»СЏ Рё СѓРєР°Р¶РёС‚Рµ РїСЂРёС‡РёРЅСѓ Р·Р°РјРµРЅС‹.");
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
      setMessage("Р”РµР№СЃС‚РІРёРµ СЃРѕС…СЂР°РЅРµРЅРѕ РЅР° С‚РµР»РµС„РѕРЅРµ Рё Р±СѓРґРµС‚ РѕС‚РїСЂР°РІР»РµРЅРѕ РІ Р­РњРЈ.");
      triggerForegroundSyncWithRetry();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "РќРµ СѓРґР°Р»РѕСЃСЊ РёР·РјРµРЅРёС‚СЊ РёСЃРїРѕР»РЅРёС‚РµР»СЏ СЂР°Р±РѕС‚С‹.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAttachWorkMedia(kind: "photo" | "video" | "gallery") {
    const workTaskId = attachmentTask?.workSessionId ?? attachmentTask?.itemId ?? null;
    if (!workTaskId || attachmentTask?.kind === "planTask") {
      setMessage("РЎРЅР°С‡Р°Р»Р° РЅР°С‡РЅРёС‚Рµ СЂР°Р±РѕС‚Сѓ, Р·Р°С‚РµРј РґРѕР±Р°РІСЊС‚Рµ РІР»РѕР¶РµРЅРёСЏ.");
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      if (kind === "photo") {
        await attachWorkPhotoFromCamera(workTaskId);
        setMessage("Р¤РѕС‚Рѕ СЃРѕС…СЂР°РЅРµРЅРѕ РЅР° С‚РµР»РµС„РѕРЅРµ Рё Р±СѓРґРµС‚ РѕС‚РїСЂР°РІР»РµРЅРѕ РІ Р­РњРЈ.");
      } else if (kind === "video") {
        await attachWorkVideoFromCamera(workTaskId);
        setMessage("Р’РёРґРµРѕ СЃРѕС…СЂР°РЅРµРЅРѕ РЅР° С‚РµР»РµС„РѕРЅРµ Рё Р±СѓРґРµС‚ РѕС‚РїСЂР°РІР»РµРЅРѕ РІ Р­РњРЈ.");
      } else {
        const result = await attachWorkMediaFromGallery(workTaskId);
        if (result.status === "attached") {
          const suffix = result.errors.length ? ` РћС‚РєР»РѕРЅРµРЅРѕ: ${result.errors.join("; ")}` : "";
          setMessage(`Р”РѕР±Р°РІР»РµРЅРѕ РІР»РѕР¶РµРЅРёР№: ${result.attachedCount}. Р¤РѕС‚Рѕ: ${result.photoCount}, РІРёРґРµРѕ: ${result.videoCount}.${suffix}`);
        }
      }
      setAttachmentTask(null);
      await reloadLocal();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "РќРµ СѓРґР°Р»РѕСЃСЊ РґРѕР±Р°РІРёС‚СЊ РІР»РѕР¶РµРЅРёРµ Рє СЂР°Р±РѕС‚Рµ.");
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
        setMessage("Р¤РѕС‚Рѕ Р·Р°РјРµС‡Р°РЅРёСЏ СЃРѕС…СЂР°РЅРµРЅРѕ РЅР° С‚РµР»РµС„РѕРЅРµ Рё Р±СѓРґРµС‚ РѕС‚РїСЂР°РІР»РµРЅРѕ РЅР° СЃРµСЂРІРµСЂ.");
      } else if (kind === "video") {
        await attachRemarkVideoFromCamera(attachmentRemark.remarkId);
        setMessage("Р’РёРґРµРѕ Р·Р°РјРµС‡Р°РЅРёСЏ СЃРѕС…СЂР°РЅРµРЅРѕ РЅР° С‚РµР»РµС„РѕРЅРµ Рё Р±СѓРґРµС‚ РѕС‚РїСЂР°РІР»РµРЅРѕ РЅР° СЃРµСЂРІРµСЂ.");
      } else {
        const result = await attachRemarkMediaFromGallery(attachmentRemark.remarkId);
        if (result.status === "attached") {
          const suffix = result.errors.length ? ` РћС‚РєР»РѕРЅРµРЅРѕ: ${result.errors.join("; ")}` : "";
          setMessage(`Р”РѕР±Р°РІР»РµРЅРѕ РІР»РѕР¶РµРЅРёР№ Рє Р·Р°РјРµС‡Р°РЅРёСЋ: ${result.attachedCount}. Р¤РѕС‚Рѕ: ${result.photoCount}, РІРёРґРµРѕ: ${result.videoCount}.${suffix}`);
        }
      }
      setAttachmentRemark(null);
      await reloadLocal();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "РќРµ СѓРґР°Р»РѕСЃСЊ РґРѕР±Р°РІРёС‚СЊ РІР»РѕР¶РµРЅРёРµ Рє Р·Р°РјРµС‡Р°РЅРёСЋ.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen title="Р Р°Р±РѕС‚С‹" subtitle="РЈС‡РµС‚ СЂР°Р±РѕС‚ Рё Р·Р°РјРµС‡Р°РЅРёСЏ РїРѕ СЃРјРµРЅРµ РґРѕСЃС‚СѓРїРЅС‹ РѕС„С„Р»Р°Р№РЅ.">
      <View style={styles.segment}>
        <SegmentButton active={tab === "tasks"} label="РЈС‡РµС‚ СЂР°Р±РѕС‚" onPress={() => setTab("tasks")} />
        <SegmentButton active={tab === "remarks"} label="Р—Р°РјРµС‡Р°РЅРёСЏ" onPress={() => setTab("remarks")} />
      </View>

      {message ? <Text style={[styles.message, { color: colors.primary }]}>{message}</Text> : null}

      {tab === "tasks" ? (
        <>
          <PrimaryButton disabled={loading} icon="add-circle-outline" label="РЎРѕР·РґР°С‚СЊ Рё РЅР°С‡Р°С‚СЊ" onPress={openCreateTask} />
          <View style={styles.segment}>
            <SegmentButton active={taskFilter === "mine"} label="РњРѕРё" onPress={() => setTaskFilter("mine")} />
            <SegmentButton active={taskFilter === "available"} label="Р”РѕСЃС‚СѓРїРЅС‹Рµ" onPress={() => setTaskFilter("available")} />
            <SegmentButton active={taskFilter === "history"} label="РСЃС‚РѕСЂРёСЏ" onPress={() => setTaskFilter("history")} />
          </View>
          {filteredTasks.length === 0 ? (
            <EmptyCard title="Р Р°Р±РѕС‚ РЅРµС‚" text="РЎРѕР·РґР°Р№С‚Рµ СЂР°Р±РѕС‚Сѓ РЅР° С‚РµР»РµС„РѕРЅРµ РёР»Рё РґРѕР¶РґРёС‚РµСЃСЊ РЅР°Р·РЅР°С‡РµРЅРёСЏ РёР· Р­РњРЈ." />
          ) : (
            filteredTasks.map((task) => (
              <Card key={task.taskId}>
                <View style={styles.row}>
                  <View style={styles.titleBox}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{task.title}</Text>
                    <Text style={[styles.text, { color: colors.mutedText }]}>{task.sectionName ?? "РЈС‡Р°СЃС‚РѕРє РЅРµ СѓРєР°Р·Р°РЅ"}</Text>
                  </View>
                  <Pressable accessibilityRole="button" onPress={() => setMenuTask(task)} style={styles.iconButton}>
                    <Ionicons color={colors.mutedText} name="ellipsis-horizontal" size={22} />
                  </Pressable>
                </View>
                <View style={styles.metaRow}>
                  <StatusPill label={statusLabel(task.status)} tone={statusTone(task.status)} />
                  <StatusPill label={task.syncStatus === "synced" ? "РЎРёРЅС…СЂРѕРЅРёР·РёСЂРѕРІР°РЅРѕ" : "РћР¶РёРґР°РµС‚ РѕС‚РїСЂР°РІРєРё"} tone={task.syncStatus === "synced" ? "success" : "warning"} />
                </View>
                <Text style={[styles.text, { color: colors.mutedText }]}>РСЃРїРѕР»РЅРёС‚РµР»Рё: {formatParticipants(task)}</Text>
                <Text style={[styles.muted, { color: colors.mutedText }]}>{formatWorkAttachments(task)}</Text>
                <Text style={[styles.muted, { color: colors.mutedText }]}>РЎРѕР·РґР°РЅРѕ: {formatDateTime(task.createdAtLocal)}</Text>
              </Card>
            ))
          )}
        </>
      ) : (
        <>
          <PrimaryButton disabled={loading} icon="add-circle-outline" label="РЎРѕР·РґР°С‚СЊ Р·Р°РјРµС‡Р°РЅРёРµ" onPress={openCreateRemark} />
          {remarks.length === 0 ? (
            <EmptyCard title="Р—Р°РјРµС‡Р°РЅРёР№ РЅРµС‚" text="Р”РѕР±Р°РІСЊС‚Рµ Р·Р°РјРµС‡Р°РЅРёРµ РїРѕ СЃРјРµРЅРµ, СѓС‡Р°СЃС‚РєСѓ Рё РїСЂРёР»РѕР¶РёС‚Рµ С„РѕС‚Рѕ РїСЂРё РЅРµРѕР±С…РѕРґРёРјРѕСЃС‚Рё." />
          ) : (
            remarks.map((remark) => (
              <Card key={remark.remarkId}>
                <View style={styles.row}>
                  <View style={styles.titleBox}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{remark.sectionName ?? "Р—Р°РјРµС‡Р°РЅРёРµ"}</Text>
                    <Text style={[styles.text, { color: colors.mutedText }]} numberOfLines={4}>{remark.comment}</Text>
                  </View>
                  <StatusPill label={remarkStatusLabel(remark.status)} tone={remarkStatusTone(remark.status)} />
                </View>
                <Text style={[styles.text, { color: colors.mutedText }]}>РСЃРїРѕР»РЅРёС‚РµР»СЊ: {remark.employeeName ? formatShortName(remark.employeeName) : "РЅРµ СѓРєР°Р·Р°РЅ"}</Text>
                <Text style={[styles.muted, { color: colors.mutedText }]}>Р”Р°С‚Р°: {formatDateTime(remark.createdAtLocal)}</Text>
                <Text style={[styles.muted, { color: colors.mutedText }]}>Р’Р»РѕР¶РµРЅРёСЏ: {remark.mediaClientFileIds.length}</Text>
                <PrimaryButton
                  disabled={loading}
                  icon="attach-outline"
                  label="Р”РѕР±Р°РІРёС‚СЊ РІР»РѕР¶РµРЅРёРµ"
                  onPress={() => setAttachmentRemark({ remarkId: remark.remarkId, title: remark.sectionName ?? "Р—Р°РјРµС‡Р°РЅРёРµ" })}
                  variant="secondary"
                />
              </Card>
            ))
          )}
        </>
      )}

      <TaskModal
        employees={employees}
        loading={loading}
        modal={taskModal}
        onClose={() => setTaskModal(null)}
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
        loading={loading}
        onClose={() => setRemarkModalOpen(false)}
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
        onComplete={openCompleteTask}
        onEdit={openEditTask}
        onPause={(task) =>
          applyTaskAction(
            () => pauseWorkTaskLocally(task, ""),
            "Р Р°Р±РѕС‚Р° РїРѕСЃС‚Р°РІР»РµРЅР° РЅР° РїР°СѓР·Сѓ.",
            "РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕСЃС‚Р°РІРёС‚СЊ СЂР°Р±РѕС‚Сѓ РЅР° РїР°СѓР·Сѓ."
          )
        }
        onResume={(task) =>
          applyTaskAction(
            () => resumeWorkTaskLocally(task, ""),
            "Р Р°Р±РѕС‚Р° РїСЂРѕРґРѕР»Р¶РµРЅР°.",
            "РќРµ СѓРґР°Р»РѕСЃСЊ РїСЂРѕРґРѕР»Р¶РёС‚СЊ СЂР°Р±РѕС‚Сѓ."
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
        loading={loading}
        onChangeComment={setCompleteComment}
        onClose={() => setCompleteTask(null)}
        onSave={handleCompleteTask}
        task={completeTask}
      />
      <ActionSheet
        actions={[
          { icon: "camera-outline", label: "РЎРґРµР»Р°С‚СЊ С„РѕС‚Рѕ", onPress: () => void handleAttachWorkMedia("photo") },
          { icon: "videocam-outline", label: "РЎРЅСЏС‚СЊ РІРёРґРµРѕ", onPress: () => void handleAttachWorkMedia("video") },
          { icon: "images-outline", label: "Р’С‹Р±СЂР°С‚СЊ РёР· РіР°Р»РµСЂРµРё", onPress: () => void handleAttachWorkMedia("gallery") }
        ]}
        onClose={() => setAttachmentTask(null)}
        title="Р’Р»РѕР¶РµРЅРёРµ Рє СЂР°Р±РѕС‚Рµ"
        visible={Boolean(attachmentTask)}
      />
      <ActionSheet
        actions={[
          { icon: "camera-outline", label: "РЎРґРµР»Р°С‚СЊ С„РѕС‚Рѕ", onPress: () => void handleAttachRemarkMedia("photo") },
          { icon: "videocam-outline", label: "РЎРЅСЏС‚СЊ РІРёРґРµРѕ", onPress: () => void handleAttachRemarkMedia("video") },
          { icon: "images-outline", label: "Р’С‹Р±СЂР°С‚СЊ РёР· РіР°Р»РµСЂРµРё", onPress: () => void handleAttachRemarkMedia("gallery") }
        ]}
        onClose={() => setAttachmentRemark(null)}
        title={attachmentRemark ? `Р’Р»РѕР¶РµРЅРёРµ: ${attachmentRemark.title}` : "Р’Р»РѕР¶РµРЅРёРµ Рє Р·Р°РјРµС‡Р°РЅРёСЋ"}
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
  employees,
  loading,
  modal,
  onClose,
  onSave,
  sections,
  setTaskEmployeeId,
  setTaskSectionId,
  setTaskText,
  taskEmployeeId,
  taskSectionId,
  taskText
}: {
  employees: MobileEmployeeDto[];
  loading: boolean;
  modal: { mode: "create" | "edit"; task?: WorkTaskDto } | null;
  onClose: () => void;
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

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={Boolean(modal)}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 18}
        style={styles.modalBackdrop}
      >
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{modal?.mode === "edit" ? "РР·РјРµРЅРёС‚СЊ СЂР°Р±РѕС‚Сѓ" : "РЎРѕР·РґР°С‚СЊ СЂР°Р±РѕС‚Сѓ"}</Text>
          <ScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.modalScroll}
          >
            <OptionPicker label="РСЃРїРѕР»РЅРёС‚РµР»СЊ" options={employees.map((item) => ({ id: item.employeeId, label: formatShortName(item.fullName) }))} selectedId={taskEmployeeId} onSelect={setTaskEmployeeId} />
            <OptionPicker label="РЈС‡Р°СЃС‚РѕРє" options={sections.map((item) => ({ id: item.sectionId, label: item.name }))} selectedId={taskSectionId} onSelect={setTaskSectionId} />
            <Text style={styles.label}>Р”Р°С‚Р° Рё РІСЂРµРјСЏ</Text>
            <Text style={styles.readOnlyValue}>РђРІС‚РѕРјР°С‚РёС‡РµСЃРєРё РїСЂРё СЃРѕС…СЂР°РЅРµРЅРёРё</Text>
            <Text style={styles.label}>Р—Р°РґР°С‡Р°</Text>
            <TextInput multiline onChangeText={setTaskText} placeholder="Р§С‚Рѕ РЅСѓР¶РЅРѕ РІС‹РїРѕР»РЅРёС‚СЊ?" placeholderTextColor="#9ca3af" style={[styles.input, styles.textarea]} textAlignVertical="top" value={taskText} />
          </ScrollView>
          <View style={[styles.modalActions, { paddingBottom: Math.max(insets.bottom + 12, 22) }]}>
            <PrimaryButton disabled={loading} label="РћС‚РјРµРЅР°" onPress={onClose} variant="secondary" />
            <PrimaryButton disabled={loading} label="РЎРѕС…СЂР°РЅРёС‚СЊ" onPress={onSave} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function RemarkModal({
  employees,
  loading,
  onClose,
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
  employees: MobileEmployeeDto[];
  loading: boolean;
  onClose: () => void;
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

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={open}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 18}
        style={styles.modalBackdrop}
      >
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>РќРѕРІРѕРµ Р·Р°РјРµС‡Р°РЅРёРµ</Text>
          <ScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.modalScroll}
          >
            <OptionPicker label="РСЃРїРѕР»РЅРёС‚РµР»СЊ" options={employees.map((item) => ({ id: item.employeeId, label: formatShortName(item.fullName) }))} selectedId={remarkEmployeeId} onSelect={setRemarkEmployeeId} />
            <OptionPicker label="РЈС‡Р°СЃС‚РѕРє" options={sections.map((item) => ({ id: item.sectionId, label: item.name }))} selectedId={remarkSectionId} onSelect={setRemarkSectionId} />
            <Text style={styles.label}>Р”Р°С‚Р°</Text>
            <Text style={styles.readOnlyValue}>РђРІС‚РѕРјР°С‚РёС‡РµСЃРєРё РїСЂРё СЃРѕС…СЂР°РЅРµРЅРёРё</Text>
            <Text style={styles.label}>РћРїРёСЃР°РЅРёРµ Р·Р°РјРµС‡Р°РЅРёСЏ</Text>
            <TextInput multiline onChangeText={setRemarkComment} placeholder="РћРїРёС€РёС‚Рµ Р·Р°РјРµС‡Р°РЅРёРµ" placeholderTextColor="#9ca3af" style={[styles.input, styles.textarea]} textAlignVertical="top" value={remarkComment} />
            <Text style={styles.label}>Р’Р»РѕР¶РµРЅРёСЏ</Text>
            <View style={styles.inlineActions}>
              <ChoiceButton active={remarkAttachmentAfterSave === "later"} label="Р”РѕР±Р°РІРёС‚СЊ РїРѕР·Р¶Рµ" onPress={() => setRemarkAttachmentAfterSave("later")} />
              <ChoiceButton active={remarkAttachmentAfterSave === "now"} label="Р”РѕР±Р°РІРёС‚СЊ СЃРµР№С‡Р°СЃ" onPress={() => setRemarkAttachmentAfterSave("now")} />
            </View>
            <Text style={styles.helperText}>РџРѕСЃР»Рµ СЃРѕС…СЂР°РЅРµРЅРёСЏ РјРѕР¶РЅРѕ РґРѕР±Р°РІРёС‚СЊ С„РѕС‚Рѕ, РІРёРґРµРѕ РёР»Рё РІС‹Р±СЂР°С‚СЊ РЅРµСЃРєРѕР»СЊРєРѕ С„Р°Р№Р»РѕРІ РёР· РіР°Р»РµСЂРµРё.</Text>
          </ScrollView>
          <View style={[styles.modalActions, { paddingBottom: Math.max(insets.bottom + 12, 22) }]}>
            <PrimaryButton disabled={loading} label="РћС‚РјРµРЅР°" onPress={onClose} variant="secondary" />
            <PrimaryButton disabled={loading} label="РЎРѕС…СЂР°РЅРёС‚СЊ" onPress={onSave} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function CompleteTaskModal({
  comment,
  loading,
  onChangeComment,
  onClose,
  onSave,
  task
}: {
  comment: string;
  loading: boolean;
  onChangeComment: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  task: WorkTaskDto | null;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={Boolean(task)}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 18}
        style={styles.modalBackdrop}
      >
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Р—Р°РІРµСЂС€РёС‚СЊ СЂР°Р±РѕС‚Сѓ</Text>
          <ScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.modalScroll}
          >
            <Text style={styles.label}>Р Р°Р±РѕС‚Р°</Text>
            <Text style={styles.readOnlyValue}>{task?.title ?? "-"}</Text>
            <Text style={styles.label}>РЈС‡Р°СЃС‚РѕРє</Text>
            <Text style={styles.readOnlyValue}>{task?.sectionName ?? "РЈС‡Р°СЃС‚РѕРє РЅРµ СѓРєР°Р·Р°РЅ"}</Text>
            <Text style={styles.label}>Р РµР·СѓР»СЊС‚Р°С‚ РІС‹РїРѕР»РЅРµРЅРёСЏ</Text>
            <TextInput
              multiline
              onChangeText={onChangeComment}
              placeholder="Р§С‚Рѕ РІС‹РїРѕР»РЅРµРЅРѕ?"
              placeholderTextColor="#9ca3af"
              style={[styles.input, styles.textarea]}
              textAlignVertical="top"
              value={comment}
            />
          </ScrollView>
          <View style={[styles.modalActions, { paddingBottom: Math.max(insets.bottom + 12, 22) }]}>
            <PrimaryButton disabled={loading} label="РћС‚РјРµРЅР°" onPress={onClose} variant="secondary" />
            <PrimaryButton disabled={loading} icon="checkmark-circle-outline" label="Р—Р°РІРµСЂС€РёС‚СЊ" onPress={onSave} />
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
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={Boolean(task)}>
      <View style={[styles.menuBackdrop, { paddingBottom: Math.max(insets.bottom + 12, 22) }]}>
        <View style={styles.menuCard}>
          <Text style={styles.modalTitle}>{task?.title ?? "Р Р°Р±РѕС‚Р°"}</Text>
          {task ? <Text style={styles.menuSubtitle}>{task.sectionName ?? "РЈС‡Р°СЃС‚РѕРє РЅРµ СѓРєР°Р·Р°РЅ"} В· {statusLabel(task.status)}</Text> : null}
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
          <PrimaryButton disabled={loading} label="Р—Р°РєСЂС‹С‚СЊ" onPress={onClose} variant="ghost" />
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
  if (task.capabilities.canStart) {
    return { icon: "play-outline" as const, label: "РќР°С‡Р°С‚СЊ СЂР°Р±РѕС‚Сѓ", onPress: () => handlers.onStart(task) };
  }
  if (task.capabilities.canJoin) {
    return { icon: "person-add-outline" as const, label: "РџСЂРёСЃРѕРµРґРёРЅРёС‚СЊСЃСЏ", onPress: () => handlers.onJoin(task) };
  }
  if (task.capabilities.canResume) {
    return { icon: "play-outline" as const, label: "РџСЂРѕРґРѕР»Р¶РёС‚СЊ", onPress: () => handlers.onResume(task) };
  }
  if (task.capabilities.canComplete) {
    return { icon: "checkmark-circle-outline" as const, label: "Р—Р°РІРµСЂС€РёС‚СЊ", onPress: () => handlers.onComplete(task) };
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

  if (task.capabilities.canReplace) {
    actions.push({ icon: "swap-horizontal-outline", label: "РџСЂРёРЅСЏС‚СЊ РІРјРµСЃС‚Рѕ РёСЃРїРѕР»РЅРёС‚РµР»СЏ", onPress: () => handlers.onReplace(task) });
  }
  if (task.capabilities.canPause) {
    actions.push({ icon: "pause-outline", label: "РћСЃС‚Р°РЅРѕРІРёС‚СЊ", onPress: () => handlers.onPause(task), danger: true });
  }
  if (task.capabilities.canComplete) {
    actions.push({ icon: "create-outline", label: "РР·РјРµРЅРёС‚СЊ", onPress: () => handlers.onEdit(task) });
  }
  if (task.kind === "workSession") {
    actions.push({ icon: "attach-outline", label: "Р”РѕР±Р°РІРёС‚СЊ РІР»РѕР¶РµРЅРёРµ", onPress: () => handlers.onAttach(task) });
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
    ? "РџСЂРёРЅСЏС‚СЊ РІРјРµСЃС‚Рѕ РёСЃРїРѕР»РЅРёС‚РµР»СЏ"
    : action?.mode === "join"
      ? "РџСЂРёСЃРѕРµРґРёРЅРёС‚СЊСЃСЏ Рє СЂР°Р±РѕС‚Рµ"
      : "РќР°С‡Р°С‚СЊ СЂР°Р±РѕС‚Сѓ";

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={Boolean(action)}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{title}</Text>
          <ScrollView contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.readOnlyValue}>{action?.item.title ?? "-"}</Text>
            <OptionPicker
              label="Р¤Р°РєС‚РёС‡РµСЃРєРёР№ РёСЃРїРѕР»РЅРёС‚РµР»СЊ"
              onSelect={setEmployeeId}
              options={employees.map((employee) => ({ id: employee.employeeId, label: formatShortName(employee.fullName) }))}
              selectedId={employeeId}
            />
            {action?.mode === "replace" ? (
              <OptionPicker label="РџСЂРµР¶РЅРёР№ РёСЃРїРѕР»РЅРёС‚РµР»СЊ" onSelect={setPreviousEmployeeId} options={previousOptions} selectedId={previousEmployeeId} />
            ) : null}
            {action?.mode !== "start" ? (
              <>
                <Text style={styles.label}>{action?.mode === "replace" ? "РџСЂРёС‡РёРЅР° Р·Р°РјРµРЅС‹" : "РџСЂРёРјРµС‡Р°РЅРёРµ"}</Text>
                <TextInput
                  multiline
                  onChangeText={setReason}
                  placeholder={action?.mode === "replace" ? "РџРѕС‡РµРјСѓ РјРµРЅСЏРµС‚СЃСЏ РёСЃРїРѕР»РЅРёС‚РµР»СЊ?" : "Р§С‚Рѕ Р±СѓРґРµС‚Рµ РІС‹РїРѕР»РЅСЏС‚СЊ?"}
                  placeholderTextColor="#9ca3af"
                  style={[styles.input, styles.textarea]}
                  value={reason}
                />
              </>
            ) : null}
          </ScrollView>
          <View style={[styles.modalActions, { paddingBottom: Math.max(insets.bottom + 12, 22) }]}>
            <PrimaryButton disabled={loading} label="РћС‚РјРµРЅР°" onPress={onClose} variant="secondary" />
            <PrimaryButton disabled={loading} label={action?.mode === "replace" ? "РџРѕРґС‚РІРµСЂРґРёС‚СЊ Р·Р°РјРµРЅСѓ" : "РџСЂРѕРґРѕР»Р¶РёС‚СЊ"} onPress={onSave} />
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
      <View style={styles.optionWrap}>
        {options.map((option) => (
          <ChoiceButton active={option.id === selectedId} key={option.id} label={option.label} onPress={() => onSelect(option.id)} />
        ))}
      </View>
    </View>
  );
}

function ChoiceButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.choice, active ? styles.choiceActive : null]}>
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
