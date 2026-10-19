import { StyleSheet, Text } from "react-native";

import type { ActivePatrolView } from "@/features/patrol/activePatrol/activePatrolPresentation";
import { useAppTheme } from "@/features/settings/themePreference";
import { Card } from "@/ui/Card";

/** Explains a blocked, locally completed or server-accepted patrol. */
export function ActivePatrolStatusBanners({ view }: { view: ActivePatrolView }) {
  const { colors } = useAppTheme();
  return (
    <>
      {view.isBlocked ? (
        <Card style={styles.stateCard}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Нужна проверка</Text>
          <Text style={[styles.text, { color: colors.mutedText }]}>Локальные данные сохранены. Откройте очередь синхронизации или дождитесь решения диспетчера.</Text>
        </Card>
      ) : null}

      {view.isCompletedLocal ? (
        <Card style={styles.stateCard}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Отчет сохранен на телефоне</Text>
          <Text style={[styles.text, { color: colors.mutedText }]}>Отчёт сохранён и уйдёт на сервер сам, как только появится связь — даже если приложение закрыто.</Text>
        </Card>
      ) : null}

      {view.isCompletedServer ? (
        <Card>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Отчет принят сервером</Text>
          <Text style={[styles.text, { color: colors.mutedText }]}>Можно выбрать новую заявку.</Text>
        </Card>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 15,
    lineHeight: 21
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Manrope_800ExtraBold"
  },
  stateCard: {
    gap: 8
  }
});
