import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { countBlockingLocalUserData } from "@/db/repositories/bootstrapRepository";
import { formatMegabytes } from "@/domain/appUpdate/appUpdatePolicy";
import { AppUpdateControls } from "@/features/appUpdate/AppUpdateControls";
import { describeQueueDeliveryResult, unsentDataSummary } from "@/features/appUpdate/appUpdatePresentation";
import { useAppTheme } from "@/features/settings/themePreference";
import { offeredManifest, type AppUpdateState } from "@/services/appUpdate/appUpdateController";
import { appUpdateController } from "@/services/appUpdate/appUpdateService";
import { logMobileError } from "@/services/mobileErrorReporter";
import { triggerForegroundSyncWithRetry } from "@/sync/syncTriggers";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { StatusMessage } from "@/ui/StatusMessage";

/**
 * Blocking «Требуется обновление» screen. It never touches local data: the
 * employee can still deliver the unsent queue, and everything stored on the
 * phone survives the APK update.
 */
export function UpdateRequiredScreen({ state }: { state: AppUpdateState }) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const manifest = offeredManifest(state);
  const [unsentCount, setUnsentCount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [deliveryMessage, setDeliveryMessage] = useState<string | null>(null);
  const sendingRef = useRef(false);

  const mountedRef = useRef(true);
  const refreshUnsentCount = useCallback(() => countBlockingLocalUserData().then(
    (count) => { if (mountedRef.current) setUnsentCount(count); },
    (error) => {
      void logMobileError("app_update.unsent_count.failed", error);
      if (mountedRef.current) setUnsentCount(null);
    }
  ), []);

  useEffect(() => {
    mountedRef.current = true;
    void refreshUnsentCount();
    return () => { mountedRef.current = false; };
  }, [refreshUnsentCount]);

  const sendQueue = async () => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setDeliveryMessage(null);
    try {
      const result = await triggerForegroundSyncWithRetry({ mode: "manualAll" });
      setDeliveryMessage(describeQueueDeliveryResult(result));
    } catch (error) {
      void logMobileError("app_update.queue_delivery.failed", error);
      setDeliveryMessage(describeQueueDeliveryResult({ sent: 0, skipped: "failed" }));
    } finally {
      sendingRef.current = false;
      setSending(false);
      await refreshUnsentCount();
    }
  };

  const installed = state.installed;
  const installedLabel = installed.versionName
    ? `${installed.versionName}${installed.versionCode ? ` (${installed.versionCode})` : ""}`
    : "текущая";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
    >
      <Ionicons name="cloud-download-outline" size={48} color={colors.primary} style={styles.icon} />
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Требуется обновление</Text>
      <Text style={[styles.body, { color: colors.mutedText }]}>
        {manifest
          ? `Версия ${installedLabel} больше не поддерживается сервером. Установите версию ${manifest.versionName}, чтобы продолжить работу.`
          : `Сервер больше не поддерживает версию ${installedLabel}. Проверьте обновления, когда появится связь с сервером Patrol360.`}
      </Text>
      {manifest?.releaseNotes ? (
        <Text style={[styles.notes, { color: colors.text }]}>{manifest.releaseNotes}</Text>
      ) : null}

      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {manifest ? (
          <AppUpdateControls state={state} />
        ) : null}
        <PrimaryButton
          label="Проверить обновления"
          icon="refresh-outline"
          variant={manifest ? "ghost" : "primary"}
          loading={state.checking}
          onPress={() => { void appUpdateController.checkForUpdates("manual"); }}
        />
        {state.lastCheckError ? <StatusMessage message={state.lastCheckError} tone="warning" /> : null}
      </View>

      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Данные на телефоне</Text>
        <Text style={[styles.body, { color: colors.mutedText }]}>{unsentDataSummary(unsentCount)}</Text>
        <PrimaryButton
          label="Отправить очередь"
          icon="cloud-upload-outline"
          variant="secondary"
          loading={sending}
          disabled={unsentCount === 0}
          onPress={() => { void sendQueue(); }}
        />
        {deliveryMessage ? <StatusMessage message={deliveryMessage} /> : null}
        <Text style={[styles.hint, { color: colors.mutedText }]}>
          Обновление не удаляет данные: отчёты, фото и очередь отправки сохраняются и будут отправлены после установки.
        </Text>
      </View>

      {manifest ? (
        <Text selectable style={[styles.hint, { color: colors.mutedText }]}>
          {`Файл: ${formatMegabytes(manifest.apkSizeBytes)} · SHA-256: ${manifest.sha256}`}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingHorizontal: 20 },
  icon: { alignSelf: "center" },
  title: { fontSize: 24, fontFamily: "Manrope_800ExtraBold", lineHeight: 30, textAlign: "center" },
  body: { fontSize: 16, lineHeight: 22 },
  notes: { fontSize: 15, lineHeight: 21 },
  section: { borderRadius: 16, borderWidth: 1, gap: 12, padding: 16 },
  sectionTitle: { fontSize: 17, fontFamily: "Manrope_800ExtraBold", lineHeight: 22 },
  hint: { fontSize: 13, lineHeight: 18 }
});
