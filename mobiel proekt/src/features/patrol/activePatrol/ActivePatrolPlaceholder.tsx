import { StyleSheet, Text } from "react-native";

import { useAppTheme } from "@/features/settings/themePreference";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";

type Props =
  | { kind: "loading" }
  | { kind: "error"; message: string; onRetry: () => void }
  | { kind: "notFound"; onBack: () => void };

/** The screen shown before a patrol is on screen: loading, a failed first read, or no patrol. */
export function ActivePatrolPlaceholder(props: Props) {
  const { colors } = useAppTheme();
  return (
    <Screen title="Обход" subtitle="Маршрут, прогресс и безопасные действия.">
      {props.kind === "loading" ? (
        <Card><Text style={[styles.text, { color: colors.mutedText }]}>Загрузка...</Text></Card>
      ) : props.kind === "error" ? (
        <Card>
          <Text style={[styles.text, { color: colors.danger }]}>{props.message}</Text>
          <PrimaryButton icon="refresh-outline" label="Повторить загрузку" onPress={props.onRetry} variant="secondary" />
        </Card>
      ) : (
        <>
          <Card>
            <Text style={[styles.text, { color: colors.mutedText }]}>Обход не найден на телефоне.</Text>
          </Card>
          <PrimaryButton icon="arrow-back-outline" label="Назад к заявкам" onPress={props.onBack} variant="secondary" />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 15,
    lineHeight: 21
  }
});
