import { Ionicons } from "@expo/vector-icons";

import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { WorkItemDto } from "@/domain/emu/emuTypes";

import { canAttachEmuMedia, canCompleteEmuTask, canEditEmuTask, canPauseEmuTask, canResumeEmuTask, canStartEmuTask } from "@/domain/emu/emuStateMachine";
import { statusLabel, useWorkAccountingStyles } from "@/features/emuTask/WorkAccountingPresentation";
import { useAppTheme } from "@/features/settings/themePreference";

import { useReducedMotion } from "@/ui/useReducedMotion";

import { PrimaryButton } from "@/ui/PrimaryButton";

import { requestModalClose } from './WorkAccountingForms';

export function TaskMenu({
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
  const styles = useWorkAccountingStyles();
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const secondaryActions = task ? getTaskSecondaryActions(task, {
    onAttach,
    onEdit,
    onPause,
    onReplace
  }) : [];

  return (
    <Modal statusBarTranslucent navigationBarTranslucent animationType={reducedMotion ? "none" : "fade"} onRequestClose={() => requestModalClose(false, loading, onClose)} transparent visible={Boolean(task)}>
      <View style={[styles.menuBackdrop, { paddingBottom: Math.max(insets.bottom + 12, 22) }]}>
        <View accessibilityLabel={task?.title ?? "Действия с работой"} accessibilityViewIsModal style={styles.menuCard}>
          <Text accessibilityRole="header" style={styles.modalTitle}>{task?.title ?? "Работа"}</Text>
          {task ? <Text style={styles.menuSubtitle}>{task.sectionName ?? "Участок не указан"} · {statusLabel(task.status)}</Text> : null}
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

export function getTaskPrimaryAction(
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

export function getTaskSecondaryActions(
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
  const styles = useWorkAccountingStyles();
  const { colors } = useAppTheme();
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
      <Ionicons color={danger ? colors.danger : colors.primary} name={icon} size={18} />
      <Text style={[styles.menuSecondaryText, danger ? styles.menuSecondaryDanger : null]}>{label}</Text>
    </Pressable>
  );
}
