import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Modal, ScrollView, Text, View } from "react-native";
import { signOut } from "@/auth/authService";
import { useConnectionStatus } from "@/core/connectionStatus";
import { useAppTheme } from "@/features/settings/themePreference";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusMessage } from "@/ui/StatusMessage";
import { ProfileGroup, ProfileRow } from "./ProfileComponents";
import { useProfileSummary } from "./useProfileSummary";
import { useProfileIdentity } from "./useProfileIdentity";
import { ThemePicker, themeLabel } from "./ThemePicker";

export const connectionLabel = (value: string) => value === "connected" ? "На связи" : value === "authorizationRequired" ? "Нужен вход" : value === "checking" ? "Проверяем связь" : value === "otherServer" ? "Другой контур" : value === "serverUnavailable" ? "Сервер недоступен" : "Нет сети";
export function ProfileScreen() {
  const router = useRouter(); const { colors, preference } = useAppTheme();
  const connection = useConnectionStatus(); const { summary, summaryError } = useProfileSummary(); const identity = useProfileIdentity();
  const [themeOpen, setThemeOpen] = useState(false); const [logoutOpen, setLogoutOpen] = useState(false); const [busy, setBusy] = useState(false); const lock = useRef(false); const [error, setError] = useState<string | null>(null);
  async function logout() { if (lock.current) return; lock.current = true; setBusy(true); setError(null); try { await signOut(); router.replace("/(auth)/login"); } catch (e) { setError(e instanceof Error ? e.message : "Не удалось выйти. Повторите попытку."); } finally { lock.current = false; setBusy(false); } }
  return <Screen compactHeader title="Профиль" subtitle="Аккаунт, уведомления и настройки">
    <ProfileGroup><ProfileRow title="Учётная запись" detail={identity.account} detailLines={2} last onPress={() => router.push("/settings/account")} leading={<View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.backgroundAccent, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 24, fontWeight: "700", color: colors.primary }}>{identity.account.charAt(0).toUpperCase()}</Text></View>} /></ProfileGroup>
    <ProfileGroup>
      <ProfileRow icon="cloud-upload-outline" title="Связь и отправка" detail={`${connectionLabel(connection)} · ${summaryError ? "очередь недоступна" : `${summary.pending} действий ожидают`}`} onPress={() => router.push("/settings/connection" as never)} />
      <ProfileRow icon="cloud-outline" title="Офлайн-доступ" detail={!summaryError && summary.snapshotReady ? "Готовность подтверждена" : "Готовность не подтверждена"} onPress={() => router.push("/settings/offline" as never)} />
      <ProfileRow icon="notifications-outline" title="Уведомления" detail={identity.unread === null ? "Данные недоступны" : `${identity.unread} непрочитанных`} onPress={() => router.push("/settings/notifications" as never)} />
      <ProfileRow icon="color-palette-outline" title="Оформление" detail={themeLabel(preference)} onPress={() => setThemeOpen(true)} />
      <ProfileRow icon="settings-outline" title="Дополнительно" onPress={() => router.push("/settings")} last />
    </ProfileGroup>
    <ProfileGroup><ProfileRow icon="log-out-outline" title="Выйти" danger last trailing={<View />} onPress={() => { setError(null); setLogoutOpen(true); }} /></ProfileGroup>
    <ThemePicker visible={themeOpen} onClose={() => setThemeOpen(false)} />
    <Modal transparent visible={logoutOpen} animationType="none" onRequestClose={() => { if (!lock.current) setLogoutOpen(false); }}><View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: colors.scrim }}><View accessibilityViewIsModal style={{ maxHeight: "90%", borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 18 }}><ScrollView contentContainerStyle={{ gap: 16 }}>
      <Ionicons name="alert-circle" size={42} color={colors.warning} style={{ alignSelf: "center" }} />
      <Text accessibilityRole="header" style={{ fontSize: 22, fontWeight: "700", textAlign: "center", color: colors.text }}>Выйти из аккаунта?</Text>
      <Text style={{ fontSize: 16, lineHeight: 24, textAlign: "center", color: colors.mutedText }}>{summary.pending || summary.files ? "Есть неотправленные данные. Для безопасного выхода сначала дождитесь отправки. Приложение дополнительно проверит незавершённые записи." : "Перед выходом проверим, что на телефоне не осталось неотправленных данных. Для следующего входа потребуется авторизация."}</Text>
      {error ? <StatusMessage message={error} tone="danger" /> : null}
      <PrimaryButton label="Остаться" disabled={busy} onPress={() => setLogoutOpen(false)} />
      {error ? <PrimaryButton label="Открыть очередь" variant="secondary" disabled={busy} onPress={() => { setLogoutOpen(false); router.push("/settings/sync-queue" as never); }} /> : null}
      <PrimaryButton label="Выйти" loading={busy} variant="secondary" onPress={() => void logout()} />
    </ScrollView></View></View></Modal>
  </Screen>;
}

