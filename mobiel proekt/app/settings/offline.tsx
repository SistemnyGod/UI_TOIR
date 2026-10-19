import { useRouter } from "expo-router";
import { ProfileGroup, ProfileRow } from "@/features/profile/ProfileComponents";
import { useProfileSummary } from "@/features/profile/useProfileSummary";
import { Screen } from "@/ui/Screen";
import { StatusMessage } from "@/ui/StatusMessage";
import { PrimaryButton } from "@/ui/PrimaryButton";
export default function OfflineRoute() { const router = useRouter(); const { summary, summaryError, refresh } = useProfileSummary(); return <Screen title="Офлайн-доступ" onBack={() => router.back()}>
  <StatusMessage tone={summary.snapshotReady && !summaryError ? "success" : "neutral"} message={summary.snapshotReady && !summaryError ? "Готовность подтверждена" : "Готовность не подтверждена"} />
  <ProfileGroup><ProfileRow icon="map-outline" title="Текущий маршрут" detail={summaryError ?? summary.readinessReason} /><ProfileRow icon="location-outline" title="Сохранённые точки" detail={summaryError ? "Данные недоступны" : String(summary.points)} /><ProfileRow icon="people-outline" title="Справочники" detail={summaryError ? "Данные недоступны" : `Сотрудников: ${summary.employees} · Участков: ${summary.sections}`} last /></ProfileGroup>
  <PrimaryButton label="Повторить проверку" variant="secondary" onPress={refresh} />
</Screen>; }
