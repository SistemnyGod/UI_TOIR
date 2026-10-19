import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import { useAppTheme } from "@/features/settings/themePreference";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { usePointStyles } from "./pointFillStyles";
import type { PointAttachment } from "./pointFillTypes";

/** «Фото и видео»: tiles, preparation progress and the add button. Tapping a tile opens the viewer. */
export function PointAttachmentsBlock({ attachments, isMediaBusy, mediaProgress, mediaFileLabel, addDisabled, onOpen, onAdd }: {
  attachments: PointAttachment[]; isMediaBusy: boolean; mediaProgress: number | null; mediaFileLabel: string | null; addDisabled: boolean;
  onOpen: (clientFileId: string) => void; onAdd: () => void;
}) {
  const styles = usePointStyles();
  const { colors } = useAppTheme();
  return <Card>
    <View style={styles.photoHeader}>
      <Text style={[styles.label, { color: colors.text }]}>Фото и видео</Text>
      <Text style={styles.photoNote}>Необязательно</Text>
    </View>
    {attachments.length > 0 ? (
      <View style={styles.photoGrid}>
        {attachments.map((attachment) => (
          <Pressable key={attachment.clientFileId} style={styles.photoTile} accessibilityRole="button" accessibilityHint="Открыть на весь экран"
            accessibilityLabel={`${attachment.mediaKind === 'video' ? 'Видео' : 'Фото'}. ${fileStatusLabel(attachment.status)}`}
            disabled={isMediaBusy} onPress={() => onOpen(attachment.clientFileId)}>
            {attachment.mediaKind === "video" ? (
              <View style={styles.videoTile}>
                <Ionicons color={colors.primary} name="videocam-outline" size={24} />
                <Text style={styles.videoLabel}>Видео</Text>
              </View>
            ) : (
              <Image source={{ uri: attachment.localPath }} style={styles.photo} />
            )}
            {attachment.status === 'failed' || attachment.status === 'retryLater' ? (
              <Text style={[styles.photoStatus, { color: colors.danger }]}>Не отправлено</Text>
            ) : null}
          </Pressable>
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
    {isMediaBusy ? (
      <View style={styles.mediaProgress}>
        <ActivityIndicator />
        <Text style={styles.photoNote}>
          {mediaProgress === null ? "Открываем выбор или камеру…" : `${mediaFileLabel ?? "Файл"} · Подготовка ${Math.round(mediaProgress * 100)}%`}
        </Text>
      </View>
    ) : null}
    {isMediaBusy && mediaProgress !== null ? <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(mediaProgress * 100) }} style={{ height: 4, borderRadius: 2, backgroundColor: colors.border }}><View style={{ height: 4, borderRadius: 2, width: `${Math.round(mediaProgress * 100)}%`, backgroundColor: colors.primary }} /></View> : null}
    <PrimaryButton disabled={addDisabled} icon="attach-outline" label="Добавить фото или видео" onPress={onAdd} variant="secondary" />
  </Card>;
}

export function fileStatusLabel(status: string) {
  switch (status) {
    case "uploaded":
    case "linked":
    case "deletedAfterRetention":
      return "Прикреплено · на сервере";
    case "uploading":
      return "Прикреплено · отправляется";
    case "retryLater":
    case "failed":
      return "Прикреплено · ожидает повтор";
    default:
      return "Прикреплено · на телефоне";
  }
}
