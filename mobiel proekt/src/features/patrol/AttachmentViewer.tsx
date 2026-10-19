import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useAppTheme } from "@/features/settings/themePreference";
import { PersistentNotice } from "@/ui/PersistentNotice";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { useReducedMotion } from "@/ui/useReducedMotion";
import type { PointAttachment } from "./pointFillTypes";

export type AttachmentViewerProps = {
  attachment: PointAttachment;
  /** Why the attachment cannot be changed; null when delete and replace are allowed. */
  blockReason: string | null;
  /** True where the screen allows no changes at all, e.g. a read-only point card. */
  readOnly?: boolean;
  busy?: boolean;
  /** A failed delete or replace; shown here because the modal covers the screen's own notice. */
  error?: string | null;
  onDismissError?: () => void;
  onClose: () => void;
  onDelete?: (attachment: PointAttachment) => void;
  onReplace?: (attachment: PointAttachment) => void;
};

/**
 * Full-screen view of one attachment with delete and replace while it is still unsent.
 * Mount it only while an attachment is open; the modal keeps the system bars outside it.
 */
export function AttachmentViewer({ attachment, blockReason, readOnly = false, busy = false, error = null, onDismissError, onClose, onDelete, onReplace }: AttachmentViewerProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  // Keyed by file so a confirmation never carries over to another attachment.
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const confirmDelete = confirmFor === attachment.clientFileId;
  const setConfirmDelete = (value: boolean) => setConfirmFor(value ? attachment.clientFileId : null);
  const isVideo = attachment.mediaKind === "video";
  const editable = !readOnly && !blockReason;
  const kindLabel = isVideo ? "видео" : "фото";

  return (
    <Modal visible animationType={reducedMotion ? "none" : "fade"} onRequestClose={onClose}>
      <View accessibilityViewIsModal style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{isVideo ? "Видео" : "Фото"}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Закрыть просмотр" hitSlop={8} onPress={onClose} style={styles.close}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>
        <View style={[styles.media, { backgroundColor: colors.backgroundAccent }]}>
          {!isVideo ? (
            <Image accessibilityLabel="Фото вложения" source={{ uri: attachment.localPath }} resizeMode="contain" style={styles.image} />
          ) : (
            <View style={styles.videoPlaceholder}>
              <Ionicons name="videocam-outline" size={56} color={colors.primary} />
              <Text style={[styles.text, { color: colors.mutedText }]}>Видео сохранено на телефоне. Просмотр видео в приложении пока недоступен.</Text>
            </View>
          )}
        </View>
        <View style={styles.actions}>
          <PersistentNotice message={error} onDismiss={() => onDismissError?.()} />
          {readOnly ? null : blockReason ? (
            <Text accessibilityLiveRegion="polite" style={[styles.text, { color: colors.mutedText }]}>{blockReason}</Text>
          ) : confirmDelete ? (
            <>
              <Text accessibilityRole="alert" style={[styles.text, { color: colors.text }]}>Удалить {kindLabel} из метки? Файл будет удалён с телефона.</Text>
              <PrimaryButton icon="trash-outline" label={`Удалить ${kindLabel}`} variant="danger" loading={busy} disabled={busy}
                onPress={() => onDelete?.(attachment)} />
              <PrimaryButton label="Отмена" variant="ghost" disabled={busy} onPress={() => setConfirmDelete(false)} />
            </>
          ) : (
            <>
              {!isVideo && onReplace ? <PrimaryButton icon="camera-reverse-outline" label="Заменить фото" variant="secondary" disabled={busy}
                onPress={() => onReplace(attachment)} /> : null}
              {onDelete ? <PrimaryButton icon="trash-outline" label={`Удалить ${kindLabel}`} variant="danger" disabled={busy || !editable}
                onPress={() => setConfirmDelete(true)} /> : null}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1, fontSize: 20, lineHeight: 26, fontFamily: "Manrope_700Bold" },
  close: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" },
  media: { flex: 1, borderRadius: 12, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  image: { width: "100%", height: "100%" },
  videoPlaceholder: { alignItems: "center", gap: 12, padding: 24 },
  actions: { gap: 10 },
  text: { fontSize: 16, lineHeight: 24 }
});
