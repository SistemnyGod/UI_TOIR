import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState } from "react";
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "@/features/settings/themePreference";
import { TextField } from "@/ui/TextField";

/** Compact, searchable selection that keeps the surrounding form mounted. */
export function SelectField({ label, options, selectedId, onSelect, disabled = false, presentation = "inline" }: {
  label: string;
  options: { id: string; label: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
  presentation?: "inline" | "modal";
}) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find(option => option.id === selectedId);
  const filtered = options.filter(option => option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <View style={styles.field}>
    <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${selected?.label ?? "Выбрать"}`}
      accessibilityState={{ expanded, disabled }} disabled={disabled}
      onPress={() => { setQuery(""); setExpanded(value => !value); }}
      style={[styles.trigger, { backgroundColor: colors.field, borderColor: colors.border }]}>
      <Text style={[styles.value, { color: disabled ? colors.disabledText : selected ? colors.text : colors.placeholder }]}>
        {selected?.label ?? "Выбрать"}
      </Text>
      <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={20} color={colors.text} />
    </Pressable>
    {expanded && presentation === "inline" ? <View style={[styles.dropdown, { backgroundColor: colors.field, borderColor: colors.border }]}>
      <TextField accessibilityLabel={`Поиск: ${label}`} placeholder="Найти…" value={query}
        editable={!disabled} onChangeText={setQuery} style={styles.search} />
      <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={styles.options}>
        {filtered.map(option => <Pressable key={option.id} accessibilityRole="radio"
          accessibilityLabel={option.label} accessibilityState={{ checked: option.id === selectedId, disabled }}
          disabled={disabled} onPress={() => { onSelect(option.id); setExpanded(false); setQuery(""); }}
          style={styles.option}>
          <Text style={[styles.value, { color: option.id === selectedId ? colors.primary : colors.text }]}>{option.label}</Text>
          {option.id === selectedId ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
        </Pressable>)}
        {filtered.length === 0 ? <Text style={[styles.empty, { color: colors.text }]}>
          {options.length === 0 ? "Нет доступных вариантов" : "Ничего не найдено"}
        </Text> : null}
      </ScrollView>
    </View> : null}
    {presentation === "modal" ? <Modal statusBarTranslucent navigationBarTranslucent transparent visible={expanded} animationType="none" onRequestClose={() => setExpanded(false)}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={[styles.backdrop, { backgroundColor: colors.scrim, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sheetHeader}>
            <Text accessibilityRole="header" style={[styles.sheetTitle, { color: colors.text }]}>{label}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Закрыть выбор: ${label}`} onPress={() => setExpanded(false)} style={styles.close}>
              <Ionicons name="close-outline" size={24} color={colors.text} />
            </Pressable>
          </View>
          <TextField accessibilityLabel={`Поиск: ${label}`} placeholder="Найти…" value={query} editable={!disabled} onChangeText={setQuery} style={styles.search} />
          <FlatList data={filtered} keyExtractor={option => option.id} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }}
            ListEmptyComponent={<Text style={[styles.empty, { color: colors.mutedText }]}>{options.length ? "Ничего не найдено" : "Нет доступных вариантов"}</Text>}
            renderItem={({ item: option }) => <Pressable accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ checked: option.id === selectedId, disabled }} disabled={disabled}
              onPress={() => { onSelect(option.id); setExpanded(false); setQuery(""); }} style={[styles.option, { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
              <Text style={[styles.value, { color: colors.text }]}>{option.label}</Text>
              <Ionicons name={option.id === selectedId ? "radio-button-on" : "radio-button-off"} size={22} color={option.id === selectedId ? colors.primary : colors.mutedText} />
            </Pressable>} />
        </View>
      </KeyboardAvoidingView>
    </Modal> : null}
  </View>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "center", padding: 20 },
  sheet: { maxHeight: "85%", borderRadius: 18, borderWidth: 1, overflow: "hidden", paddingBottom: 12 },
  sheetHeader: { flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 4 },
  sheetTitle: { flex: 1, fontSize: 20, fontWeight: "700" },
  close: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: "600" },
  trigger: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  value: { flex: 1, fontSize: 16, lineHeight: 24 },
  dropdown: { borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  search: { margin: 8, paddingHorizontal: 10, borderWidth: 1, borderRadius: 8 },
  options: { maxHeight: 240 },
  option: { minHeight: 48, paddingVertical: 10, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  empty: { padding: 12, fontSize: 14 }
});
