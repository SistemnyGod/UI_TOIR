import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text } from "react-native";

import { scanPointByNfc } from "@/db/repositories/patrolRepository";
import { getNfcCode, initializeNfc, readNfcTag } from "@/services/nfcService";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";

type NfcStatus = "idle" | "reading" | "matched" | "error";

export function ScanNfcScreen() {
  const router = useRouter();
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>();
  const [status, setStatus] = useState<NfcStatus>("idle");
  const [message, setMessage] = useState("Поднесите телефон к NFC-метке.");

  async function handleScan() {
    setStatus("reading");
    setMessage("Ожидание NFC-метки...");
    try {
      const nfc = await initializeNfc();
      if (!nfc.supported) {
        setStatus("error");
        setMessage("Телефон не поддерживает NFC.");
        return;
      }

      const tag = await readNfcTag();
      const nfcCode = getNfcCode(tag);
      if (!nfcCode) {
        setStatus("error");
        setMessage("Не удалось прочитать код NFC-метки.");
        return;
      }

      const result = await scanPointByNfc(assignmentId, nfcCode);
      if (!result.matched) {
        setStatus("error");
        setMessage(`Метка не соответствует этому обходу. Прочитан код: ${result.scannedCode ?? nfcCode}`);
        return;
      }

      setStatus("matched");
      setMessage("NFC подтвержден.");
      router.replace(`/patrol/assignment/${assignmentId}/point/${result.point.pointId}/fill`);
    } catch {
      setStatus("error");
      setMessage("NFC недоступен или чтение отменено.");
    }
  }

  return (
    <Screen title="Сканирование NFC" subtitle="Подтвердите точку маршрута реальной NFC-меткой.">
      <Card>
        <StatusPill label={statusLabel(status)} tone={statusTone(status)} />
        <Text style={styles.title}>{message}</Text>
        <Text style={styles.text}>
          Метки в базе записаны как коды вида NFC-001. Приложение сначала читает текст метки, а если его нет, использует
          физический UID как резерв.
        </Text>
      </Card>

      {status === "reading" ? <ActivityIndicator /> : null}
      <PrimaryButton disabled={status === "reading"} label="Приложить NFC" onPress={handleScan} />
      <PrimaryButton label="Все метки" onPress={() => router.push(`/patrol/assignment/${assignmentId}/all-points`)} />
    </Screen>
  );
}

function statusLabel(status: NfcStatus) {
  switch (status) {
    case "reading":
      return "Ожидание";
    case "matched":
      return "NFC подтвержден";
    case "error":
      return "Ошибка NFC";
    default:
      return "Готово";
  }
}

function statusTone(status: NfcStatus) {
  if (status === "matched") {
    return "success";
  }

  if (status === "error") {
    return "danger";
  }

  return "neutral";
}

const styles = StyleSheet.create({
  title: {
    color: "#0f1a2b",
    fontSize: 20,
    fontWeight: "600"
  },
  text: {
    color: "#6b7280",
    fontSize: 15,
    lineHeight: 21
  }
});
