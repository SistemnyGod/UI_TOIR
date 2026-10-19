import { Ionicons } from "@expo/vector-icons";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useAppTheme } from "@/features/settings/themePreference";
import { font } from "@/ui/typography";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { SelectField } from "@/ui/SelectField";
import { StatusMessage } from "@/ui/StatusMessage";
import { TextField as TextInput } from "@/ui/TextField";
import { usePointStyles } from "./pointFillStyles";

const manualReasonOptions = ["Метка отсутствует", "Метка повреждена", "Не удаётся считать метку"].map(label => ({ id: label, label }));

/** «Метка недоступна»: the reason is required before the point is inspected without NFC. */
export function PointManualSheet({ pointName, reason, error, isSubmitting, isSavingBeforeLeave, hasPendingLeave, onChangeReason, onRetryLeave, onClose, onContinue }: {
  pointName: string; reason: string; error: string | null; isSubmitting: boolean; isSavingBeforeLeave: boolean; hasPendingLeave: boolean;
  onChangeReason: (reason: string) => void; onRetryLeave: () => void; onClose: () => void; onContinue: () => void;
}) {
  const styles = usePointStyles();
  const { colors } = useAppTheme();
  const isListedReason = manualReasonOptions.some(option => option.id === reason);
  return <Screen compactHeader scroll={false} title="Осмотр без NFC">
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end", paddingTop: 16 }}>
      <View style={{ alignItems: "center", gap: 10, padding: 24 }}>
        <Text style={{ color: colors.mutedText, fontSize: 16 }}>{pointName}</Text>
        <View style={{ width: 96, height: 96, borderRadius: 32, alignItems: "center", justifyContent: "center", backgroundColor: colors.warningSurface }}><Ionicons name="pricetag-outline" size={48} color={colors.warning} /></View>
      </View>
      <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, gap: 14, borderWidth: 1, borderColor: colors.cardBorder, shadowColor: colors.shadow, shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: -8 }, elevation: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text accessibilityRole="header" style={[font(800), { flex: 1, fontSize: 22, color: colors.text }]}>Метка недоступна</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Закрыть причину недоступности метки" disabled={isSubmitting} onPress={onClose} style={{ minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="close-outline" size={24} color={colors.text} />
          </Pressable>
        </View>
        <Text style={{ color: colors.mutedText, fontSize: 16, lineHeight: 24 }}>Укажите причину, затем осмотрите объект без NFC.</Text>
        {isSavingBeforeLeave ? <StatusMessage message="Сохраняем последние изменения…" /> : null}
        {hasPendingLeave && !isSavingBeforeLeave ? <PrimaryButton label="Повторить сохранение" onPress={onRetryLeave} variant="secondary" /> : null}
        <SelectField label="Причина *" disabled={isSubmitting}
          options={[...manualReasonOptions, { id: "other", label: "Другая причина" }]}
          selectedId={isListedReason ? reason : reason ? "other" : ""}
          onSelect={value => onChangeReason(value === "other" ? "" : value)} />
        {!isListedReason ? <TextInput accessibilityLabel="Причина недоступности NFC" value={reason} onChangeText={onChangeReason}
          placeholder="Опишите причину" maxLength={120} style={[styles.input, { color: colors.text }]} /> : null}
      {error ? <StatusMessage message={error} tone="danger" /> : null}
      <PrimaryButton testID="point-manual-continue" label="Продолжить" loading={isSubmitting} disabled={!reason.trim() || isSubmitting} onPress={onContinue} />
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
  </Screen>;
}
