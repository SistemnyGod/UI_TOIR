import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { currentContourId } from "@/core/environments";
import { listPointFiles } from "@/db/repositories/filesRepository";
import { getAssignmentById, getAssignmentScanPolicy, getPointForFill, listMissingCompleteAssignmentAttachmentIds, PointForFill, PointListItem } from "@/db/repositories/patrolRepository";
import { LocalMobileFile } from "@/domain/files/fileTypes";
import { useAppTheme } from "@/features/settings/themePreference";
import { logMobileError } from "@/services/mobileErrorReporter";
import { requestMobileDataRefresh } from "@/sync/syncTriggers";
import { shouldReloadAssignmentAfterSync, subscribeToSyncEvents } from "@/sync/syncEvents";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";

export function PointDetailScreen() {
  const router = useRouter();
  const { assignmentId, pointId } = useLocalSearchParams<{ assignmentId: string; pointId: string }>();
  const { colors } = useAppTheme();
  const [assignment, setAssignment] = useState<{ status: string } | null>(null);
  const [scanPolicy, setScanPolicy] = useState({ nfcEnabled: false, qrFallbackEnabled: false });
  const [point, setPoint] = useState<PointForFill | null>(null);
  const [attachments, setAttachments] = useState<LocalMobileFile[]>([]);
  const [missingAttachmentIds, setMissingAttachmentIds] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadRevision, setReloadRevision] = useState(0);


  useEffect(() => subscribeToSyncEvents((event) => {
    if (shouldReloadAssignmentAfterSync(event, assignmentId)) {
      setReloadRevision((value) => value + 1);
    }
  }), [assignmentId]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      void reloadRevision;
      requestMobileDataRefresh("appActive");
      void (async () => {
        try {
        const ownerUserId = await getStoredOwnerUserId();
        const [loadedAssignment, loadedPolicy, loadedPoint, files, missingIds] = await Promise.all([
          getAssignmentById(assignmentId),
          getAssignmentScanPolicy(assignmentId),
          ownerUserId ? getPointForFill(assignmentId, pointId, ownerUserId, currentContourId) : Promise.resolve(null),
          listPointFiles(assignmentId, pointId),
          listMissingCompleteAssignmentAttachmentIds(assignmentId, pointId)
        ]);
        if (!isMounted) {
          return;
        }
        setAssignment(loadedAssignment);
        setScanPolicy(loadedPolicy);
        setPoint(loadedPoint);
        setAttachments(files);
        setMissingAttachmentIds(missingIds);
        setLoadError(null);
        } catch (caught) {
          void logMobileError("patrol.point-detail.load.failed", caught);
          if (isMounted) {
            setLoadError(caught instanceof Error ? caught.message : "Не удалось прочитать точку обхода.");
          }
        } finally {
          if (isMounted) {
            setIsLoading(false);
          }
        }
      })();
      return () => {
        isMounted = false;
      };
    }, [assignmentId, pointId, reloadRevision])
  );

  if (isLoading) {
    return (
      <Screen title="Точка маршрута" subtitle="Карточка точки, текущий статус и действия.">
        <Card><Text style={[styles.text, { color: colors.mutedText }]}>Загрузка...</Text></Card>
      </Screen>
    );
  }

  if (loadError) {
    return (
      <Screen title="Точка маршрута" subtitle="Карточка точки, текущий статус и действия.">
        <Card>
          <Text style={[styles.text, { color: "#b91c1c" }]}>{loadError}</Text>
          <PrimaryButton icon="refresh-outline" label="Повторить загрузку" onPress={() => router.replace(`/patrol/assignment/${assignmentId}/point/${pointId}`)} variant="secondary" />
        </Card>
      </Screen>
    );
  }
  if (!point) {
    return (
      <Screen title="Точка маршрута" subtitle="Карточка точки, текущий статус и действия.">
        <Card>
          <Text style={[styles.text, { color: colors.mutedText }]}>Точка не найдена на телефоне.</Text>
        </Card>
      </Screen>
    );
  }

  const canEdit = assignment?.status === "inProgress";
  const canRestoreMissing = assignment?.status === "completedLocal" && missingAttachmentIds.length > 0;

  return (
    <Screen title="Точка маршрута" subtitle="Проверьте состояние точки, вложения и подтверждение метки.">
      <Card>
        <View style={styles.headerRow}>
          <View style={styles.titleBox}>
            <Text style={[styles.title, { color: colors.text }]}>
              {point.orderIndex}. {point.name}
            </Text>
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
        <Text style={[styles.text, { color: colors.mutedText }]}>{scanMethodsHint(scanPolicy)}</Text>
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
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Вложения</Text>
          <StatusPill label={attachments.length > 0 ? `${attachments.length}` : "Нет"} tone={attachments.length > 0 ? "success" : "neutral"} />
        </View>
        <Text style={[styles.text, { color: colors.mutedText }]}>{point.requiresPhoto ? "\u0424\u043e\u0442\u043e \u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u043e \u0434\u043b\u044f \u044d\u0442\u043e\u0439 \u0442\u043e\u0447\u043a\u0438." : "\u0424\u043e\u0442\u043e \u043d\u0435\u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u043e \u0434\u043b\u044f \u044d\u0442\u043e\u0439 \u0442\u043e\u0447\u043a\u0438."}</Text>
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
                <Text style={[styles.photoStatus, { color: colors.mutedText }]}>{fileStatusLabel(attachment.status)}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.text, { color: colors.mutedText }]}>Вложения не обязательны. Их можно добавить при исправности, неисправности или недоступной метке.</Text>
        )}
      </Card>

      {canEdit ? (
        <>
          <PrimaryButton
            icon="create-outline"
            label={point.status === "pending" ? "Заполнить метку" : "Изменить результат"}
            onPress={() => router.push(`/patrol/assignment/${assignmentId}/point/${pointId}/fill`)}
          />
          <View style={styles.actionRow}>
            {scanPolicy.nfcEnabled ? <SecondaryAction label="NFC" onPress={() => router.push(`/patrol/assignment/${assignmentId}/scan-nfc`)} /> : null}
            {scanPolicy.qrFallbackEnabled ? <SecondaryAction label="QR" onPress={() => router.push(`/patrol/assignment/${assignmentId}/scan-qr`)} /> : null}
            <SecondaryAction label="Все метки" onPress={() => router.push(`/patrol/assignment/${assignmentId}/all-points`)} />
          </View>
        </>
      ) : (
        <>
          {canRestoreMissing ? (
            <Card>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Вложение отсутствует</Text>
              <Text style={[styles.text, { color: colors.mutedText }]}>Файл отчёта потерян на телефоне. Можно добавить новое фото вместо него; исходный отчёт и его clientOperationId сохранятся.</Text>
              <PrimaryButton
                icon="refresh-outline"
                label={`Восстановить отсутствующее вложение (${missingAttachmentIds.length})`}
                onPress={() => router.push(`/camera/capture?assignmentId=${encodeURIComponent(assignmentId)}&pointId=${encodeURIComponent(pointId)}&mediaKind=photo&restoreMissing=true&missingClientFileId=${encodeURIComponent(missingAttachmentIds[0])}`)}
              />
            </Card>
          ) : null}
          <Card>
            <Text style={[styles.text, { color: colors.mutedText }]}>{pointActionHint(assignment?.status)}</Text>
          </Card>
        </>
      )}
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
      return "Метка недоступна";
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

  if (status === "deferred" || status === "skipped") {
    return "warning";
  }

  return "neutral";
}

