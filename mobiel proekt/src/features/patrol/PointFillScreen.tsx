import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { currentContourId } from "@/core/environments";
import { listPointFiles } from "@/db/repositories/filesRepository";
import { deferPoint, getPointForFill, getReportReadiness, PointForFill, savePointIssue, savePointOk, skipPoint } from "@/db/repositories/patrolRepository";
import { isPhotoEvidenceRequired } from "@/domain/patrol/photoEvidencePolicy";
import { useAppTheme } from "@/features/settings/themePreference";
import {
  attachPointPhotoFromCamera,
  attachPointMediaFromGallery,
  attachPointVideoFromCamera,
} from "@/services/mediaAttachmentService";
import { ActionSheet } from "@/ui/ActionSheet";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";
import type { FillPhase, PointAttachment, SelectedStatus } from "./pointFillTypes";

export function PointFillScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { assignmentId, pointId } = useLocalSearchParams<{ assignmentId: string; pointId: string }>();
  const [point, setPoint] = useState<PointForFill | null>(null);
  const [phase, setPhase] = useState<FillPhase>("status");
  const [selectedStatus, setSelectedStatus] = useState<SelectedStatus | null>(null);
  const [comment, setComment] = useState("");
  const [issueTypeId, setIssueTypeId] = useState("Неисправность");
  const [attachments, setAttachments] = useState<PointAttachment[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMediaBusy, setIsMediaBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<"attachments" | "more" | null>(null);

  const reload = useCallback(async () => {
    const ownerUserId = await getStoredOwnerUserId();
    if (!ownerUserId) {
      setPoint(null);
      setAttachments([]);
      return;
    }
    const [loaded, files] = await Promise.all([getPointForFill(assignmentId, pointId, ownerUserId, currentContourId), listPointFiles(assignmentId, pointId)]);
    setPoint(loaded);
    setComment(loaded?.comment ?? "");
    setIssueTypeId(loaded?.issueTypeId ?? "Неисправность");
    setAttachments(files.map(toPointAttachment));

    if (loaded?.status === "ok" || loaded?.status === "issue" || loaded?.status === "skipped") {
      setSelectedStatus(loaded.status);
      setPhase("details");
    } else if (loaded?.status === "deferred") {
      setSelectedStatus(loaded.issueTypeId ? "issue" : "ok");
      setPhase("details");
    } else {
      setSelectedStatus(null);
      setPhase("status");
    }
  }, [assignmentId, pointId]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      void reload().catch(() => {
        if (isMounted) {
          setPoint(null);
        }
      });

      return () => {
        isMounted = false;
      };
    }, [reload])
  );

  function selectStatus(status: SelectedStatus) {
    setSelectedStatus(status);
    setError(null);
    setPhase("details");
  }

  function handleSkipTag() {
    selectStatus("skipped");
  }

  async function handleSave() {
    setError(null);
    if (!selectedStatus) {
      setPhase("status");
      return;
    }

    if (selectedStatus === "issue" && comment.trim().length === 0) {
      setError("Для неисправности нужен комментарий.");
      return;
    }

    if (selectedStatus === "skipped" && comment.trim().length === 0) {
      setError("Укажите, почему метка недоступна.");
      return;
    }

    if (isPhotoEvidenceRequired(Boolean(point?.requiresPhoto), selectedStatus) && !hasPhotoAttachment(attachments)) {
      setError("Для этой метки требуется фотофиксация.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (selectedStatus === "issue") {
        await savePointIssue(assignmentId, pointId, comment.trim(), issueTypeId.trim() || "Неисправность");
      } else if (selectedStatus === "skipped") {
        await skipPoint(assignmentId, pointId, {
          comment: comment.trim(),
          photoClientFileIds: attachments.map((attachment) => attachment.clientFileId)
        });
      } else {
        await savePointOk(assignmentId, pointId, comment.trim());
      }
      await continuePatrolFlow();
    } catch {
      setError("Не удалось сохранить метку.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDefer() {
    setError(null);
    setIsSubmitting(true);
    try {
      await deferPoint(assignmentId, pointId, {
        selectedStatus: selectedStatus === "skipped" ? null : selectedStatus,
        comment: comment.trim(),
        issueTypeId: issueTypeId.trim() || "Неисправность",
        photoClientFileIds: attachments.map((attachment) => attachment.clientFileId)
      });
      await continuePatrolFlow();
    } catch {
      setError("Не удалось отложить метку.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAddPhoto() {
    setError(null);
    setIsMediaBusy(true);
    try {
      const result = await attachPointPhotoFromCamera(assignmentId, pointId);

      if (result === "attached") {
        await reloadPointAndAttachments();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось добавить фото.");
    } finally {
      setIsMediaBusy(false);
    }
  }

  async function handleAddVideo() {
    setError(null);
    setIsMediaBusy(true);
    try {
      const result = await attachPointVideoFromCamera(assignmentId, pointId);

      if (result === "attached") {
        await reloadPointAndAttachments();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось добавить видео.");
    } finally {
      setIsMediaBusy(false);
    }
  }

  async function handleAddFromGallery() {
    setError(null);
    setIsMediaBusy(true);
    try {
      const result = await attachPointMediaFromGallery(assignmentId, pointId);
      if (result.status === "attached") {
        await reloadPointAndAttachments();
      }
      if (result.errors.length > 0) {
        setError(`Добавлено: ${result.attachedCount}. Не удалось: ${result.errors.length}. ${result.errors[0]}`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось добавить вложения.");
    } finally {
      setIsMediaBusy(false);
    }
  }

  async function continuePatrolFlow() {
    const readiness = await getReportReadiness(assignmentId);
    router.replace(readiness.ready
      ? `/patrol/assignment/${assignmentId}/submit`
      : `/patrol/assignment/${assignmentId}/scan-nfc`);
  }

  async function reloadPointAndAttachments() {
    const ownerUserId = await getStoredOwnerUserId();
    if (!ownerUserId) {
      setPoint(null);
      setAttachments([]);
      return;
    }
    const [updatedPoint, files] = await Promise.all([
      getPointForFill(assignmentId, pointId, ownerUserId, currentContourId),
      listPointFiles(assignmentId, pointId)
    ]);
    setPoint(updatedPoint);
    setAttachments(files.map(toPointAttachment));
  }

  if (!point) {
    return (
      <Screen title="Заполнение метки" subtitle="Статус, комментарий и вложения точки.">
        <Card>
          <Text style={[styles.text, { color: colors.mutedText }]}>Точка не найдена на телефоне.</Text>
        </Card>
      </Screen>
    );
  }

  if (phase === "status") {
    return (
      <Screen title="Статус метки" subtitle="Выберите состояние объекта.">
        <Card>
          <View style={styles.row}>
            <Text style={[styles.title, { color: colors.text }]}>
              {point.orderIndex}. {point.name}
            </Text>
            <StatusPill label={confirmationLabel(point)} tone={point.confirmationType === "nfc" ? "success" : "neutral"} />
          </View>
          <View style={styles.scanMeta}>
            <Ionicons color={colors.mutedText} name="time-outline" size={17} />
            <Text style={[styles.scanMetaText, { color: colors.mutedText }]}>Сканирование: {formatScanTime(point.scannedAtLocal)}</Text>
          </View>
        </Card>

        <PointGuidanceCard
          description={point.description}
          instruction={point.instruction}
          mutedColor={colors.mutedText}
          textColor={colors.text}
        />

        <View style={styles.statusGrid}>
          <StatusButton label="Исправно" description="Объект в нормальном состоянии" tone="success" onPress={() => selectStatus("ok")} />
          <StatusButton label="Неисправно" description="Найдена неисправность или отклонение" tone="danger" onPress={() => selectStatus("issue")} />
        </View>

        <Pressable
          accessibilityLabel="Отметить метку как недоступную"
          accessibilityRole="button"
          disabled={isSubmitting}
          onPress={handleSkipTag}
          style={({ pressed }) => [
            styles.skipButton,
            pressed && !isSubmitting ? styles.skipButtonPressed : null,
            isSubmitting ? styles.skipButtonDisabled : null
          ]}
        >
          <View style={styles.skipIcon}>
            <Ionicons color="#b45309" name="alert-circle-outline" size={18} />
          </View>
          <View style={styles.skipTextBlock}>
            <Text style={styles.skipTitle}>Метка недоступна</Text>
            <Text style={styles.skipDescription}>Нет NFC/QR или метка утеряна</Text>
          </View>
          <Ionicons color="#b45309" name="chevron-forward" size={18} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.replace(`/patrol/assignment/${assignmentId}/all-points`)} style={styles.inlineLink}>
          <Ionicons color={colors.primary} name="list-outline" size={19} />
          <Text style={[styles.inlineLinkText, { color: colors.primary }]}>Все метки</Text>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen title="Результат точки" subtitle="Заполните только необходимые сведения.">
      <Card>
        <View style={styles.row}>
          <Text style={[styles.title, { color: colors.text }]}>
            {point.orderIndex}. {point.name}
          </Text>
          <StatusPill label={statusLabel(selectedStatus)} tone={statusTone(selectedStatus)} />
        </View>
      </Card>

      <PointGuidanceCard
        description={point.description}
        instruction={point.instruction}
        mutedColor={colors.mutedText}
        textColor={colors.text}
      />

      {selectedStatus === "skipped" ? (
        <Card style={styles.skipInfoCard}>
          <Text style={[styles.label, { color: colors.text }]}>Аварийное закрытие точки</Text>
          <Text style={[styles.text, { color: colors.mutedText }]}>
            В web-отчете будет указано: метка недоступна, точка закрыта вручную без сканирования.
          </Text>
        </Card>
      ) : null}

      {selectedStatus === "issue" ? (
        <Card>
          <Text style={[styles.label, { color: colors.text }]}>Тип неисправности</Text>
          <TextInput editable={!isSubmitting} onChangeText={setIssueTypeId} style={styles.input} value={issueTypeId} />
        </Card>
      ) : null}

      <Card>
        <Text style={[styles.label, { color: colors.text }]}>Комментарий</Text>
        <TextInput
          editable={!isSubmitting}
          multiline
          onChangeText={setComment}
          placeholder={commentPlaceholder(selectedStatus)}
          placeholderTextColor="#9ca3af"
          style={[styles.input, styles.textArea]}
          textAlignVertical="top"
          value={comment}
        />
      </Card>

      <Card>
        <View style={styles.photoHeader}>
          <Text style={[styles.label, { color: colors.text }]}>Фото и видео</Text>
          <Text style={styles.photoNote}>{isPhotoEvidenceRequired(Boolean(point.requiresPhoto), selectedStatus) ? "Обязательно" : "Необязательно"}</Text>
        </View>
        {attachments.length > 0 ? (
          <View style={styles.photoGrid}>
            {attachments.map((attachment) => (
              <View key={attachment.clientFileId} style={styles.photoTile}>
                {attachment.mediaKind === "video" ? (
                  <View style={styles.videoTile}>
                    <Ionicons color="#2563eb" name="videocam-outline" size={24} />
                    <Text style={styles.videoLabel}>Видео</Text>
                  </View>
                ) : (
                  <Image source={{ uri: attachment.localPath }} style={styles.photo} />
                )}
                <Text style={styles.photoStatus}>{fileStatusLabel(attachment.status)}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyPhotoBox}>
            <Text style={styles.photoNote}>Вложения пока не добавлены</Text>
          </View>
        )}
        {attachments.length > 0 ? (
          <Text style={styles.photoNote}>
            Фото: {attachments.filter((item) => item.mediaKind !== "video").length} · Видео: {attachments.filter((item) => item.mediaKind === "video").length}
          </Text>
        ) : null}
        {isMediaBusy ? <ActivityIndicator /> : null}
        <PrimaryButton disabled={isSubmitting || isMediaBusy} icon="attach-outline" label="Добавить вложение" onPress={() => setOpenMenu("attachments")} variant="secondary" />
      </Card>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {isSubmitting ? <ActivityIndicator /> : null}
      <PrimaryButton disabled={isSubmitting || isMediaBusy} icon="save-outline" label="Сохранить и продолжить" onPress={handleSave} size="large" />
      <View style={styles.bottomActions}>
        <Pressable accessibilityRole="button" onPress={() => setPhase("status")} style={styles.inlineLink}>
          <Ionicons color={colors.primary} name="swap-horizontal-outline" size={19} />
          <Text style={[styles.inlineLinkText, { color: colors.primary }]}>Изменить состояние</Text>
        </Pressable>
        <Pressable accessibilityLabel="Дополнительные действия" accessibilityRole="button" onPress={() => setOpenMenu("more")} style={styles.moreButton}>
          <Ionicons color={colors.primary} name="ellipsis-horizontal" size={22} />
        </Pressable>
      </View>
      <ActionSheet
        actions={openMenu === "attachments" ? [
          { label: "Сделать фото", icon: "camera-outline", onPress: () => void handleAddPhoto() },
          { label: "Снять видео", icon: "videocam-outline", onPress: () => void handleAddVideo() },
          { label: "Выбрать из галереи", icon: "images-outline", onPress: () => void handleAddFromGallery() }
        ] : [
          { label: "Отложить точку", icon: "time-outline", danger: true, onPress: () => void handleDefer() }
        ]}
        onClose={() => setOpenMenu(null)}
        title={openMenu === "attachments" ? "Добавить вложение" : "Действия с точкой"}
        visible={openMenu !== null}
      />
    </Screen>
  );
}

function PointGuidanceCard({
  description,
  instruction,
  mutedColor,
  textColor,
}: {
  description?: string | null;
  instruction?: string | null;
  mutedColor: string;
  textColor: string;
}) {
  if (!description?.trim() && !instruction?.trim()) {
    return null;
  }

  return (
    <Card>
      {description?.trim() ? (
        <View style={styles.guidanceBlock}>
          <Text style={[styles.label, { color: textColor }]}>Описание оборудования</Text>
          <Text style={[styles.text, { color: mutedColor }]}>{description.trim()}</Text>
        </View>
      ) : null}
      {instruction?.trim() ? (
        <View style={styles.guidanceBlock}>
          <Text style={[styles.label, { color: textColor }]}>Инструкция к метке</Text>
          <Text style={[styles.text, { color: mutedColor }]}>{instruction.trim()}</Text>
        </View>
      ) : null}
    </Card>
  );
}

function StatusButton({
  label,
  description,
  tone,
  onPress
}: {
  label: string;
  description: string;
  tone: "success" | "danger";
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.statusButton, tone === "success" ? styles.statusButtonSuccess : styles.statusButtonDanger]}
    >
      <View style={[styles.statusIcon, tone === "success" ? styles.statusIconSuccess : styles.statusIconDanger]}>
        <Ionicons color="#ffffff" name={tone === "success" ? "checkmark" : "alert"} size={30} />
      </View>
      <Text style={[styles.statusText, tone === "success" ? styles.statusTextSuccess : styles.statusTextDanger]}>{label}</Text>
      <Text style={styles.statusDescription}>{description}</Text>
    </Pressable>
  );
}

function confirmationLabel(point: PointForFill) {
  if (point.confirmationType === "nfc") {
    return "NFC подтвержден";
  }

  if (point.confirmationType === "qr") {
    return "QR подтвержден";
  }

  if (point.status === "deferred") {
    return "Отложена";
  }

  if (point.status === "skipped") {
    return "Метка недоступна";
  }

  return "Ручное заполнение";
}

function statusLabel(status: SelectedStatus | null) {
  if (status === "issue") {
    return "Неисправно";
  }

  if (status === "skipped") {
    return "Метка недоступна";
  }

  return "Исправно";
}

function statusTone(status: SelectedStatus | null) {
  if (status === "issue") {
    return "danger";
  }

  if (status === "skipped") {
    return "warning";
  }

  return "success";
}

function commentPlaceholder(status: SelectedStatus | null) {
  if (status === "issue") {
    return "Опишите неисправность";
  }

  if (status === "skipped") {
    return "Можно уточнить, почему метка недоступна";
  }

  return "Что заметили во время обхода?";
}

function fileStatusLabel(status: string) {
  switch (status) {
    case "uploaded":
    case "linked":
      return "Загружено";
    case "uploading":
      return "Отправка";
    case "retryLater":
    case "failed":
      return "Ожидает повтор";
    default:
      return "На телефоне";
  }
}

function toPointAttachment(file: { clientFileId: string; localPath: string; status: string; mediaKind?: "photo" | "video" | null }) {
  return {
    clientFileId: file.clientFileId,
    localPath: file.localPath,
    status: file.status,
    mediaKind: file.mediaKind ?? "photo"
  } satisfies PointAttachment;
}

function hasPhotoAttachment(attachments: PointAttachment[]) {
  return attachments.some((attachment) => attachment.mediaKind !== "video");
}

function formatScanTime(value: string | null) {
  if (!value) {
    return "вручную";
  }

  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 26
  },
  text: {
    fontSize: 15,
    lineHeight: 21
  },
  scanMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7
  },
  scanMetaText: {
    fontSize: 13,
    fontWeight: "700"
  },
  label: {
    fontSize: 14,
    fontWeight: "700"
  },
  input: {
    borderColor: "#d1d5db",
    borderRadius: 8,
    borderWidth: 1,
    color: "#0f1a2b",
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  textArea: {
    minHeight: 110
  },
  statusGrid: {
    flexDirection: "row",
    gap: 12
  },
  statusButton: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    minHeight: 174,
    justifyContent: "center",
    padding: 12
  },
  statusButtonSuccess: {
    backgroundColor: "#f1fcf6",
    borderColor: "#22c55e"
  },
  statusButtonDanger: {
    backgroundColor: "#fff7ed",
    borderColor: "#ef4444"
  },
  statusIcon: {
    alignItems: "center",
    borderRadius: 999,
    height: 50,
    justifyContent: "center",
    marginBottom: 14,
    width: 50
  },
  statusIconSuccess: {
    backgroundColor: "#22c55e"
  },
  statusIconDanger: {
    backgroundColor: "#ef4444"
  },
  statusText: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8
  },
  statusTextSuccess: {
    color: "#22c55e"
  },
  statusTextDanger: {
    color: "#ef4444"
  },
  statusDescription: {
    color: "#4b5563",
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center"
  },
  skipButton: {
    alignItems: "center",
    backgroundColor: "#fffbeb",
    borderColor: "#f59e0b",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 88,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  skipButtonPressed: {
    backgroundColor: "#fef3c7"
  },
  skipButtonDisabled: {
    opacity: 0.62
  },
  skipIcon: {
    alignItems: "center",
    backgroundColor: "#fef3c7",
    borderColor: "#fbbf24",
    borderWidth: 1,
    borderRadius: 999,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  skipTextBlock: {
    flex: 1,
    gap: 1
  },
  skipTitle: {
    color: "#78350f",
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 21
  },
  skipDescription: {
    color: "#92400e",
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 14
  },
  skipInfoCard: {
    borderColor: "#fbbf24"
  },
  guidanceBlock: {
    gap: 5
  },
  photoNote: {
    color: "#6b7280",
    fontSize: 13,
    lineHeight: 18
  },
  photoHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  emptyPhotoBox: {
    alignItems: "center",
    borderColor: "#b9cdfd",
    borderRadius: 12,
    borderStyle: "dashed",
    borderWidth: 1,
    minHeight: 92,
    justifyContent: "center"
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  photoTile: {
    gap: 6,
    width: 96
  },
  photo: {
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: "#e5e7eb",
    width: "100%"
  },
  photoStatus: {
    color: "#6b7280",
    fontSize: 11
  },
  videoTile: {
    alignItems: "center",
    aspectRatio: 1,
    backgroundColor: "#eff6ff",
    borderColor: "#bfdbfe",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    width: "100%"
  },
  videoLabel: {
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4
  },
  bottomActions: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  inlineLink: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 4
  },
  inlineLinkText: {
    fontSize: 14,
    fontWeight: "800"
  },
  moreButton: {
    alignItems: "center",
    borderColor: "#dbe5f2",
    borderRadius: 12,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 48
  },
  error: {
    color: "#ef4444",
    fontSize: 14,
    lineHeight: 20
  }
});
