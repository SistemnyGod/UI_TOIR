import { Ionicons } from "@expo/vector-icons";
import { Image, StyleSheet, Text, View } from "react-native";

import { resolvePhotoInstructionSlot, type PointPhotoInstruction } from "@/domain/patrol/pointPhotoInstruction";
import { useAppTheme } from "@/features/settings/themePreference";
import { Card } from "@/ui/Card";

/** Reserved place for a photo instruction. Renders nothing until one exists or the placeholder flag is on. */
export function PointPhotoInstructionSlot({ instruction, placeholderEnabled }: { instruction?: PointPhotoInstruction | null; placeholderEnabled?: boolean }) {
  const { colors } = useAppTheme();
  const slot = resolvePhotoInstructionSlot(instruction, placeholderEnabled);
  if (!slot) return null;
  if (slot.kind === "placeholder") {
    return <View accessibilityLabel={slot.message} style={[styles.placeholder, { borderColor: colors.border }]}>
      <Ionicons name="image-outline" size={20} color={colors.mutedText} />
      <Text style={[styles.text, { color: colors.mutedText }]}>{slot.message}</Text>
    </View>;
  }
  return <Card>
    <Text style={[styles.label, { color: colors.text }]}>Фото-инструкция</Text>
    <Image accessibilityLabel={slot.caption ?? "Фото-инструкция к метке"} source={{ uri: slot.uri }}
      resizeMode="contain" style={[styles.photo, { backgroundColor: colors.backgroundAccent }]} />
    {slot.caption ? <Text style={[styles.text, { color: colors.mutedText }]}>{slot.caption}</Text> : null}
  </Card>;
}

const styles = StyleSheet.create({
  placeholder: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48, padding: 12, borderRadius: 12, borderWidth: 1, borderStyle: "dashed" },
  label: { fontSize: 16, lineHeight: 22, fontWeight: "700" },
  text: { flexShrink: 1, fontSize: 14, lineHeight: 20 },
  photo: { width: "100%", aspectRatio: 4 / 3, borderRadius: 8 }
});