function scanMethodsHint(policy: { nfcEnabled: boolean; qrFallbackEnabled: boolean }) {
  const methods = [policy.nfcEnabled ? "NFC" : null, policy.qrFallbackEnabled ? "QR" : null].filter(Boolean);
  return methods.length > 0
    ? `\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u043e: ${methods.join(" \u0438 ")}. \u0422\u043e\u0447\u043a\u0443 \u043c\u043e\u0436\u043d\u043e \u043e\u0442\u043a\u0440\u044b\u0442\u044c \u0432\u0440\u0443\u0447\u043d\u0443\u044e.`
    : "\u0421\u043a\u0430\u043d\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435 \u043e\u0442\u043a\u043b\u044e\u0447\u0435\u043d\u043e \u043c\u0430\u0440\u0448\u0440\u0443\u0442\u043e\u043c. \u0422\u043e\u0447\u043a\u0443 \u043c\u043e\u0436\u043d\u043e \u0437\u0430\u043a\u0440\u044b\u0442\u044c \u0432\u0440\u0443\u0447\u043d\u0443\u044e.";
}

function confirmationLabel(point: PointForFill) {
  if (point.status === "skipped") {
    return "Метка недоступна";
  }

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

function pointActionHint(status: string | undefined) {
  if (status === "cancelledServer" || status === "cancelled") {
    return "Заявка отменена диспетчером. Точка доступна только для просмотра.";
  }

  if (status === "completed" || status === "completedServer" || status === "completedLocal" || status === "syncing") {
    return "Обход завершен или ожидает отправки. Изменение точки заблокировано.";
  }

  if (status === "needsDispatcherDecision" || status === "conflict" || status === "syncError" || status === "authRequired") {
    return "Действия по точке временно заблокированы до синхронизации или решения диспетчера.";
  }

  return "Действия с меткой доступны после начала обхода.";
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
    flexWrap: "wrap",
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
  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  secondaryAction: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: "30%",
    flexGrow: 1,
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
