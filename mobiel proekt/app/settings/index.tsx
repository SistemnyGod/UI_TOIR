import { useRouter } from "expo-router";
import { getDeviceDisplayName } from "@/auth/deviceInfo";
import { ProfileGroup, ProfileRow } from "@/features/profile/ProfileComponents";
import { Screen } from "@/ui/Screen";
export default function SettingsRoute() { const router = useRouter(); return <Screen title="Дополнительно" onBack={() => router.back()}><ProfileGroup>
  <ProfileRow icon="phone-portrait-outline" title="Устройство" detail={getDeviceDisplayName()} />
  <ProfileRow icon="cloud-upload-outline" title="Связь и отправка" onPress={() => router.push("/settings/connection" as never)} />
  <ProfileRow icon="cloud-outline" title="Офлайн-доступ" onPress={() => router.push("/settings/offline" as never)} />
  <ProfileRow icon="list-outline" title="Очередь синхронизации" onPress={() => router.push("/settings/sync-queue" as never)} />
  <ProfileRow icon="cloud-download-outline" title="Обновление приложения" detail="Проверить обновления" onPress={() => router.push("/settings/app-update" as never)} />
  <ProfileRow icon="bug-outline" title="Ошибки и логи" detail="Диагностика для поддержки" onPress={() => router.push("/settings/diagnostics" as never)} last />
</ProfileGroup></Screen>; }
