import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppUpdateControls } from "@/features/appUpdate/AppUpdateControls";
import { appUpdateTitle, describeAppUpdateDownload } from "@/features/appUpdate/appUpdatePresentation";
import { useAppTheme } from "@/features/settings/themePreference";
import { offeredManifest, type AppUpdateState } from "@/services/appUpdate/appUpdateController";
import { appUpdateController } from "@/services/appUpdate/appUpdateService";
import { PrimaryButton } from "@/ui/PrimaryButton";

/** Non-blocking offer of an optional update, floating above the current screen. */
export function AppUpdateBanner({ state }: { state: AppUpdateState }) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const manifest = offeredManifest(state);
  if (!manifest) return null;
  const view = describeAppUpdateDownload(state.download);

  return (
    <View
      accessibilityRole="alert"
      pointerEvents="box-none"
      style={[styles.overlay, { top: insets.top + 8 }]}
    >
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.primary, shadowColor: colors.text }]}>
        <View style={styles.header}>
          <Ionicons name="arrow-up-circle-outline" size={24} color={colors.primary} />
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{appUpdateTitle(manifest.versionName)}</Text>
        </View>
        {manifest.releaseNotes ? (
          <Text numberOfLines={3} style={[styles.notes, { color: colors.mutedText }]}>{manifest.releaseNotes}</Text>
        ) : null}
        <AppUpdateControls
          state={state}
          extraAction={view.busy ? null : (
            <PrimaryButton label="Позже" variant="ghost" onPress={() => { void appUpdateController.postpone(); }} />
          )}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: "absolute", left: 12, right: 12 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    elevation: 6,
    gap: 10,
    padding: 14,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12
  },
  header: { alignItems: "center", flexDirection: "row", gap: 10 },
  title: { flex: 1, fontSize: 17, fontFamily: "Manrope_800ExtraBold", lineHeight: 22 },
  notes: { fontSize: 14, lineHeight: 20 }
});
