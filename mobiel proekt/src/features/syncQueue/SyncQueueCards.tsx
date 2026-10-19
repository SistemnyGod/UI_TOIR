import type { Href } from "expo-router";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { SyncQueueFileItem } from "@/db/repositories/filesRepository";
import type { SyncQueueCommandItem } from "@/db/repositories/outboxRepository";
import { useAppTheme } from "@/features/settings/themePreference";
import { QueueDeliveryTimeline, QueueIconTile, type DeliveryStage } from "@/features/syncQueue/QueueDeliveryTimeline";
import {
  commandActionLabel,
  commandIcon,
  commandSubject,
  commandTitle,
  dangerBox,
  fileStatusLabel,
  fileSubject,
  formatDateTime,
  queueCardStyle,
  statusLabel,
  statusTone,
  warningBox,
  type CommandResolution,
  type DestructiveResolution
} from "@/features/syncQueue/syncQueuePresentation";
import { canAcceptServerConflict } from "@/services/conflictResolutionService";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { StatusPill } from "@/ui/StatusPill";
import { queueStyles } from "@/features/syncQueue/syncQueueStyles";

type CommandQueueCardProps = {
  command: SyncQueueCommandItem;
  stages: DeliveryStage[];
  busy: boolean;
  errorExpanded: boolean;
  onToggleError: (clientOperationId: string) => void;
  onResolve: (command: SyncQueueCommandItem, action: CommandResolution) => void;
  onConfirm: (command: SyncQueueCommandItem, action: DestructiveResolution) => void;
  onOpenPath: (path: Href) => void;
};

/** One outbox command with its delivery path and the decisions it needs. Re-renders only when its own props change. */
export const CommandQueueCard = memo(function CommandQueueCard({ command, stages, busy, errorExpanded, onToggleError, onResolve, onConfirm, onOpenPath }: CommandQueueCardProps) {
  const { colors } = useAppTheme();
  const tone = statusTone(command.status, command.resolutionStatus);
  const needsReview = command.status === "rejected" || command.status === "conflict";
  return (
    <View style={[queueStyles.queueItem, queueCardStyle(colors, tone)]}>
      <View style={queueStyles.itemTop}>
        <QueueIconTile icon={commandIcon(command.commandType)} tone={tone} />
        <View style={queueStyles.itemTitleBox}>
          <Text style={[queueStyles.itemTitle, { color: colors.text }]}>{commandTitle(command)}</Text>
          <Text style={[queueStyles.text, { color: colors.mutedText }]}>
            {commandSubject(command)}
          </Text>
        </View>
        <StatusPill label={statusLabel(command.status, command.resolutionStatus)} tone={tone} />
      </View>
      <QueueDeliveryTimeline stages={stages} />
      <View style={[queueStyles.metaGrid, { backgroundColor: colors.backgroundAccent }]}>
        <Meta label="Попытки" value={String(command.attemptCount)} />
        <Meta label="Последняя попытка" value={formatDateTime(command.lastAttemptAt)} />
        <Meta label="Следующая попытка" value={formatDateTime(command.nextAttemptAt)} />
        <Meta label={command.commandType === "completePatrolAssignment" ? "Отчёт" : "Маршрут"} value={command.assignmentRouteName || "-"} />
        <Meta label="Действие" value={commandActionLabel(command.status)} />
      </View>
      {command.lastError ? (
        <Pressable
          accessibilityLabel={errorExpanded ? "Свернуть описание ошибки" : "Показать описание ошибки полностью"}
          accessibilityRole="button"
          onPress={() => onToggleError(command.clientOperationId)}
        >
          <Text
            style={errorExpanded ? [queueStyles.errorText, dangerBox(colors)] : [queueStyles.errorPreview, warningBox(colors)]}
            numberOfLines={errorExpanded ? undefined : 2}
          >
            {command.lastError}
          </Text>
        </Pressable>
      ) : null}
      {command.status === "conflict" ? (
        <View style={queueStyles.actionGroup}>
          {command.commandType === "switchPatrolAssignment" && command.sourceAssignmentId ? (
            <>
              <Text style={[queueStyles.text, { color: colors.mutedText }]}>Переход на другой обход не принят: {command.lastError ?? "сервер отменил исходный обход"}</Text>
              <PrimaryButton
                disabled={busy}
                icon="play-circle-outline"
                label="Продолжить новый обход"
                onPress={() => onResolve(command, "continueSwitch")}
                size="large"
                variant="secondary"
              />
            </>
          ) : null}
          {canAcceptServerConflict(command) ? (
            <PrimaryButton
              disabled={busy}
              icon="cloud-done-outline"
              label="Принять состояние сервера"
              onPress={() => onConfirm(command, "serverWins")}
              size="large"
              variant="secondary"
            />
          ) : null}
          <PrimaryButton
            disabled={busy}
            icon="people-outline"
            label="Передать диспетчеру"
            onPress={() => onResolve(command, "dispatcher")}
            size="large"
            variant="ghost"
          />
          {command.commandType === "completePatrolAssignment" && command.entityLocalId ? (
            <PrimaryButton
              disabled={busy}
              icon="refresh-outline"
              label="Повторить с актуальной ревизией"
              onPress={() => onResolve(command, "retryRevision")}
              size="large"
              variant="ghost"
            />
          ) : null}
        </View>
      ) : null}
      {command.status === "rejected" ? (
        <View style={queueStyles.actionGroup}>
          {command.commandType === "switchPatrolAssignment" && command.sourceAssignmentId ? (
            <PrimaryButton
              disabled={busy}
              icon="play-circle-outline"
              label="Продолжить новый обход"
              onPress={() => onResolve(command, "continueSwitch")}
              size="large"
              variant="secondary"
            />
          ) : null}
          <PrimaryButton
            disabled={busy}
            icon="close-circle-outline"
            label="Отменить локальное действие"
            onPress={() => onConfirm(command, "cancelRejected")}
            size="large"
            variant="ghost"
          />
        </View>
      ) : null}
      {command.commandType === "completePatrolAssignment" && command.entityLocalId ? (
        <PrimaryButton
          icon={needsReview ? "build-outline" : "shield-checkmark-outline"}
          label={needsReview ? "Проверить и исправить отчет" : "Открыть обход"}
          onPress={() => onOpenPath(
            needsReview
              ? `/patrol/assignment/${command.entityLocalId}/all-points`
              : `/patrol/assignment/${command.entityLocalId}`
          )}
          variant="secondary"
        />
      ) : null}
    </View>
  );
});

