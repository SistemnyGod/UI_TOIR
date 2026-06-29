import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

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
  const autoScanStartedRef = useRef(false);
  const [status, setStatus] = useState<NfcStatus>("idle");
  const [message, setMessage] = useState("Поднесите телефон к NFC-метке.");

  const handleScan = useCallback(async () => {
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
  }, [assignmentId, router]);

  useEffect(() => {
    if (autoScanStartedRef.current) {
      return;
    }

    autoScanStartedRef.current = true;
    void handleScan();
  }, [handleScan]);

  return (
    <Screen title="Сканирование NFC" subtitle={undefined}>
      <Card>
        <View style={styles.scanIcon}>
          <Ionicons color="#1e5bff" name="scan-outline" size={44} />
        </View>
        <Text style={styles.title}>{message}</Text>
        {status === "error" ? (
          <>
          <StatusPill label={statusLabel(status)} tone={statusTone(status)} />
          <Text style={styles.text}>
            Если метка не считалась, поднесите телефон ближе или откройте точку из списка меток.
          </Text>
          </>
        ) : null}
      </Card>

      {status === "reading" ? <ActivityIndicator /> : null}
      {status === "error" ? (
        <PrimaryButton icon="scan-outline" label={scanButtonLabel(status)} onPress={handleScan} />
      ) : null}
      <PrimaryButton icon="list-outline" label="Все метки" onPress={() => router.push(`/patrol/assignment/${assignmentId}/all-points`)} variant="secondary" />
    </Screen>
  );
}

function scanButtonLabel(status: NfcStatus) {
  if (status === "reading") {
    return "Ожидание метки...";
  }

  if (status === "error") {
    return "Повторить сканирование";
  }

  return "Сканировать NFC";
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
    fontSize: 19,
    fontWeight: "800",
    lineHeight: 25,
    textAlign: "center"
  },
  scanIcon: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "#eef4ff",
    borderRadius: 999,
    height: 86,
    justifyContent: "center",
    width: 86
  },
  text: {
    color: "#6b7280",
    fontSize: 15,
    lineHeight: 21
  }
});
