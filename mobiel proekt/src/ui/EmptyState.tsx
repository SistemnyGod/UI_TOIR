import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { useAppTheme } from "@/features/settings/themePreference";
import { Rise } from "@/ui/motion";
import { font } from "@/ui/typography";

/** Friendly empty list: a soft icon badge, a short title and what to do next. */
export function EmptyState({ icon, title, text, action }: { icon: keyof typeof Ionicons.glyphMap; title: string; text?: string; action?: ReactNode }) {
  const { colors } = useAppTheme();
  return <Rise>
    <View style={{ alignItems: "center", gap: 10, paddingVertical: 32, paddingHorizontal: 24 }}>
      <View style={{ width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", backgroundColor: colors.backgroundAccent }}>
        <View style={{ width: 60, height: 60, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder }}>
          <Ionicons name={icon} size={30} color={colors.primary} />
        </View>
      </View>
      <Text accessibilityRole="header" style={[font(800), { fontSize: 18, lineHeight: 24, textAlign: "center", color: colors.text }]}>{title}</Text>
      {text ? <Text style={[font(600), { fontSize: 14, lineHeight: 20, textAlign: "center", color: colors.mutedText, maxWidth: 300 }]}>{text}</Text> : null}
      {action ? <View style={{ alignSelf: "stretch", marginTop: 6 }}>{action}</View> : null}
    </View>
  </Rise>;
}
