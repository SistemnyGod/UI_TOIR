import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { listPointFiles } from "@/db/repositories/filesRepository";
import { getPointForFill, PointForFill, PointListItem } from "@/db/repositories/patrolRepository";
import { LocalMobileFile } from "@/domain/files/fileTypes";
import { useAppTheme } from "@/features/settings/themePreference";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";

export function PointDetailScreen() {
  const router = useRouter();
  const { assignmentId, pointId } = useLocalSearchParams<{ assignmentId: string; pointId: string }>();
  const { colors } = useAppTheme();
  const [point, setPoint] = useState<PointForFill | null>(null);
  const [photos, setPhotos] = useState<LocalMobileFile[]>([]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      void Promise.all([getPointForFill(assignmentId, pointId), listPointFiles(assignmentId, pointId)]).then(([loadedPoint, files]) => {
        if (isMounted) {
          setPoint(loadedPoint);
          setPhotos(files);
        }
      });

      return () => {
        isMounted = false;
      };
    }, [assignmentId, pointId])
  );

  if (!point) {
    return (
      <Screen title="Точка маршрута" subtitle="Карточка точки, текущий статус и действия.">
        <Card>
          <Text style={[styles.text, { color: colors.mutedText }]}>Точка не найдена на телефоне.</Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title="Точка маршрута" subtitle="Проверьте состояние точки, фото и подтверждение метки.">
      <Card>
        <View style={styles.headerRow}>
          <View style={styles.titleBox}>
            <Text style={[styles.title, { color: colors.text }]}>
              {point.orderIndex}. {point.name}
            </Text>
            <Text style={[styles.text, { color: colors.mutedText }]}>{point.required ? "Обязательная метка" : "Дополнительная метка"}</Text>
          </View>
          <StatusPill label={pointStatusLabel(point.status)} tone={pointStatusTone(point.status)} />
        </View>
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Подтверждение</Text>
        <View style={styles.pills}>
          <StatusPill label={confirmationLabel(point)} tone={point.confirmationType ? "success" : "neutral"} />
          {point.scannedAtLocal ? <StatusPill label={formatDateTime(point.scannedAtLocal)} tone="neutral" /> : null}
        </View>
        <Text style={[styles.text, { color: colors.mutedText }]}>Точку можно подтвердить NFC, QR или открыть вручную из списка меток.</Text>
      </Card>

      {point.status === "issue" || point.comment || point.deferredReason ? (
        <Card>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Результат</Text>
          {point.issueTypeId ? <InfoLine label="Тип" value={point.issueTypeId} /> : null}
          {point.comment ? <InfoLine label="Комментарий" value={point.comment} /> : null}
          {point.deferredReason ? <InfoLine label="Причина отложения" value={point.deferredReason} /> : null}
          {point.completedAtLocal ? <InfoLine label="Заполнено" value={formatDateTime(point.completedAtLocal)} /> : null}
        </Card>
      ) : null}

      <Card>
        <View style={styles.headerRow}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Фото</Text>
          <StatusPill label={photos.length > 0 ? `${photos.length}` : "Не приложены"} tone={photos.length > 0 ? "success" : "neutral"} />
        </View>
        {photos.length > 0 ? (
          <View style={styles.photoGrid}>
            {photos.map((photo) => (
              <View key={photo.clientFileId} style={styles.photoTile}>
                <Image source={{ uri: photo.localPath }} style={styles.photo} />
                <Text style={[styles.photoStatus, { color: colors.mutedText }]}>{fileStatusLabel(photo.status)}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.text, { color: colors.mutedText }]}>Фото необязательное. Его можно добавить при исправности и неисправности.</Text>
        )}
      </Card>

      <PrimaryButton label={point.status === "pending" ? "Заполнить метку" : "Изменить результат"} onPress={() => router.push(`/patrol/assignment/${assignmentId}/point/${pointId}/fill`)} />
      <PrimaryButton label="Добавить фото" onPress={() => router.push(`/camera/capture?assignmentId=${assignmentId}&pointId=${pointId}`)} />
      <View style={styles.actionRow}>
        <SecondaryAction label="NFC" onPress={() => router.push(`/patrol/assignment/${assignmentId}/scan-nfc`)} />
        <SecondaryAction label="QR" onPress={() => router.push(`/patrol/assignment/${assignmentId}/scan-qr`)} />
        <SecondaryAction label="Все метки" onPress={() => router.push(`/patrol/assignment/${assignmentId}/all-points`)} />
      </View>
    </Screen>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.infoLine}>
      <Text style={[styles.infoLabel, { color: colors.mutedText }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

function SecondaryAction({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryAction,
        { borderColor: colors.border, backgroundColor: pressed ? colors.background : colors.card }
      ]}
    >
      <Text style={[styles.secondaryActionText, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

function pointStatusLabel(status: PointListItem["status"]) {
  switch (status) {
    case "ok":
      return "Исправно";
    case "issue":
      return "Неисправно";
    case "deferred":
      return "Отложена";
    case "scanned":
      return "Сканирована";
    case "skipped":
      return "Пропущена";
    default:
      return "Не заполнено";
  }
}

function pointStatusTone(status: PointListItem["status"]) {
  if (status === "ok") {
    return "success";
  }

  if (status === "issue") {
    return "danger";
  }

  if (status === "deferred") {
    return "warning";
  }

  return "neutral";
}

function confirmationLabel(point: PointForFill) {
  if (point.confirmationType === "nfc") {
    return "NFC подтвержден";
  }

  if (point.confirmationType === "qr") {
    return "QR подтвержден";
  }

  if (point.confirmationType === "manual") {
    return "Открыта вручную";
  }

  return "Не подтверждена";
}

function fileStatusLabel(status: string) {
  switch (status) {
    case "uploaded":
      return "Отправлено";
    case "uploading":
      return "Отправляется";
    case "queued":
      return "Ожидает отправки";
    case "failed":
    case "retryLater":
      return "Ожидает повтор";
    default:
      return "На телефоне";
  }
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit"
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: "row",
    gap: 8
  },
  headerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  infoLine: {
    gap: 3
  },
  infoValue: {
    fontSize: 15,
    lineHeight: 21
  },
  photo: {
    aspectRatio: 1,
    backgroundColor: "#e2e8f0",
    borderRadius: 8,
    width: "100%"
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  photoStatus: {
    fontSize: 11,
    lineHeight: 14
  },
  photoTile: {
    gap: 6,
    width: 96
  },
  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  secondaryAction: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 12
  },
  secondaryActionText: {
    fontSize: 14,
    fontWeight: "700"
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700"
  },
  text: {
    fontSize: 15,
    lineHeight: 21
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 26
  },
  titleBox: {
    flex: 1,
    gap: 4
  }
});
