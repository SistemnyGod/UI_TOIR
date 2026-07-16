import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { listPointFiles } from "@/db/repositories/filesRepository";
import { deferPoint, getPointForFill, PointForFill, savePointIssue, savePointOk, skipPoint } from "@/db/repositories/patrolRepository";
import { isPhotoEvidenceRequired } from "@/domain/patrol/photoEvidencePolicy";
import { useAppTheme } from "@/features/settings/themePreference";
import {
  attachPointPhotoFromCamera,
  attachPointPhotoFromGallery,
  attachPointVideoFromCamera,
  attachPointVideoFromGallery
} from "@/services/mediaAttachmentService";
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

  const reload = useCallback(async () => {
    const [loaded, files] = await Promise.all([getPointForFill(assignmentId, pointId), listPointFiles(assignmentId, pointId)]);
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
    Alert.alert(
      "Метка недоступна",
      "Подтвердите, что физическую метку нельзя просканировать. В отчете будет видно, что точка закрыта вручную как недоступная.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Подтвердить",
          style: "destructive",
          onPress: () => {
            void confirmSkipTag();
          }
        }
      ]
    );
  }

  async function confirmSkipTag() {
    setError(null);
    if (isPhotoEvidenceRequired(Boolean(point?.requiresPhoto), "skipped") && !hasPhotoAttachment(attachments)) {
      setError("Для этой метки требуется фотофиксация.");
      return;
    }

    if (comment.trim().length === 0) {
      setError("Для ручного подтверждения укажите причину, почему метку не удалось отсканировать.");
      return;
    }

    setIsSubmitting(true);
    try {
      await skipPoint(assignmentId, pointId, {
        comment: comment.trim(),
        photoClientFileIds: attachments.map((attachment) => attachment.clientFileId)
      });
      setSelectedStatus("skipped");
      setPhase("details");
      await reload();
    } catch {
      setError("Не удалось отметить метку как недоступную.");
    } finally {
      setIsSubmitting(false);
    }
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
      router.replace(`/patrol/assignment/${assignmentId}`);
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
      router.replace(`/patrol/assignment/${assignmentId}`);
    } catch {
      setError("Не удалось отложить метку.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAddPhoto(source: "camera" | "gallery") {
    setError(null);
    setIsMediaBusy(true);
    try {
      const result = source === "camera"
        ? await attachPointPhotoFromCamera(assignmentId, pointId)
        : await attachPointPhotoFromGallery(assignmentId, pointId);

      if (result === "attached") {
        await reloadPointAndAttachments();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось добавить фото.");
    } finally {
      setIsMediaBusy(false);
    }
  }

  async function handleAddVideo(source: "camera" | "gallery") {
    setError(null);
    setIsMediaBusy(true);
    try {
      const result = source === "camera"
        ? await attachPointVideoFromCamera(assignmentId, pointId)
        : await attachPointVideoFromGallery(assignmentId, pointId);

      if (result === "attached") {
        await reloadPointAndAttachments();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось добавить видео.");
    } finally {
      setIsMediaBusy(false);
    }
  }

  async function reloadPointAndAttachments() {
    const [updatedPoint, files] = await Promise.all([
      getPointForFill(assignmentId, pointId),
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
        </Card>

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
        <PrimaryButton label="Все метки" onPress={() => router.replace(`/patrol/assignment/${assignmentId}/all-points`)} variant="secondary" />
      </Screen>
    );
  }

  return (
    <Screen title="Комментарий и вложения" subtitle="Фото и видео не обязательны, но помогают подтвердить состояние точки.">
      <Card>
        <View style={styles.row}>
          <Text style={[styles.title, { color: colors.text }]}>
            {point.orderIndex}. {point.name}
          </Text>
          <StatusPill label={statusLabel(selectedStatus)} tone={statusTone(selectedStatus)} />
        </View>
      </Card>

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
          <Text style={styles.photoNote}>Необязательно</Text>
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
        {isMediaBusy ? <ActivityIndicator /> : null}
        <View style={styles.photoActions}>
          <PrimaryButton disabled={isSubmitting || isMediaBusy} icon="camera-outline" label="Сделать фото" onPress={() => handleAddPhoto("camera")} variant="secondary" />
          <PrimaryButton disabled={isSubmitting || isMediaBusy} icon="images-outline" label="Фото из галереи" onPress={() => handleAddPhoto("gallery")} variant="secondary" />
          <PrimaryButton disabled={isSubmitting || isMediaBusy} icon="videocam-outline" label="Снять видео" onPress={() => handleAddVideo("camera")} variant="secondary" />
          <PrimaryButton disabled={isSubmitting || isMediaBusy} icon="film-outline" label="Видео из галереи" onPress={() => handleAddVideo("gallery")} variant="secondary" />
        </View>
      </Card>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {isSubmitting ? <ActivityIndicator /> : null}
      <View style={styles.bottomActions}>
        <PrimaryButton disabled={isSubmitting || isMediaBusy} icon="time-outline" label="Отложить" onPress={handleDefer} variant="danger" />
        <PrimaryButton disabled={isSubmitting || isMediaBusy} icon="save-outline" label="Сохранить" onPress={handleSave} />
      </View>
    </Screen>
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
    minHeight: 50,
    paddingHorizontal: 12,
    paddingVertical: 8
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
    height: 32,
    justifyContent: "center",
    width: 32
  },
  skipTextBlock: {
    flex: 1,
    gap: 1
  },
  skipTitle: {
    color: "#78350f",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 18
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
  photoActions: {
    flexDirection: "column",
    gap: 10
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
    gap: 10
  },
  error: {
    color: "#ef4444",
    fontSize: 14,
    lineHeight: 20
  }
});
