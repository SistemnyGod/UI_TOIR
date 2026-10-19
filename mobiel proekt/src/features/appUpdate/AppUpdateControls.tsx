import { StyleSheet, Text, View } from "react-native";

import { describeAppUpdateDownload } from "@/features/appUpdate/appUpdatePresentation";
import { useAppTheme } from "@/features/settings/themePreference";
import type { AppUpdateState } from "@/services/appUpdate/appUpdateController";
import { appUpdateController } from "@/services/appUpdate/appUpdateService";
import { toneColors } from "@/ui/atomTheme";
import { PrimaryButton } from "@/ui/PrimaryButton";

/** Download progress and the update actions shared by the banner, the blocking screen and settings. */
export function AppUpdateControls({ state, extraAction }: { state: AppUpdateState; extraAction?: React.ReactNode }) {
  const { colors } = useAppTheme();
  const view = describeAppUpdateDownload(state.download);
  const palette = toneColors(colors, view.tone);

  return (
    <View style={styles.container}>
      {view.text ? (
        <Text accessibilityLiveRegion="polite" style={[styles.status, { color: view.tone === "neutral" ? colors.mutedText : palette.foreground }]}>
          {view.text}
        </Text>
      ) : null}
      {view.progress !== null ? (
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.floor(view.progress * 100) }}
          style={[styles.track, { backgroundColor: colors.backgroundAccent }]}
        >
          <View style={[styles.fill, { backgroundColor: colors.primary, width: `${Math.floor(view.progress * 100)}%` }]} />
        </View>
      ) : null}
      <View style={styles.actions}>
        {view.startLabel ? (
          <PrimaryButton label={view.startLabel} icon="download-outline" onPress={() => { void appUpdateController.startUpdate(); }} />
        ) : null}
        {view.busy && !view.canCancel ? <PrimaryButton label="Подождите…" loading /> : null}
        {view.canCancel ? (
          <PrimaryButton label="Отменить загрузку" variant="secondary" onPress={() => { void appUpdateController.cancelDownload(); }} />
        ) : null}
        {view.showInstallPermission ? (
          <PrimaryButton
            label="Разрешить установку"
            icon="shield-checkmark-outline"
            variant="secondary"
            onPress={() => { void appUpdateController.openInstallPermissionSettings(); }}
          />
        ) : null}
        {extraAction}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  status: { fontSize: 14, lineHeight: 20 },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
  actions: { gap: 8 }
});
