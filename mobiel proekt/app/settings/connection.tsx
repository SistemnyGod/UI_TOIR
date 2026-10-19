import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Text } from "react-native";
import { captureDataOwnerContext, assertDataOwnerContext } from "@/auth/dataOwnerContext";
import { getMobileConnectionContextGeneration } from "@/core/connectionStateEvents";
import { checkServerConnection } from "@/api/serverHealthApi";
import { getServerBaseUrl } from "@/core/serverSettings";
import { useConnectionStatus } from "@/core/connectionStatus";
import { useAppTheme } from "@/features/settings/themePreference";
import { ProfileGroup, ProfileRow } from "@/features/profile/ProfileComponents";
import { connectionLabel } from "@/features/profile/ProfileScreen";
import { useProfileSummary } from "@/features/profile/useProfileSummary";
import { useProfileIdentity } from "@/features/profile/useProfileIdentity";
import { Screen } from "@/ui/Screen";
import { StatusMessage } from "@/ui/StatusMessage";
export default function ConnectionRoute() {
  const router = useRouter(); const { colors } = useAppTheme(); const connection = useConnectionStatus();
  const { summary, summaryError, refresh } = useProfileSummary(); const identity = useProfileIdentity();
  const epoch = useRef(0); const lock = useRef<number | null>(null); const [checking, setChecking] = useState(false); const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  useFocusEffect(useCallback(() => { epoch.current++; setChecking(false); setResult(null); return () => { epoch.current++; lock.current = null; }; }, []));
  async function check() { const run = epoch.current; if (lock.current === run) return; lock.current = run; setChecking(true); setResult(null); const generation = getMobileConnectionContextGeneration();
    try { const scope = await captureDataOwnerContext(); const url = await getServerBaseUrl(); const response = await checkServerConnection(url, { persist: false }); await assertDataOwnerContext(scope); if (epoch.current === run && generation === getMobileConnectionContextGeneration()) setResult(response); }
    catch { if (epoch.current === run && generation === getMobileConnectionContextGeneration()) setResult({ ok: false, message: "Проверка не завершена. Повторите попытку." }); }
    finally { if (epoch.current === run && lock.current === run) { lock.current = null; setChecking(false); refresh(); } }
  }
  const date = (value: string | null) => summaryError ? "Данные недоступны" : value ? new Date(value).toLocaleString("ru-RU") : "Ещё не подтверждено";
  return <Screen title="Связь и отправка" onBack={() => router.back()}>
    <ProfileGroup>
      <ProfileRow icon="radio-outline" title="Сеть" detail={connection === "connected" ? "Сервер доступен" : connection === "authorizationRequired" ? "Для отправки требуется вход" : connection === "otherServer" ? "Проверьте адрес и контур сервера" : "Проверьте подключение к сети и доступность сервера"} trailing={<Text style={{ color: connection === "connected" ? colors.success : colors.danger, fontSize: 14, maxWidth: "40%" }}>{connectionLabel(connection)}</Text>} />
      <ProfileRow icon="link-outline" title="Адрес сервера" detail={identity.server} onPress={() => router.push("/(auth)/server-settings")} />
      <ProfileRow icon="pulse-outline" title={checking ? "Проверяем подключение…" : "Проверить подключение"} disabled={checking} onPress={() => void check()} />
      <ProfileRow icon="person-outline" title="Учётные данные" detail={`Аккаунт ${identity.account}`} detailLines={2} onPress={() => router.push(connection === "authorizationRequired" ? "/(auth)/login" : "/settings/account")} last />
    </ProfileGroup>
    {result ? <StatusMessage message={result.message} tone={result.ok ? "success" : "danger"} /> : null}
    <ProfileGroup>
      <ProfileRow icon="paper-plane-outline" title="Очередь отправки" onPress={() => router.push("/settings/sync-queue" as never)} />
      <ProfileRow icon="document-text-outline" title="Ожидающие действия" trailing={<Text style={{ color: colors.text, fontSize: 16 }}>{summaryError ? "—" : summary.pending}</Text>} />
      <ProfileRow icon="images-outline" title="Файлы" trailing={<Text style={{ color: colors.text, fontSize: 16 }}>{summaryError ? "—" : summary.files}</Text>} />
      <ProfileRow icon="sync-outline" title="Последнее обновление данных" detail={date(summary.dataAt)} />
      <ProfileRow icon="checkmark-circle-outline" title="Последняя подтверждённая команда" detail={date(summary.sentAt)} />
      <ProfileRow icon="information-circle-outline" title="Дополнительные сведения" onPress={() => router.push("/settings")} last />
    </ProfileGroup>
    {summaryError ? <StatusMessage message={summaryError} tone="danger" /> : null}
  </Screen>;
}
