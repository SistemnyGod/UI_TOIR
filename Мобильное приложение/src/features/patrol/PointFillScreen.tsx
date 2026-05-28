import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { listPointFiles } from "@/db/repositories/filesRepository";
import { deferPoint, getPointForFill, PointForFill, savePointIssue, savePointOk } from "@/db/repositories/patrolRepository";
import { useAppTheme } from "@/features/settings/themePreference";
import { attachPointPhotoFromCamera, attachPointPhotoFromGallery } from "@/services/mediaAttachmentService";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";

type SelectedStatus = "ok" | "issue";
type FillPhase = "status" | "details";

export function PointFillScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { assignmentId, pointId } = useLocalSearchParams<{ assignmentId: string; pointId: string }>();
  const [point, setPoint] = useState<PointForFill | null>(null);
  const [phase, setPhase] = useState<FillPhase>("status");
  const [selectedStatus, setSelectedStatus] = useState<SelectedStatus | null>(null);
  const [comment, setComment] = useState("");
  const [issueTypeId, setIssueTypeId] = useState("Неисправность");
  const [photos, setPhotos] = useState<{ clientFileId: string; localPath: string; status: string }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPhotoBusy, setIsPhotoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [loaded, files] = await Promise.all([getPointForFill(assignmentId, pointId), listPointFiles(assignmentId, pointId)]);
    setPoint(loaded);
    setComment(loaded?.comment ?? "");
    setIssueTypeId(loaded?.issueTypeId ?? "Неисправность");
    setPhotos(files.map((file) => ({ clientFileId: file.clientFileId, localPath: file.localPath, status: file.status })));

    if (loaded?.status === "ok" || loaded?.status === "issue") {
      setSelectedStatus(loaded.status);
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

    setIsSubmitting(true);
    try {
      if (selectedStatus === "issue") {
        await savePointIssue(assignmentId, pointId, comment.trim(), issueTypeId.trim() || "Неисправность");
      } else {
        await savePointOk(assignmentId, pointId, comment.trim());
      }
      router.replace(`/patrol/assignment/${assignmentId}/all-points`);
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
      await deferPoint(assignmentId, pointId);
      router.replace(`/patrol/assignment/${assignmentId}/all-points`);
    } catch {
      setError("Не удалось отложить метку.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAddPhoto(source: "camera" | "gallery") {
    setError(null);
    setIsPhotoBusy(true);
    try {
      const result = source === "camera"
        ? await attachPointPhotoFromCamera(assignmentId, pointId)
        : await attachPointPhotoFromGallery(assignmentId, pointId);

      if (result === "attached") {
        const files = await listPointFiles(assignmentId, pointId);
        setPhotos(files.map((file) => ({ clientFileId: file.clientFileId, localPath: file.localPath, status: file.status })));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось добавить фото.");
    } finally {
      setIsPhotoBusy(false);
    }
  }

  if (!point) {
    return (
      <Screen title="Заполнение метки" subtitle="Статус, комментарий и фотофиксация точки.">
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
          <Text style={[styles.text, { color: colors.mutedText }]}>
            {point.required ? "Обязательная метка" : "Дополнительная метка"}
          </Text>
        </Card>

        <View style={styles.statusGrid}>
          <StatusButton label="Исправно" description="Объект в нормальном состоянии" tone="success" onPress={() => selectStatus("ok")} />
          <StatusButton label="Неисправно" description="Обнаружена неисправность или отклонение" tone="danger" onPress={() => selectStatus("issue")} />
        </View>

        <Card style={styles.infoCard}>
          <Text style={styles.infoText}>Далее можно добавить комментарий и прикрепить фото.</Text>
        </Card>
        <PrimaryButton label="Все метки" onPress={() => router.replace(`/patrol/assignment/${assignmentId}/all-points`)} variant="secondary" />
      </Screen>
    );
  }

  return (
    <Screen title="Комментарий и фото" subtitle="Фото необязательное, но его можно сделать камерой телефона или выбрать из галереи.">
      <Card>
        <View style={styles.row}>
          <Text style={[styles.title, { color: colors.text }]}>
            {point.orderIndex}. {point.name}
          </Text>
          <StatusPill label={selectedStatus === "issue" ? "Неисправно" : "Исправно"} tone={selectedStatus === "issue" ? "danger" : "success"} />
        </View>
      </Card>

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
          placeholder={selectedStatus === "issue" ? "Опишите неисправность" : "Что заметили во время обхода?"}
          placeholderTextColor="#9ca3af"
          style={[styles.input, styles.textArea]}
          textAlignVertical="top"
          value={comment}
        />
      </Card>

      <Card>
        <View style={styles.photoHeader}>
          <Text style={[styles.label, { color: colors.text }]}>Фото</Text>
          <Text style={styles.photoNote}>Необязательно</Text>
        </View>
        {photos.length > 0 ? (
          <View style={styles.photoGrid}>
            {photos.map((photo) => (
              <View key={photo.clientFileId} style={styles.photoTile}>
                <Image source={{ uri: photo.localPath }} style={styles.photo} />
                <Text style={styles.photoStatus}>{photoStatusLabel(photo.status)}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyPhotoBox}>
            <Text style={styles.photoNote}>Фото пока не добавлено</Text>
          </View>
        )}
        {isPhotoBusy ? <ActivityIndicator /> : null}
        <View style={styles.photoActions}>
          <PrimaryButton disabled={isSubmitting || isPhotoBusy} label="Сделать фото" onPress={() => handleAddPhoto("camera")} variant="secondary" />
          <PrimaryButton disabled={isSubmitting || isPhotoBusy} label="Из галереи" onPress={() => handleAddPhoto("gallery")} variant="secondary" />
        </View>
      </Card>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {isSubmitting ? <ActivityIndicator /> : null}
      <View style={styles.bottomActions}>
        <PrimaryButton disabled={isSubmitting || isPhotoBusy} label="Отложить" onPress={handleDefer} variant="danger" />
        <PrimaryButton disabled={isSubmitting || isPhotoBusy} label="Сохранить" onPress={handleSave} variant="secondary" />
        <PrimaryButton disabled={isSubmitting || isPhotoBusy} label="Продолжить маршрут" onPress={handleSave} />
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
        <Text style={styles.statusIconText}>{tone === "success" ? "✓" : "!"}</Text>
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

  return "Ручное заполнение";
}

function photoStatusLabel(status: string) {
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
    minHeight: 190,
    justifyContent: "center",
    padding: 14
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
    height: 54,
    justifyContent: "center",
    marginBottom: 14,
    width: 54
  },
  statusIconSuccess: {
    backgroundColor: "#22c55e"
  },
  statusIconDanger: {
    backgroundColor: "#ef4444"
  },
  statusIconText: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "900"
  },
  statusText: {
    fontSize: 20,
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
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center"
  },
  infoCard: {
    backgroundColor: "#eef4ff",
    borderColor: "#b9cdfd"
  },
  infoText: {
    color: "#1e5bff",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    textAlign: "center"
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
    flexDirection: "row",
    gap: 10
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
