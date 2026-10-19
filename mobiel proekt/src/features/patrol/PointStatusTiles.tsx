import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { useAppTheme } from "@/features/settings/themePreference";
import { toneFill } from "@/ui/atomTheme";
import { font } from "@/ui/typography";
import { inspectionChoices } from "./pointInspectionPresentation";
import { usePointStyles } from "./pointFillStyles";
import type { SelectedStatus } from "./pointFillTypes";

/** The first step of the form: large «Исправно» / «Неисправно» tiles. */
export function PointStatusTiles({ selectedStatus, disabled, onSelect }: {
  selectedStatus: SelectedStatus | null; disabled: boolean; onSelect: (status: SelectedStatus) => void;
}) {
  const styles = usePointStyles();
  const { fontScale, width } = useWindowDimensions();
  const stacked = fontScale > 1.3 || width < 350;
  return <View style={styles.statusCenter}><View accessibilityRole="radiogroup" accessibilityLabel="Результат осмотра" style={[styles.statusGrid, stacked && styles.statusStack]}>
    {inspectionChoices.filter(choice => choice.status !== "skipped").map(choice => <StatusButton key={choice.status} testID={`point-status-${choice.status}`} label={choice.label}
      tone={choice.tone} selected={selectedStatus === choice.status} disabled={disabled}
      stacked={stacked} wrap={false} onPress={() => onSelect(choice.status)} />)}
  </View></View>;
}

function StatusButton({ testID, label, tone, selected, disabled, stacked, wrap, onPress }: {
  testID?: string; label: string; tone: "success" | "danger" | "warning"; selected: boolean; disabled: boolean; stacked: boolean; wrap: boolean; onPress: () => void;
}) {
  const styles = usePointStyles();
  const { colors } = useAppTheme();
  return <Pressable testID={testID} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: selected, disabled }}
    disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.statusButton, stacked && styles.statusButtonStack,
      wrap && { flexGrow: 1, flexBasis: tone === 'warning' ? '100%' : '45%' },
      { backgroundColor: colors[`${tone}Surface`], borderColor: selected ? colors[tone] : colors[`${tone}Surface`], opacity: disabled ? 0.55 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
    <View style={[styles.statusIcon, { backgroundColor: toneFill(colors, tone), shadowColor: toneFill(colors, tone) }]}>
      <Ionicons color={colors.onAccent} name={tone === "success" ? "checkmark" : tone === "danger" ? "alert" : "eye-off-outline"} size={34} />
    </View>
    <Text textBreakStrategy="simple" style={[styles.statusText, font(800), { color: colors[tone] }]}>{!stacked && label === "Осмотр невозможен" ? "Осмотр\nневозможен" : label}</Text>
  </Pressable>;
}

/** «Исправно · Изменить» link that returns to the tiles, plus the «…» actions button. */
export function PointStatusSummary({ selectedStatus, disabled, onChange, onMore }: {
  selectedStatus: SelectedStatus | null; disabled: boolean; onChange: () => void; onMore: () => void;
}) {
  const styles = usePointStyles();
  const { colors } = useAppTheme();
  return <View style={styles.row}><Pressable accessibilityRole="button" accessibilityLabel="Изменить статус" disabled={disabled}
    onPress={onChange} style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8 }}>
    <Ionicons name="chevron-back" size={18} color={colors.primary} />
    <Text style={{ color: selectedStatus === "issue" ? colors.danger : selectedStatus === "skipped" ? colors.warning : colors.success, fontSize: 14 }}>{selectedStatus === "issue" ? "Неисправно" : selectedStatus === "skipped" ? "Не осмотрено" : "Исправно"} · Изменить</Text>
  </Pressable><Pressable accessibilityRole="button" accessibilityLabel="Дополнительные действия" disabled={disabled} onPress={onMore} style={styles.moreButton}><Ionicons name="ellipsis-horizontal" size={22} color={colors.primary} /></Pressable></View>;
}
