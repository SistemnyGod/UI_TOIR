import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import { ShiftRemark } from "@/db/repositories/shiftRemarkRepository";
import { formatDateTime, formatShortName, remarkStatusLabel, remarkStatusTone, useWorkAccountingStyles } from "@/features/emuTask/WorkAccountingPresentation";
import type { MediaSource, WorkTab } from "@/features/emuTask/workAccountingModel";
import { useAppTheme } from "@/features/settings/themePreference";
import { ActionSheet } from "@/ui/ActionSheet";
import { createButtonGlow } from "@/ui/brandPalette";
import { Card } from "@/ui/Card";
import { EmptyState } from "@/ui/EmptyState";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { StatusPill } from "@/ui/StatusPill";

/** The «Работы» title, the name of the shown list and the filter button. */
export function WorkAccountingHeader({ subtitle, onOpenFilter }: { subtitle: string; onOpenFilter: () => void }) {
  const styles = useWorkAccountingStyles();
  const { colors } = useAppTheme();
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 4, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text accessibilityRole="header" style={{ fontFamily: "Manrope_800ExtraBold", fontSize: 30, lineHeight: 36, letterSpacing: -0.6, color: colors.text }}>Работы</Text>
        <Text style={styles.helperText}>{subtitle}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Настроить фильтр" onPress={onOpenFilter}
        style={({ pressed }) => ({ width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, transform: [{ scale: pressed ? 0.94 : 1 }] })}>
        <Ionicons name="options-outline" size={22} color={colors.primary} />
      </Pressable>
    </View>
  );
}

/** The floating «Создать» button that opens the create sheet. */
export function CreateWorkButton({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ alignItems: "center" }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Создать работу или замечание"
        accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
        style={({ pressed }) => ({ height: 56, paddingHorizontal: 22, borderRadius: 20, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center",
          backgroundColor: disabled ? colors.disabled : pressed ? colors.accentPressed : colors.accent, transform: [{ scale: pressed ? 0.96 : 1 }],
          boxShadow: disabled ? undefined : createButtonGlow })}>
        <Ionicons name="add" size={24} color={disabled ? colors.disabledText : colors.onAccent} />
        <Text style={{ fontFamily: "Manrope_800ExtraBold", fontSize: 16, color: disabled ? colors.disabledText : colors.onAccent }}>Создать</Text>
      </Pressable>
    </View>
  );
}

export function WorkListEmpty({ tab }: { tab: WorkTab }) {
  return tab === "tasks"
    ? <EmptyState icon="construct-outline" title="Работ нет" text="Создайте работу на телефоне или дождитесь назначения из ЭМУ." />
    : <EmptyState icon="chatbox-ellipses-outline" title="Замечаний нет" text="Добавьте замечание по смене, участку и приложите фото при необходимости." />;
}

export function RemarkCard({ remark, disabled, onAttach }: { remark: ShiftRemark; disabled: boolean; onAttach: () => void }) {
  const styles = useWorkAccountingStyles();
  const { colors } = useAppTheme();
  return (
    <Card>
      <View style={styles.row}>
        <View style={styles.titleBox}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{remark.sectionName ?? "Замечание"}</Text>
          <Text style={[styles.text, { color: colors.mutedText }]} numberOfLines={4}>{remark.comment}</Text>
        </View>
        <StatusPill label={remarkStatusLabel(remark.status)} tone={remarkStatusTone(remark.status)} />
      </View>
      <Text style={[styles.text, { color: colors.mutedText }]}>Исполнитель: {remark.employeeName ? formatShortName(remark.employeeName) : "не указан"}</Text>
      <Text style={[styles.muted, { color: colors.mutedText }]}>Дата: {formatDateTime(remark.createdAtLocal)}</Text>
      <Text style={[styles.muted, { color: colors.mutedText }]}>Вложения: {remark.mediaClientFileIds.length}</Text>
      <PrimaryButton disabled={disabled} icon="attach-outline" label="Добавить вложение" onPress={onAttach} variant="secondary" />
    </Card>
  );
}

/** Camera photo, camera video or gallery pick for an attachment. */
export function MediaSourceSheet({ title, visible, onClose, onPick }: { title: string; visible: boolean; onClose: () => void; onPick: (source: MediaSource) => void }) {
  return (
    <ActionSheet
      actions={[
        { icon: "camera-outline", label: "Сделать фото", onPress: () => onPick("photo") },
        { icon: "videocam-outline", label: "Снять видео", onPress: () => onPick("video") },
        { icon: "images-outline", label: "Выбрать из галереи", onPress: () => onPick("gallery") }
      ]}
      onClose={onClose}
      title={title}
      visible={visible}
    />
  );
}
