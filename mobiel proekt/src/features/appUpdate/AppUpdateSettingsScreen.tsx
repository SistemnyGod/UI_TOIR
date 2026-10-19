import { useRouter } from "expo-router";
import { Text, View } from "react-native";

import { AppUpdateControls } from "@/features/appUpdate/AppUpdateControls";
import { appUpdateTitle, shortSha256 } from "@/features/appUpdate/appUpdatePresentation";
import { ProfileGroup, ProfileRow } from "@/features/profile/ProfileComponents";
import { useAppTheme } from "@/features/settings/themePreference";
import { formatMegabytes } from "@/domain/appUpdate/appUpdatePolicy";
import { offeredManifest, type AppUpdateState } from "@/services/appUpdate/appUpdateController";
import { appUpdateController, useAppUpdateState } from "@/services/appUpdate/appUpdateService";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusMessage } from "@/ui/StatusMessage";

export function AppUpdateSettingsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const state = useAppUpdateState();
  const manifest = offeredManifest(state);
  const installed = state.installed;

  return (
    <Screen title="Обновление приложения" onBack={() => router.back()}>
      <ProfileGroup>
        <ProfileRow
          icon="phone-portrait-outline"
          title="Установлена версия"
          detail={installed.versionName ? `${installed.versionName}${installed.versionCode ? ` (сборка ${installed.versionCode})` : ""}` : "Неизвестна"}
        />
        <ProfileRow icon="time-outline" title="Последняя проверка" detail={lastCheckLabel(state)} last />
      </ProfileGroup>
      <View style={{ gap: 12, marginTop: 16 }}>
        <PrimaryButton
          label="Проверить обновления"
          icon="refresh-outline"
          variant={manifest ? "secondary" : "primary"}
          loading={state.checking}
          onPress={() => { void appUpdateController.checkForUpdates("manual"); }}
        />
        {state.lastCheckError ? <StatusMessage message={state.lastCheckError} tone="warning" /> : null}
        {!state.lastCheckError && state.lastCheckedAt !== null ? <StatusMessage message={checkResultLabel(state)} tone={manifest ? "warning" : "success"} /> : null}
        {manifest ? (
          <View style={{ gap: 10 }}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: "800" }}>{appUpdateTitle(manifest.versionName)}</Text>
            {manifest.releaseNotes ? <Text style={{ color: colors.mutedText, fontSize: 15, lineHeight: 21 }}>{manifest.releaseNotes}</Text> : null}
            <Text selectable style={{ color: colors.mutedText, fontSize: 13 }}>
              {`${formatMegabytes(manifest.apkSizeBytes)} · SHA-256 ${shortSha256(manifest.sha256)}`}
            </Text>
            <AppUpdateControls state={state} />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

export function checkResultLabel(state: AppUpdateState) {
  switch (state.decision.kind) {
    case "required":
      return `Требуется обновление до версии ${state.decision.manifest.versionName}.`;
    case "available":
      return `Доступна версия ${state.decision.manifest.versionName}.`;
    case "upToDate":
      return "Установлена актуальная версия.";
    case "notPublished":
      return "На сервере нет опубликованных обновлений.";
    case "unknown":
      return "Версию этой сборки определить нельзя: обновления не проверяются.";
  }
}

function lastCheckLabel(state: AppUpdateState) {
  if (state.checking) return "Проверяем…";
  if (state.lastCheckedAt === null) return "Ещё не выполнялась";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    .format(new Date(state.lastCheckedAt));
}
