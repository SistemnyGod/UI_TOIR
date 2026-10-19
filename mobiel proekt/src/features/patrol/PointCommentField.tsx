import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useAppTheme } from "@/features/settings/themePreference";
import { Card } from "@/ui/Card";
import { TextField as TextInput } from "@/ui/TextField";
import { usePointStyles } from "./pointFillStyles";
import type { SelectedStatus } from "./pointFillTypes";
import { useVoiceDictation } from "./useVoiceDictation";

/** «Результат осмотра» text with a microphone that appends dictated Russian text. */
export function PointCommentField({ value, editable, selectedStatus, validationAttempted, onChangeText, onAppendText, onBlur }: {
  value: string; editable: boolean; selectedStatus: SelectedStatus | null; validationAttempted: boolean;
  onChangeText: (value: string) => void; onAppendText: (text: string) => void; onBlur: () => void;
}) {
  const styles = usePointStyles();
  const { colors } = useAppTheme();
  const dictation = useVoiceDictation(onAppendText);
  const { cancel } = dictation;
  // Saving locks the field; a phrase recognised after that must not reach it.
  useEffect(() => { if (!editable) cancel(); }, [cancel, editable]);
  const active = dictation.phase !== "idle";
  const missingText = validationAttempted && (selectedStatus === "issue" || selectedStatus === "skipped") && !value.trim();
  return <Card>
    <View style={styles.field}>
      <View style={styles.row}>
        <Text style={{ color: colors.mutedText, fontSize: 14, flex: 1 }}>Результат осмотра</Text>
        <Pressable testID="point-comment-voice" accessibilityRole="button"
          accessibilityLabel={active ? "Остановить диктовку" : "Диктовать описание голосом"}
          accessibilityState={{ disabled: !editable, busy: dictation.phase === "preparing" }}
          disabled={!editable} onPress={dictation.toggle}
          style={[styles.voiceButton, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : "transparent", opacity: editable ? 1 : 0.55 }]}>
          {dictation.phase === "preparing" ? <ActivityIndicator color={colors.primary} />
            : <Ionicons name={active ? "stop" : "mic-outline"} size={22} color={active ? colors.onAccent : colors.primary} />}
        </Pressable>
      </View>
      <TextInput
        testID="point-comment"
        accessibilityLabel="Результат осмотра"
        editable={editable} multiline
        onBlur={onBlur}
        onChangeText={onChangeText}
        placeholder="Описание результатов осмотра оборудования" style={[styles.input, styles.textArea]} textAlignVertical="top" value={value} />
      {dictation.partial ? <Text style={[styles.voiceHint, { color: colors.text }]}>{dictation.partial}…</Text> : null}
      {dictation.hint ? <Text accessibilityLiveRegion="polite" style={styles.voiceHint}>{dictation.hint}</Text> : null}
      {missingText ? <Text accessibilityRole="alert" style={styles.error}>{selectedStatus === "issue" ? "Опишите неисправность." : "Укажите, почему осмотр невозможен."}</Text> : null}
    </View>
  </Card>;
}
