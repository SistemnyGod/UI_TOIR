import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { useAppTheme } from "@/features/settings/themePreference";
import { toneColors, type StatusTone } from "@/ui/atomTheme";
import { GradientFill, type GradientKind } from "@/ui/GradientFill";
import { font } from "@/ui/typography";

export type DeliveryStageTone = "done" | "active" | "waiting" | "failed";
export type DeliveryStage = { label: string; time: string | null; tone: DeliveryStageTone };

type StageInput = {
  status: string;
  resolutionStatus?: string | null;
  createdAtLocal: string | null;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  attemptCount: number;
};

const failed = new Set(["conflict", "rejected", "invalidPayload", "failed"]);
const delivered = new Set(["accepted", "duplicate", "uploaded", "linked"]);

/**
 * Delivery path of one queue entry: saved on the phone, sent to the server, then the server's answer
 * or the automatic retry that is scheduled. Derived only from the stored status and timestamps.
 */
export function deliveryStages(item: StageInput, format: (value: string | null) => string): DeliveryStage[] {
  const time = (value: string | null) => value ? format(value) : null;
  const stages: DeliveryStage[] = [{ label: "Сохранено на телефоне", time: time(item.createdAtLocal), tone: "done" }];
  const resolution = item.resolutionStatus ?? null;
  if (item.status === "sending" || item.status === "uploading") {
    stages.push({ label: "Отправляется на сервер", time: null, tone: "active" });
    return stages;
  }
  if (item.attemptCount > 0 || item.lastAttemptAt) {
    stages.push({ label: item.attemptCount > 1 ? `Отправлено на сервер · попыток: ${item.attemptCount}` : "Отправлено на сервер", time: time(item.lastAttemptAt), tone: "done" });
  }
  if (delivered.has(item.status) || resolution === "resolvedServerWins") {
    stages.push({ label: resolution === "resolvedServerWins" ? "Принято состояние сервера" : "Сервер принял", time: null, tone: "done" });
  } else if (resolution === "cancelledLocal") {
    stages.push({ label: "Отменено на телефоне", time: null, tone: "done" });
  } else if (item.status === "conflict" && resolution === "dispatcher") {
    stages.push({ label: "Передано диспетчеру", time: null, tone: "waiting" });
  } else if (failed.has(item.status)) {
    stages.push({ label: item.status === "conflict" ? "Сервер сообщил о конфликте" : item.status === "failed" ? "Загрузка не удалась" : "Сервер отклонил", time: null, tone: "failed" });
  } else if (item.status === "waiting_auth") {
    stages.push({ label: "Ждёт подтверждения входа", time: null, tone: "waiting" });
  } else if (item.status === "wrong_contour") {
    stages.push({ label: "Ждёт подключения к своему серверу", time: null, tone: "waiting" });
  } else if (item.status === "blocked") {
    stages.push({ label: "Ждёт предыдущих действий", time: null, tone: "waiting" });
  } else if (item.nextAttemptAt) {
    stages.push({ label: "Отправим автоматически", time: time(item.nextAttemptAt), tone: "waiting" });
  } else {
    stages.push({ label: item.status === "waiting_network" ? "Отправим, когда появится сеть" : "Отправим автоматически", time: null, tone: "waiting" });
  }
  return stages;
}

export function QueueDeliveryTimeline({ stages }: { stages: DeliveryStage[] }) {
  const { colors } = useAppTheme();
  const dotColor = (tone: DeliveryStageTone) => tone === "failed" ? colors.danger : tone === "waiting" ? colors.warning : tone === "active" ? colors.primary : colors.success;
  return <View accessible accessibilityLabel={stages.map(stage => [stage.label, stage.time].filter(Boolean).join(", ")).join(". ")} style={styles.timeline}>
    {stages.map((stage, index) => <View key={`${stage.label}-${index}`} style={styles.stage}>
      <View style={styles.rail}>
        <View style={[styles.dot, { backgroundColor: dotColor(stage.tone) }, stage.tone === "waiting" || stage.tone === "active" ? [styles.hollow, { borderColor: dotColor(stage.tone), backgroundColor: colors.card }] : null]} />
        {index < stages.length - 1 ? <View style={[styles.line, { backgroundColor: colors.border }]} /> : null}
      </View>
      <View style={styles.stageText}>
        <Text style={[font(700), styles.label, { color: stage.tone === "failed" ? colors.danger : colors.text }]}>{stage.label}</Text>
        {stage.time ? <Text style={[font(700), styles.time, { color: colors.faintText }]}>{stage.time}</Text> : null}
      </View>
    </View>)}
  </View>;
}

/** Rounded icon tile for a queue entry; filled with a gradient when the entry needs a decision. */
export function QueueIconTile({ icon, tone }: { icon: keyof typeof Ionicons.glyphMap; tone: StatusTone }) {
  const { colors } = useAppTheme();
  const filled = tone === "danger";
  const soft = toneColors(colors, tone);
  const kind: GradientKind = tone === "danger" ? "danger" : tone === "success" ? "success" : tone === "warning" ? "warning" : "accent";
  return <View style={[styles.tile, { backgroundColor: filled ? colors.dangerFill : soft.background }]}>
    {filled ? <GradientFill colors={colors} kind={kind} radius={14} /> : null}
    <Ionicons color={filled ? "#ffffff" : soft.foreground} name={icon} size={22} />
  </View>;
}

const styles = StyleSheet.create({
  timeline: { gap: 0 },
  stage: { flexDirection: "row", gap: 10 },
  rail: { alignItems: "center", paddingTop: 4, width: 12 },
  dot: { borderRadius: 5, height: 10, width: 10 },
  hollow: { borderWidth: 2 },
  line: { flex: 1, minHeight: 14, marginVertical: 2, width: 2 },
  stageText: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between", paddingBottom: 8 },
  label: { flexShrink: 1, fontSize: 13, lineHeight: 18 },
  time: { fontSize: 12, lineHeight: 18 },
  tile: { alignItems: "center", borderRadius: 14, height: 44, justifyContent: "center", overflow: "hidden", width: 44 }
});
