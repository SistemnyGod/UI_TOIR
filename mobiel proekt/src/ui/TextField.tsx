import { forwardRef } from "react";
import { StyleSheet, TextInput, TextInputProps } from "react-native";
import { useAppTheme } from "@/features/settings/themePreference";
import { font } from "@/ui/typography";

/** Preserves caller event handlers, refs and editability; only owns field appearance. */
export const TextField = forwardRef<TextInput, TextInputProps>(function TextField({ style, editable, ...props }, ref) {
  const { colors } = useAppTheme();
  const fieldStyle = StyleSheet.flatten(style);
  return <TextInput {...props} ref={ref} editable={editable} placeholderTextColor={colors.placeholder}
    selectionColor={colors.primary}
    style={[{ borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 14 }, style, font(600), { minHeight: Math.max(52, typeof fieldStyle?.minHeight === "number" ? fieldStyle.minHeight : 0),
      fontSize: Math.max(16, fieldStyle?.fontSize ?? 16), lineHeight: Math.max(24, fieldStyle?.lineHeight ?? 24),
      color: editable === false ? colors.disabledText : colors.text,
      borderColor: colors.cardBorder, backgroundColor: editable === false ? colors.disabled : colors.field }]} />;
});