type FileQueueCardProps = {
  file: SyncQueueFileItem;
  stages: DeliveryStage[];
  actionsLocked: boolean;
  onRetry: (file: SyncQueueFileItem) => void;
};

/** One queued photo or video with its upload path and a retry for a failed upload. */
export const FileQueueCard = memo(function FileQueueCard({ file, stages, actionsLocked, onRetry }: FileQueueCardProps) {
  const { colors } = useAppTheme();
  const tone = statusTone(file.status);
  return (
    <View style={[queueStyles.queueItem, queueCardStyle(colors, tone)]}>
      <View style={queueStyles.itemTop}>
        <QueueIconTile icon={file.mediaKind === "video" ? "videocam-outline" : "image-outline"} tone={tone === "danger" ? "danger" : "neutral"} />
        <View style={queueStyles.itemTitleBox}>
          <Text style={[queueStyles.itemTitle, { color: colors.text }]}>{file.mediaKind === "video" ? "Видео" : "Фото"}</Text>
          <Text style={[queueStyles.text, { color: colors.mutedText }]} numberOfLines={2}>
            {fileSubject(file)}
          </Text>
        </View>
        <StatusPill label={fileStatusLabel(file.status)} tone={tone} />
      </View>
      <QueueDeliveryTimeline stages={stages} />
      <View style={[queueStyles.metaGrid, { backgroundColor: colors.backgroundAccent }]}>
        <Meta label="Попытки" value={String(file.attemptCount ?? 0)} />
        <Meta label="Последняя попытка" value={formatDateTime(file.lastAttemptAt ?? null)} />
        <Meta label="Следующая попытка" value={formatDateTime(file.nextAttemptAt ?? null)} />
        <Meta label="Отчёт" value={file.assignmentRouteName || "-"} />
        <Meta label="Точка" value={file.pointName || (file.pointId ? "Точка маршрута" : "-")} />
        <Meta label="Действие" value={file.status === "failed" ? "Повторите загрузку" : "Ожидает отправки"} />
      </View>
      {file.lastError ? <Text style={[queueStyles.errorPreview, warningBox(colors)]} numberOfLines={2}>{file.lastError}</Text> : null}
      {file.status === "failed" ? (
        <PrimaryButton
          disabled={actionsLocked}
          icon="cloud-upload-outline"
          label="Повторить загрузку"
          onPress={() => onRetry(file)}
          size="large"
          variant="secondary"
        />
      ) : null}
    </View>
  );
});

export const QueueSectionTitle = memo(function QueueSectionTitle({ title }: { title: string }) {
  const { colors } = useAppTheme();
  return <Text style={[queueStyles.title, { color: colors.text }]}>{title}</Text>;
});

function Meta({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.meta, { backgroundColor: colors.card }]}>
      <Text style={[styles.metaLabel, { color: colors.mutedText }]}>{label}</Text>
      <Text style={[styles.metaValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  meta: {
    borderRadius: 10,
    flex: 1,
    gap: 2,
    minWidth: 96,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  metaLabel: {
    fontSize: 11,
    fontFamily: "Manrope_800ExtraBold",
    textTransform: "uppercase"
  },
  metaValue: {
    fontSize: 13,
    fontFamily: "Manrope_700Bold"
  }
});
