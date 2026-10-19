import { Text, View } from "react-native";
import { Card } from "@/ui/Card";
import { usePointStyles } from "./pointFillStyles";

export function PointGuidanceCard({
  description,
  instruction,
  mutedColor,
  textColor,
}: {
  description?: string | null;
  instruction?: string | null;
  mutedColor: string;
  textColor: string;
}) {
  const styles = usePointStyles();
  if (!description?.trim() && !instruction?.trim()) {
    return null;
  }

  return (
    <Card>
      {description?.trim() ? (
        <View style={styles.guidanceBlock}>
          <Text style={[styles.label, { color: textColor }]}>Описание оборудования</Text>
          <Text style={[styles.text, { color: mutedColor }]}>{description.trim()}</Text>
        </View>
      ) : null}
      {instruction?.trim() ? (
        <View style={styles.guidanceBlock}>
          <Text style={[styles.label, { color: textColor }]}>Инструкция к метке</Text>
          <Text style={[styles.text, { color: mutedColor }]}>{instruction.trim()}</Text>
        </View>
      ) : null}
    </Card>
  );
}
