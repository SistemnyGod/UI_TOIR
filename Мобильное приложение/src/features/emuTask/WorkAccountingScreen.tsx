import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { createShiftRemarkLocally, listShiftRemarks, ShiftRemark } from "@/db/repositories/shiftRemarkRepository";
import {
  completeWorkTaskLocally,
  createWorkTaskLocally,
  listEmuSections,
  listLocalWorkTasks,
  listMobileEmployees,
  pauseWorkTaskLocally,
  resumeWorkTaskLocally,
  updateWorkTaskLocally
} from "@/db/repositories/workTaskRepository";
import { MobileEmployeeDto, MobileEmuSectionDto, WorkTaskDto, WorkTaskStatus } from "@/domain/emu/emuTypes";
import { useAppTheme } from "@/features/settings/themePreference";
import { loadWorkTasksOfflineFirst } from "@/services/workTaskService";
import { triggerForegroundSyncWithRetry } from "@/sync/syncTriggers";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";

type WorkTab = "tasks" | "remarks";
type PhotoAfterSave = "none" | "camera" | "gallery";

export function WorkAccountingScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [tab, setTab] = useState<WorkTab>("tasks");
  const [tasks, setTasks] = useState<WorkTaskDto[]>([]);
  const [remarks, setRemarks] = useState<ShiftRemark[]>([]);
  const [employees, setEmployees] = useState<MobileEmployeeDto[]>([]);
  const [sections, setSections] = useState<MobileEmuSectionDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [taskModal, setTaskModal] = useState<{ mode: "create" | "edit"; task?: WorkTaskDto } | null>(null);
  const [remarkModalOpen, setRemarkModalOpen] = useState(false);
  const [menuTask, setMenuTask] = useState<WorkTaskDto | null>(null);
  const [completeTask, setCompleteTask] = useState<WorkTaskDto | null>(null);
  const [completeComment, setCompleteComment] = useState("");
  const [taskEmployeeId, setTaskEmployeeId] = useState("");
  const [taskSectionId, setTaskSectionId] = useState("");
  const [taskText, setTaskText] = useState("");
  const [remarkEmployeeId, setRemarkEmployeeId] = useState("");
  const [remarkSectionId, setRemarkSectionId] = useState("");
  const [remarkComment, setRemarkComment] = useState("");
  const [remarkPhoto, setRemarkPhoto] = useState<PhotoAfterSave>("none");

  const reloadLocal = useCallback(async () => {
    const [nextTasks, nextRemarks, nextEmployees, nextSections] = await Promise.all([
      listLocalWorkTasks(),
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

      void Promise.all([loadWorkTasksOfflineFirst(), listShiftRemarks(), listMobileEmployees(), listEmuSections()])
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
    setRemarkPhoto("none");
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

      if (remarkPhoto !== "none") {
        router.push(`/camera/capture?remarkId=${remarkId}&mediaKind=photo&source=${remarkPhoto}`);
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

  return (
    <Screen title="Работы" subtitle="Учет работ и замечания по смене доступны оффлайн.">
      <View style={styles.segment}>
        <SegmentButton active={tab === "tasks"} label="Учет работ" onPress={() => setTab("tasks")} />
        <SegmentButton active={tab === "remarks"} label="Замечания" onPress={() => setTab("remarks")} />
      </View>

      {message ? <Text style={[styles.message, { color: colors.primary }]}>{message}</Text> : null}

      {tab === "tasks" ? (
        <>
          <PrimaryButton disabled={loading} icon="add-circle-outline" label="+ Работа" onPress={openCreateTask} />
          {tasks.length === 0 ? (
            <EmptyCard title="Работ нет" text="Создайте работу на телефоне или дождитесь назначения из ЭМУ." />
          ) : (
            tasks.map((task) => (
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
                <Text style={[styles.text, { color: colors.mutedText }]}>Исполнитель: {task.employeeName ? formatShortName(task.employeeName) : "не указан"}</Text>
                <Text style={[styles.muted, { color: colors.mutedText }]}>Создано: {formatDateTime(task.createdAtLocal)}</Text>
              </Card>
            ))
          )}
        </>
      ) : (
        <>
          <PrimaryButton disabled={loading} icon="add-circle-outline" label="+ Замечание" onPress={openCreateRemark} />
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
                <Text style={[styles.muted, { color: colors.mutedText }]}>Фото: {remark.mediaClientFileIds.length}</Text>
                <View style={styles.inlineActions}>
                  <PrimaryButton disabled={loading} icon="camera-outline" label="Сделать фото" onPress={() => router.push(`/camera/capture?remarkId=${remark.remarkId}&mediaKind=photo`)} variant="secondary" />
                  <PrimaryButton disabled={loading} icon="images-outline" label="Из галереи" onPress={() => router.push(`/camera/capture?remarkId=${remark.remarkId}&mediaKind=photo&source=gallery`)} variant="secondary" />
                </View>
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
        remarkPhoto={remarkPhoto}
        remarkSectionId={remarkSectionId}
        sections={sections}
        setRemarkComment={setRemarkComment}
        setRemarkEmployeeId={setRemarkEmployeeId}
        setRemarkPhoto={setRemarkPhoto}
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
        task={menuTask}
      />

      <CompleteTaskModal
        comment={completeComment}
        loading={loading}
        onChangeComment={setCompleteComment}
        onClose={() => setCompleteTask(null)}
        onSave={handleCompleteTask}
        task={completeTask}
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
          <Text style={styles.modalTitle}>{modal?.mode === "edit" ? "Изменить работу" : "Создать работу"}</Text>
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
            <TextInput multiline onChangeText={setTaskText} placeholder="Что нужно выполнить?" placeholderTextColor="#9ca3af" style={[styles.input, styles.textarea]} textAlignVertical="top" value={taskText} />
          </ScrollView>
          <View style={[styles.modalActions, { paddingBottom: Math.max(insets.bottom + 12, 22) }]}>
            <PrimaryButton disabled={loading} label="Отмена" onPress={onClose} variant="secondary" />
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
  remarkComment,
  remarkEmployeeId,
  remarkPhoto,
  remarkSectionId,
  sections,
  setRemarkComment,
  setRemarkEmployeeId,
  setRemarkPhoto,
  setRemarkSectionId
}: {
  employees: MobileEmployeeDto[];
  loading: boolean;
  onClose: () => void;
  onSave: () => void;
  open: boolean;
  remarkComment: string;
  remarkEmployeeId: string;
  remarkPhoto: PhotoAfterSave;
  remarkSectionId: string;
  sections: MobileEmuSectionDto[];
  setRemarkComment: (value: string) => void;
  setRemarkEmployeeId: (value: string) => void;
  setRemarkPhoto: (value: PhotoAfterSave) => void;
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
          <Text style={styles.modalTitle}>Новое замечание</Text>
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
            <TextInput multiline onChangeText={setRemarkComment} placeholder="Опишите замечание" placeholderTextColor="#9ca3af" style={[styles.input, styles.textarea]} textAlignVertical="top" value={remarkComment} />
            <Text style={styles.label}>Фото после сохранения</Text>
            <View style={styles.inlineActions}>
              <ChoiceButton active={remarkPhoto === "none"} label="Без фото" onPress={() => setRemarkPhoto("none")} />
              <ChoiceButton active={remarkPhoto === "camera"} label="Камера" onPress={() => setRemarkPhoto("camera")} />
              <ChoiceButton active={remarkPhoto === "gallery"} label="Галерея" onPress={() => setRemarkPhoto("gallery")} />
            </View>
          </ScrollView>
          <View style={[styles.modalActions, { paddingBottom: Math.max(insets.bottom + 12, 22) }]}>
            <PrimaryButton disabled={loading} label="Отмена" onPress={onClose} variant="secondary" />
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

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={Boolean(task)}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 18}
        style={styles.modalBackdrop}
      >
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Завершить работу</Text>
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
              placeholder="Что выполнено?"
              placeholderTextColor="#9ca3af"
              style={[styles.input, styles.textarea]}
              textAlignVertical="top"
              value={comment}
            />
          </ScrollView>
          <View style={[styles.modalActions, { paddingBottom: Math.max(insets.bottom + 12, 22) }]}>
            <PrimaryButton disabled={loading} label="Отмена" onPress={onClose} variant="secondary" />
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
  task
}: {
  loading: boolean;
  onClose: () => void;
  onComplete: (task: WorkTaskDto) => void;
  onEdit: (task: WorkTaskDto) => void;
  onPause: (task: WorkTaskDto) => void;
  onResume: (task: WorkTaskDto) => void;
  task: WorkTaskDto | null;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={Boolean(task)}>
      <View style={[styles.menuBackdrop, { paddingBottom: Math.max(insets.bottom + 12, 22) }]}>
        <View style={styles.menuCard}>
          <Text style={styles.modalTitle}>{task?.title ?? "Работа"}</Text>
          {task && task.status === "paused" ? (
            <PrimaryButton disabled={loading} icon="play-outline" label="Продолжить" onPress={() => onResume(task)} />
          ) : task ? (
            <PrimaryButton disabled={loading} icon="pause-outline" label="Остановить" onPress={() => onPause(task)} variant="secondary" />
          ) : null}
          {task ? <PrimaryButton disabled={loading} icon="create-outline" label="Изменить" onPress={() => onEdit(task)} variant="secondary" /> : null}
          {task ? <PrimaryButton disabled={loading} icon="checkmark-circle-outline" label="Завершить" onPress={() => onComplete(task)} /> : null}
          <PrimaryButton disabled={loading} label="Закрыть" onPress={onClose} variant="ghost" />
        </View>
      </View>
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

function statusLabel(status: WorkTaskStatus) {
  const labels: Record<WorkTaskStatus, string> = {
    new: "Новая",
    accepted: "Назначена",
    inProgress: "В работе",
    paused: "Пауза",
    completedLocal: "Завершена локально",
    completedServer: "Завершена",
    cancelled: "Отменена",
    conflict: "Конфликт"
  };

  return labels[status] ?? status;
}

function statusTone(status: WorkTaskStatus) {
  if (status === "completedServer" || status === "completedLocal") {
    return "success";
  }
  if (status === "paused") {
    return "warning";
  }
  if (status === "cancelled" || status === "conflict") {
    return "danger";
  }
  return "neutral";
}

function remarkStatusLabel(status: ShiftRemark["status"]) {
  if (status === "accepted" || status === "duplicate") {
    return "Отправлено";
  }
  if (status === "rejected" || status === "conflict") {
    return "Ошибка";
  }
  return "Ожидает";
}

function remarkStatusTone(status: ShiftRemark["status"]) {
  if (status === "accepted" || status === "duplicate") {
    return "success";
  }
  if (status === "rejected" || status === "conflict") {
    return "danger";
  }
  return "warning";
}

function formatShortName(fullName: string | null | undefined) {
  if (!fullName?.trim()) {
    return "не указан";
  }

  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0];
  }

  const [lastName, firstName, middleName] = parts;
  const initials = [firstName, middleName]
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}.`)
    .join("");

  return initials ? `${lastName} ${initials}` : lastName;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Дата не указана";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  actions: {
    gap: 8
  },
  cardTitle: {
    color: "#0f1a2b",
    flex: 1,
    fontSize: 18,
    fontWeight: "800"
  },
  choice: {
    borderColor: "#dbe5f2",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  choiceActive: {
    backgroundColor: "#eaf1ff",
    borderColor: "#1e5bff"
  },
  choiceText: {
    color: "#42526b",
    fontSize: 13,
    fontWeight: "800"
  },
  choiceTextActive: {
    color: "#1e5bff"
  },
  field: {
    gap: 8
  },
  iconButton: {
    alignItems: "center",
    borderColor: "#dbe5f2",
    borderRadius: 10,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 42
  },
  inlineActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  input: {
    borderColor: "#d1d5db",
    borderRadius: 10,
    borderWidth: 1,
    color: "#0f1a2b",
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  label: {
    color: "#42526b",
    fontSize: 13,
    fontWeight: "800"
  },
  menuBackdrop: {
    backgroundColor: "rgba(15, 26, 43, 0.22)",
    flex: 1,
    justifyContent: "flex-end",
    padding: 18
  },
  menuCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    gap: 10,
    padding: 16
  },
  message: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  modalActions: {
    borderColor: "#e5edf7",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 12
  },
  modalBackdrop: {
    backgroundColor: "rgba(15, 26, 43, 0.28)",
    flex: 1,
    justifyContent: "flex-end"
  },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: "92%",
    overflow: "hidden",
    padding: 0
  },
  modalScroll: {
    flexGrow: 0
  },
  modalScrollContent: {
    gap: 12,
    paddingBottom: 14,
    paddingHorizontal: 18
  },
  modalTitle: {
    color: "#0f1a2b",
    fontSize: 20,
    fontWeight: "900",
    margin: 18,
    marginBottom: 12
  },
  muted: {
    fontSize: 13,
    lineHeight: 18
  },
  optionWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  readOnlyValue: {
    backgroundColor: "#f5f7fa",
    borderRadius: 10,
    color: "#6b7280",
    fontSize: 14,
    fontWeight: "700",
    padding: 12
  },
  row: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  segment: {
    backgroundColor: "#edf2f8",
    borderRadius: 12,
    flexDirection: "row",
    padding: 4
  },
  segmentButton: {
    alignItems: "center",
    borderRadius: 9,
    flex: 1,
    paddingVertical: 10
  },
  segmentButtonActive: {
    backgroundColor: "#1e5bff"
  },
  segmentText: {
    color: "#42526b",
    fontSize: 14,
    fontWeight: "900"
  },
  segmentTextActive: {
    color: "#fff"
  },
  text: {
    color: "#6b7280",
    fontSize: 15,
    lineHeight: 21
  },
  textarea: {
    minHeight: 88
  },
  titleBox: {
    flex: 1,
    gap: 5
  }
});
