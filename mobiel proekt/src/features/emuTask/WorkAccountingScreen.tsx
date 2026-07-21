import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
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

function requestModalClose(hasUnsavedChanges: boolean, loading: boolean, onClose: () => void) {
  if (loading) {
    return;
  }
  if (!hasUnsavedChanges) {
    onClose();
    return;
  }
  Alert.alert("Закрыть без сохранения?", "Введённые данные будут потеряны.", [
    { text: "Продолжить редактирование", style: "cancel" },
    { text: "Закрыть", style: "destructive", onPress: onClose }
  ]);
}

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
      setMessage("Выберите сотрудника, участок и заполните задачу.");
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
        setMessage("Изменение работы сохранено на телефоне и будет отправлено на сервер.");
      } else {
        await createWorkTaskLocally({
          employeeId: employee.employeeId,
          employeeName: employee.fullName,
          sectionId: section.sectionId,
          sectionName: section.name,
          taskDescription: taskText
        });
        setMessage("Работа создана на телефоне и появится в ЭМУ после синхронизации.");
      }

      setTaskModal(null);
      await reloadLocal();
      triggerForegroundSyncWithRetry();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить работу.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveRemark() {
    const employee = employees.find((item) => item.employeeId === remarkEmployeeId);
    const section = sections.find((item) => item.sectionId === remarkSectionId);
    if (!employee || !section || !remarkComment.trim()) {
      setMessage("Выберите сотрудника, участок и заполните описание замечания.");
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
      setMessage("Замечание сохранено на телефоне и будет отправлено на сервер.");

      if (remarkAttachmentAfterSave === "now") {
        setAttachmentRemark({ remarkId, title: section.name });
      } else {
        triggerForegroundSyncWithRetry();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить замечание.");
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
      setMessage("Заполните результат работы перед завершением.");
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      await completeWorkTaskLocally(completeTask, completeComment.trim());
      setCompleteTask(null);
      setCompleteComment("");
      await reloadLocal();
      setMessage("Работа завершена на телефоне и будет отправлена на сервер.");
      triggerForegroundSyncWithRetry();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось завершить работу.");
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
      triggerForegroundSyncWithRetry();
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
    <Screen title="Работы" subtitle="Учет работ и замечания по смене доступны оффлайн.">
      <View style={styles.segment}>
        <SegmentButton active={tab === "tasks"} label="Учет работ" onPress={() => setTab("tasks")} />
        <SegmentButton active={tab === "remarks"} label="Замечания" onPress={() => setTab("remarks")} />
      </View>

      {message ? <Text style={[styles.message, { color: colors.primary }]}>{message}</Text> : null}

      {tab === "tasks" ? (
        <>
          <PrimaryButton disabled={loading} icon="add-circle-outline" label="Создать и начать" onPress={openCreateTask} />
          <View style={styles.segment}>
            <SegmentButton active={taskFilter === "mine"} label="Мои" onPress={() => setTaskFilter("mine")} />
            <SegmentButton active={taskFilter === "available"} label="Доступные" onPress={() => setTaskFilter("available")} />
            <SegmentButton active={taskFilter === "history"} label="История" onPress={() => setTaskFilter("history")} />
          </View>
          {filteredTasks.length === 0 ? (
            <EmptyCard title="Работ нет" text="Создайте работу на телефоне или дождитесь назначения из ЭМУ." />
          ) : (
            filteredTasks.map((task) => (
              <Card key={task.taskId}>
                <View style={styles.row}>
                  <View style={styles.titleBox}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{task.title}</Text>
                    <Text style={[styles.text, { color: colors.mutedText }]}>{task.sectionName ?? "Участок не указан"}</Text>
                  </View>
                  <Pressable accessibilityRole="button" onPress={() => setMenuTask(task)} style={styles.iconButton}>
                    <Ionicons color={colors.mutedText} name="ellipsis-horizontal" size={22} />
                  </Pressable>
                </View>
                <View style={styles.metaRow}>
                  <StatusPill label={statusLabel(task.status)} tone={statusTone(task.status)} />
                  <StatusPill label={task.syncStatus === "synced" ? "Синхронизировано" : "Ожидает отправки"} tone={task.syncStatus === "synced" ? "success" : "warning"} />
                </View>
                <Text style={[styles.text, { color: colors.mutedText }]}>Исполнители: {formatParticipants(task)}</Text>
                <Text style={[styles.muted, { color: colors.mutedText }]}>{formatWorkAttachments(task)}</Text>
                <Text style={[styles.muted, { color: colors.mutedText }]}>Создано: {formatDateTime(task.createdAtLocal)}</Text>
              </Card>
            ))
          )}
        </>
      ) : (
        <>
          <PrimaryButton disabled={loading} icon="add-circle-outline" label="Создать замечание" onPress={openCreateRemark} />
          {remarks.length === 0 ? (
            <EmptyCard title="Замечаний нет" text="Добавьте замечание по смене, участку и приложите фото при необходимости." />
          ) : (
            remarks.map((remark) => (
              <Card key={remark.remarkId}>
                <View style={styles.row}>
                  <View style={styles.titleBox}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{remark.sectionName ?? "Замечание"}</Text>
                    <Text style={[styles.text, { color: colors.mutedText }]} numberOfLines={4}>{remark.comment}</Text>
                  </View>
                  <StatusPill label={remarkStatusLabel(remark.status)} tone={remarkStatusTone(remark.status)} />
                </View>
                <Text style={[styles.text, { color: colors.mutedText }]}>Исполнитель: {remark.employeeName ? formatShortName(remark.employeeName) : "не указан"}</Text>
                <Text style={[styles.muted, { color: colors.mutedText }]}>Дата: {formatDateTime(remark.createdAtLocal)}</Text>
                <Text style={[styles.muted, { color: colors.mutedText }]}>Вложения: {remark.mediaClientFileIds.length}</Text>
                <PrimaryButton
                  disabled={loading}
                  icon="attach-outline"
                  label="Добавить вложение"
                  onPress={() => setAttachmentRemark({ remarkId: remark.remarkId, title: remark.sectionName ?? "Замечание" })}
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
        loading={loading}
        onChangeComment={setCompleteComment}
        onClose={() => setCompleteTask(null)}
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
            <PrimaryButton disabled={loading} label="Отмена" onPress={() => requestModalClose(hasUnsavedChanges, loading, onClose)} variant="secondary" />
            <PrimaryButton disabled={loading} label="Сохранить" onPress={onSave} />
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
  if (task.capabilities.canStart) {
    return { icon: "play-outline" as const, label: "Начать работу", onPress: () => handlers.onStart(task) };
  }
  if (task.capabilities.canJoin) {
    return { icon: "person-add-outline" as const, label: "Присоединиться", onPress: () => handlers.onJoin(task) };
  }
  if (task.capabilities.canResume) {
    return { icon: "play-outline" as const, label: "Продолжить", onPress: () => handlers.onResume(task) };
  }
  if (task.capabilities.canComplete) {
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

  if (task.capabilities.canReplace) {
    actions.push({ icon: "swap-horizontal-outline", label: "Принять вместо исполнителя", onPress: () => handlers.onReplace(task) });
  }
  if (task.capabilities.canPause) {
    actions.push({ icon: "pause-outline", label: "Остановить", onPress: () => handlers.onPause(task), danger: true });
  }
  if (task.capabilities.canComplete) {
    actions.push({ icon: "create-outline", label: "Изменить", onPress: () => handlers.onEdit(task) });
  }
  if (task.kind === "workSession") {
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
