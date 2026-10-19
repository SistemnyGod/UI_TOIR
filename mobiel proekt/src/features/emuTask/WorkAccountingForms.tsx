import { TransientNotice } from "@/ui/TransientNotice";

import { TextField as TextInput } from "@/ui/TextField";
import { SelectField } from "@/ui/SelectField";

import { Ionicons } from "@expo/vector-icons";

import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MobileEmployeeDto, MobileEmuSectionDto, WorkItemDto, WorkTaskDto } from "@/domain/emu/emuTypes";

import { useWorkAccountingStyles } from "@/features/emuTask/WorkAccountingPresentation";
import { useAppTheme } from "@/features/settings/themePreference";

import { StatusMessage } from "@/ui/StatusMessage";
import { useReducedMotion } from "@/ui/useReducedMotion";

import { PrimaryButton } from "@/ui/PrimaryButton";

export type ParticipationAction = { mode: "start" | "join" | "replace"; item: WorkItemDto };

export type RemarkAttachmentAfterSave = "later" | "now";

export function requestModalClose(hasUnsavedChanges: boolean, loading: boolean, onClose: () => void) {
  if (loading) {
    return;
  }
  if (!hasUnsavedChanges) {
    onClose();
    return;
  }
  onClose();
}

export function TaskModal({
  error,
  draftNotice,
  onRetry,
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
  draftNotice: string | null;
  onRetry?: () => void;
  employees: MobileEmployeeDto[];
  loading: boolean;
  modal: { mode: "create" | "edit"; task?: WorkTaskDto; repeated?: boolean } | null;
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
  const styles = useWorkAccountingStyles();
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const hasUnsavedChanges = modal?.mode === "create" ? taskText.trim().length > 0 : Boolean(modal?.task && (taskText !== modal.task.title || taskEmployeeId !== (modal.task.employeeId ?? "") || taskSectionId !== (modal.task.sectionId ?? "")));

  return (
    <Modal statusBarTranslucent navigationBarTranslucent animationType={reducedMotion ? "none" : "slide"} onRequestClose={() => requestModalClose(hasUnsavedChanges, loading, onClose)} transparent visible={Boolean(modal)}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
        style={[styles.modalBackdrop, { paddingTop: insets.top + 68, paddingBottom: insets.bottom + 12 }]}
      >
        <View pointerEvents="box-none" style={{ position: "absolute", top: insets.top + 8, right: 16, left: 16 }}><TransientNotice message={draftNotice} /></View>
        <View accessibilityViewIsModal style={styles.modalCard}>
          <FormHeader title={modal?.mode === "edit" ? "Изменить работу" : modal?.repeated ? "Повторить работу" : "Создать работу"} loading={loading} onClose={onClose} onDelete={onDeleteDraft} />

          {onRetry ? <PrimaryButton variant="secondary" label="Повторить сохранение" onPress={onRetry} /> : null}
          {error ? <View style={{ paddingHorizontal: 18 }}><StatusMessage message={error} tone="danger" /></View> : null}
          <ScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.modalScroll}
          >
            <Text style={styles.label}>Задача</Text>
            <TextInput editable={!loading} accessibilityLabel="Задача" multiline onChangeText={setTaskText} placeholder="Что нужно выполнить?" placeholderTextColor={styles.helperText.color} style={[styles.input, styles.textarea]} textAlignVertical="top" value={taskText} />
            {modal ? <>
              <SelectField presentation="modal" disabled={loading} label="Исполнитель" options={employees.map((item) => ({ id: item.employeeId, label: item.fullName }))} selectedId={taskEmployeeId} onSelect={setTaskEmployeeId} />
              <SelectField presentation="modal" disabled={loading} label="Участок" options={sections.map((item) => ({ id: item.sectionId, label: item.name }))} selectedId={taskSectionId} onSelect={setTaskSectionId} />
            </> : null}
          <View style={styles.modalActions}>
            <PrimaryButton disabled={loading} label={modal?.mode === "edit" ? "Сохранить изменения" : "Создать и начать"} onPress={onSave} />
          </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function RemarkModal({
  error,
  draftNotice,
  onRetry,
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
  draftNotice: string | null;
  onRetry?: () => void;
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
  const styles = useWorkAccountingStyles();
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const hasUnsavedChanges = remarkComment.trim().length > 0 || remarkAttachmentAfterSave !== "later";

  return (
    <Modal statusBarTranslucent navigationBarTranslucent animationType={reducedMotion ? "none" : "slide"} onRequestClose={() => requestModalClose(hasUnsavedChanges, loading, onClose)} transparent visible={open}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
        style={[styles.modalBackdrop, { paddingTop: insets.top + 68, paddingBottom: insets.bottom + 12 }]}
      >
        <View pointerEvents="box-none" style={{ position: "absolute", top: insets.top + 8, right: 16, left: 16 }}><TransientNotice message={draftNotice} /></View>
        <View accessibilityViewIsModal style={styles.modalCard}>
          <FormHeader title="Новое замечание" loading={loading} onClose={onClose} onDelete={onDeleteDraft} />

          {onRetry ? <PrimaryButton variant="secondary" label="Повторить сохранение" onPress={onRetry} /> : null}
          {error ? <View style={{ paddingHorizontal: 18 }}><StatusMessage message={error} tone="danger" /></View> : null}
          <ScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.modalScroll}
          >
            <SelectField presentation="modal" disabled={loading} label="Исполнитель" options={employees.map((item) => ({ id: item.employeeId, label: item.fullName }))} selectedId={remarkEmployeeId} onSelect={setRemarkEmployeeId} />
            <SelectField presentation="modal" disabled={loading} label="Участок" options={sections.map((item) => ({ id: item.sectionId, label: item.name }))} selectedId={remarkSectionId} onSelect={setRemarkSectionId} />
            <Text style={styles.label}>Дата</Text>
            <Text style={styles.readOnlyValue}>Автоматически при сохранении</Text>
            <Text style={styles.label}>Описание замечания</Text>
            <TextInput accessibilityLabel="Описание замечания" editable={!loading} multiline onChangeText={setRemarkComment} placeholder="Опишите замечание" placeholderTextColor={styles.helperText.color} style={[styles.input, styles.textarea]} textAlignVertical="top" value={remarkComment} />
            <Text style={styles.label}>Вложения</Text>
            <View style={styles.inlineActions}>
              <ChoiceButton active={remarkAttachmentAfterSave === "later"} label="Добавить позже" onPress={() => setRemarkAttachmentAfterSave("later")} />
              <ChoiceButton active={remarkAttachmentAfterSave === "now"} label="Добавить сейчас" onPress={() => setRemarkAttachmentAfterSave("now")} />
            </View>
            <Text style={styles.helperText}>После сохранения можно добавить фото, видео или выбрать несколько файлов из галереи.</Text>
          <View style={styles.modalActions}>
            <PrimaryButton disabled={loading} label="Создать замечание" onPress={onSave} />
          </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function CompleteTaskModal({
  comment,
  error,
  draftNotice,
  onRetry,
  loading,
  onChangeComment,
  onClose,
  onDeleteDraft,
  onSave,
  task
}: {
  comment: string;
  error: string | null;
  draftNotice: string | null;
  onRetry?: () => void;
  loading: boolean;
  onChangeComment: (value: string) => void;
  onClose: () => void;
  onDeleteDraft: () => void;
  onSave: () => void;
  task: WorkTaskDto | null;
}) {
  const styles = useWorkAccountingStyles();
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();

  const hasUnsavedChanges = comment.trim().length > 0;
  return (
    <Modal statusBarTranslucent navigationBarTranslucent animationType={reducedMotion ? "none" : "slide"} onRequestClose={() => requestModalClose(hasUnsavedChanges, loading, onClose)} transparent visible={Boolean(task)}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
        style={[styles.modalBackdrop, { paddingTop: insets.top + 68, paddingBottom: insets.bottom + 12 }]}
      >
        <View pointerEvents="box-none" style={{ position: "absolute", top: insets.top + 8, right: 16, left: 16 }}><TransientNotice message={draftNotice} /></View>
        <View accessibilityViewIsModal style={styles.modalCard}>
          <FormHeader title="Завершить работу" loading={loading} onClose={onClose} onDelete={onDeleteDraft} />

          {onRetry ? <PrimaryButton variant="secondary" label="Повторить сохранение" onPress={onRetry} /> : null}
          {error ? <View style={{ paddingHorizontal: 18 }}><StatusMessage message={error} tone="danger" /></View> : null}
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
              editable={!loading}
              multiline
              onChangeText={onChangeComment}
              accessibilityLabel="Результат выполнения"
              placeholder="Что выполнено?"
              placeholderTextColor={styles.helperText.color}
              style={[styles.input, styles.textarea]}
              textAlignVertical="top"
              value={comment}
            />
          <View style={styles.modalActions}>
            <PrimaryButton disabled={loading} icon="checkmark-circle-outline" label="Завершить работу" onPress={onSave} />
          </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function ParticipationModal({
  error, draftNotice, onRetry, onDeleteDraft,
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
  error: string | null; draftNotice: string | null; onRetry?: () => void; onDeleteDraft: () => void;
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
  const styles = useWorkAccountingStyles();
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const previousOptions = action?.item.actualParticipants
    .filter((participant) => !participant.finishedAt && !participant.isCurrentMobileEmployee)
    .map((participant) => ({ id: participant.employeeId, label: participant.fullName })) ?? [];
  const title = action?.mode === "replace"
    ? "Заменить участника"
    : action?.mode === "join"
      ? "Присоединиться к работе"
      : "Начать работу";
  const hasUnsavedChanges = Boolean(reason.trim() || previousEmployeeId);

  return (
    <Modal statusBarTranslucent navigationBarTranslucent animationType={reducedMotion ? "none" : "slide"} onRequestClose={() => requestModalClose(hasUnsavedChanges, loading, onClose)} transparent visible={Boolean(action)}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={[styles.modalBackdrop, { paddingTop: insets.top + 68, paddingBottom: insets.bottom + 12 }]}>
        <View pointerEvents="box-none" style={{ position: "absolute", top: insets.top + 8, right: 16, left: 16 }}><TransientNotice message={draftNotice} /></View>
        <View accessibilityViewIsModal style={styles.modalCard}>
          <FormHeader title={title} loading={loading} onClose={onClose} onDelete={onDeleteDraft} />

          {error ? <StatusMessage message={error} tone="danger" /> : null}
          {onRetry ? <PrimaryButton label="Повторить сохранение" onPress={onRetry} variant="secondary" /> : null}
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.readOnlyValue}>{action?.item.title ?? "-"}</Text>
            <SelectField presentation="modal" disabled={loading}
              label={action?.mode === "replace" ? "Новый участник" : "Исполнитель"}
              onSelect={setEmployeeId}
              options={employees.map((employee) => ({ id: employee.employeeId, label: employee.fullName }))}
              selectedId={employeeId}
            />
            {action?.mode === "replace" ? (
              <SelectField presentation="modal" disabled={loading} label="Прежний исполнитель" onSelect={setPreviousEmployeeId} options={previousOptions} selectedId={previousEmployeeId} />
            ) : null}
            {action?.mode !== "start" ? (
              <>
                <Text style={styles.label}>{action?.mode === "replace" ? "Причина замены" : "Примечание"}</Text>
                <TextInput
                  editable={!loading}
                  multiline
                  onChangeText={setReason}
                  placeholder={action?.mode === "replace" ? "Почему меняется исполнитель?" : "Что будете выполнять?"}
                  placeholderTextColor={styles.helperText.color}
                  accessibilityLabel={action?.mode === "replace" ? "Причина замены" : "Примечание"}
                  style={[styles.input, styles.textarea]}
                  value={reason}
                />
              </>
            ) : null}
          <View style={styles.modalActions}>
            <PrimaryButton disabled={loading} label={action?.mode === "replace" ? "Заменить участника" : action?.mode === "join" ? "Присоединиться" : "Начать работу"} onPress={onSave} />
          </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function ChoiceButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  const styles = useWorkAccountingStyles();
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={onPress} style={[styles.choice, active ? styles.choiceActive : null]}>
      <Text style={[styles.choiceText, active ? styles.choiceTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function FormHeader({ title, loading, onClose, onDelete }: { title: string; loading: boolean; onClose: () => void; onDelete: () => void }) {
  const { colors } = useAppTheme();
  return <View style={{ paddingLeft: 18, paddingRight: 6, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 4 }}>
    <Text accessibilityRole="header" style={{ flex: 1, color: colors.text, fontSize: 20, fontFamily: "Manrope_700Bold" }}>{title}</Text>
    <View style={{ flexDirection: "row" }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Действия" style={{ minHeight: 48, width: 48, alignItems: "center", justifyContent: "center" }} disabled={loading} onPress={() => Alert.alert("Черновик", "Удаление черновика не изменяет саму работу.", [{ text: "Отмена", style: "cancel" }, { text: "Удалить черновик", style: "destructive", onPress: () => Alert.alert("Удалить черновик?", "Сохранённый текст этой формы будет удалён.", [{ text: "Оставить", style: "cancel" }, { text: "Удалить", style: "destructive", onPress: onDelete }]) }])}><Ionicons name="ellipsis-horizontal" size={22} color={loading ? colors.disabledText : colors.mutedText} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Закрыть" style={{ minHeight: 48, width: 48, alignItems: "center", justifyContent: "center" }} disabled={loading} onPress={onClose}><Ionicons name="close-outline" size={24} color={loading ? colors.disabledText : colors.text} /></Pressable>
    </View>
  </View>;
}
