import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, Text, View } from "react-native";

import type { WorkItemDto } from "@/domain/emu/emuTypes";
import { formatDateTime, formatParticipants, formatWorkAttachments, statusLabel, statusTone, workDeliveryPresentation } from "@/features/emuTask/WorkAccountingPresentation";
import { useAppTheme } from "@/features/settings/themePreference";
import { toneColors } from "@/ui/atomTheme";
import { avatar } from "@/ui/brandPalette";
import { Card } from "@/ui/Card";
import { GradientFill, type GradientKind } from "@/ui/GradientFill";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { StatusPill } from "@/ui/StatusPill";
import { font } from "@/ui/typography";

type PrimaryAction = { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void } | null;

/** Initials of the first participant (surname and name), shown in the avatar. */
export function participantInitials(task: Pick<WorkItemDto, "actualParticipants" | "assignedEmployees">) {
  const person = (task.actualParticipants.length > 0 ? task.actualParticipants : task.assignedEmployees)[0];
  if (!person) return null;
  const letters = person.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase() ?? "").join("");
  return letters || null;
}

/** Work card from the works mockup: accent stripe for active work, icon tile, avatar row and meta. */
export function WorkTaskCard({ task, primary, loading, onMenu }: { task: WorkItemDto; primary: PrimaryAction; loading: boolean; onMenu: () => void }) {
  const { colors } = useAppTheme();
  const tone = statusTone(task.status);
  const active = task.status === "inProgress";
  const stripe: GradientKind | null = active ? "accent" : tone === "warning" ? "warning" : tone === "danger" ? "danger" : null;
  const soft = toneColors(colors, tone);
  const delivery = workDeliveryPresentation(task.syncStatus);
  const deliveryColor = toneColors(colors, delivery.tone).foreground;
  const initials = participantInitials(task);
  return <Card style={styles.card}>
    {stripe ? <View style={styles.stripe}><GradientFill colors={colors} kind={stripe} radius={4} /></View> : null}
    <View style={styles.header}>
      <View style={[styles.tile, { backgroundColor: active ? colors.accent : soft.background, shadowColor: colors.accent }, active ? styles.tileRaised : null]}>
        {active ? <GradientFill colors={colors} kind="accent" radius={15} /> : null}
        <Ionicons color={active ? colors.onAccent : soft.foreground} name={tone === "success" ? "checkmark-done-outline" : "construct-outline"} size={22} />
      </View>
      <View style={styles.titleBox}>
        <Text style={[font(800), styles.title, { color: colors.text }]}>{task.title}</Text>
        <View style={styles.detailRow}>
          <Ionicons name="location-outline" size={14} color={colors.mutedText} />
          <Text style={[font(600), styles.detail, { color: colors.mutedText }]}>{task.sectionName ?? "Участок не указан"}</Text>
        </View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Действия: ${task.title}`} onPress={onMenu} style={[styles.menu, { borderColor: colors.cardBorder }]}>
        <Ionicons color={colors.mutedText} name="ellipsis-vertical" size={20} />
      </Pressable>
    </View>
    <View style={[styles.people, { backgroundColor: colors.backgroundAccent }]}>
      <View style={styles.avatar}>
        <LinearGradient colors={avatar.stops} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatarFill} />
        {initials ? <Text style={[font(800), styles.initials]}>{initials}</Text> : <Ionicons color={avatar.ink} name="person-outline" size={14} />}
      </View>
      <View style={styles.peopleText}>
        <Text style={[font(800), styles.peopleName, { color: colors.text }]} numberOfLines={2}>{formatParticipants(task)}</Text>
        <Text style={[font(600), styles.peopleMeta, { color: colors.faintText }]}>{formatDateTime(task.createdAtLocal)}</Text>
      </View>
      <View style={styles.delivery}>
        <Ionicons color={deliveryColor} name={delivery.tone === "success" ? "cloud-done-outline" : delivery.tone === "danger" ? "alert-circle-outline" : "phone-portrait-outline"} size={13} />
        <Text style={[font(800), styles.deliveryText, { color: deliveryColor }]}>{delivery.label}</Text>
      </View>
    </View>
    <View style={styles.metaRow}>
      <StatusPill label={statusLabel(task.status)} tone={tone} />
      <Text style={[font(600), styles.detail, styles.attachments, { color: colors.mutedText }]}>{formatWorkAttachments(task)}</Text>
    </View>
    {task.deliveryError ? <Text style={[font(600), styles.detail, { color: colors.danger }]}>{task.deliveryError}</Text> : null}
    {primary ? <PrimaryButton disabled={loading} label={primary.label} icon={primary.icon} onPress={primary.onPress} /> : null}
  </Card>;
}

// Plain style objects: this card is rendered by screen tests whose react-native mock has no StyleSheet.
const styles = {
  card: { borderRadius: 24, borderWidth: 1, gap: 12, overflow: "hidden", padding: 14 },
  stripe: { bottom: 18, left: 0, position: "absolute", top: 18, width: 4 },
  header: { alignItems: "center", flexDirection: "row", gap: 12 },
  tile: { alignItems: "center", borderRadius: 15, height: 46, justifyContent: "center", width: 46 },
  tileRaised: { elevation: 5, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12 },
  titleBox: { flex: 1, gap: 2, minWidth: 0 },
  title: { fontSize: 16, lineHeight: 21 },
  detailRow: { alignItems: "center", flexDirection: "row", gap: 4 },
  detail: { flexShrink: 1, fontSize: 13, lineHeight: 18 },
  menu: { alignItems: "center", borderRadius: 13, borderWidth: 1, height: 44, justifyContent: "center", width: 44 },
  people: { alignItems: "center", borderRadius: 14, flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  avatar: { alignItems: "center", borderRadius: 14, height: 28, justifyContent: "center", overflow: "hidden", width: 28 },
  avatarFill: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  initials: { color: avatar.ink, fontSize: 11, lineHeight: 14 },
  peopleText: { flex: 1, minWidth: 0 },
  peopleName: { fontSize: 13, lineHeight: 18 },
  peopleMeta: { fontSize: 11, lineHeight: 15 },
  delivery: { alignItems: "center", flexDirection: "row", flexShrink: 1, gap: 4, maxWidth: "40%" },
  deliveryText: { flexShrink: 1, fontSize: 11, lineHeight: 15 },
  metaRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 },
  attachments: { flex: 1, minWidth: 140 }
} as const;
