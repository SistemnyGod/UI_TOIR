import { CameraView } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { scanPointByQr } from "@/db/repositories/patrolRepository";
import { ensureCameraPermission } from "@/services/cameraService";
import { createQrScanResult } from "@/services/qrScannerService";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";

export function ScanQrScreen() {
  const router = useRouter();
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>();
  const [status, setStatus] = useState<"idle" | "reading" | "matched" | "error">("reading");
  const [hasPermission, setHasPermission] = useState(false);
  const [message, setMessage] = useState("Наведите камеру на QR-метку точки.");
  const isHandlingScanRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    void ensureCameraPermission().then((granted) => {
      if (!isMounted) {
        return;
      }

      setHasPermission(granted);
      setStatus(granted ? "reading" : "error");
      setMessage(granted ? "Ожидание QR-метки..." : "Нет доступа к камере.");
    });

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleBarcode(data: string) {
    if (status !== "reading" || isHandlingScanRef.current) {
      return;
    }

    isHandlingScanRef.current = true;
    setStatus("idle");

    try {
      const qr = createQrScanResult(data);
      const result = await scanPointByQr(assignmentId, qr.qrCodeHash);

      if (!result.matched) {
        setStatus("error");
        setMessage("QR-метка не соответствует этому обходу.");
        return;
      }

      setStatus("matched");
      setMessage("QR подтвержден.");
      router.replace(`/patrol/assignment/${assignmentId}/point/${result.point.pointId}/fill`);
    } catch {
      setStatus("error");
      setMessage("Не удалось обработать QR-метку. Проверьте подключение и попробуйте снова.");
    } finally {
      isHandlingScanRef.current = false;
    }
  }

  async function retryScan() {
    const granted = hasPermission || (await ensureCameraPermission());
    setHasPermission(granted);
    setStatus(granted ? "reading" : "error");
    setMessage(granted ? "Ожидание QR-метки..." : "Нет доступа к камере.");
  }

  return (
    <Screen title="Сканирование QR" subtitle="Резервное подтверждение точки, если NFC недоступен.">
      <Card>
        <StatusPill label={statusLabel(status)} tone={statusTone(status)} />
        <Text style={styles.title}>{message}</Text>
        <Text style={styles.text}>QR засчитывается только если метка относится к активному маршруту.</Text>
      </Card>

      <View style={styles.cameraBox}>
        {hasPermission ? (
          <CameraView
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            facing="back"
            onBarcodeScanned={status === "reading" ? (event) => void handleBarcode(event.data) : undefined}
            style={styles.camera}
          />
        ) : (
          <View style={styles.permissionBox}>
            <Text style={styles.permissionText}>Разрешите доступ к камере для сканирования QR.</Text>
          </View>
        )}
      </View>

      {status === "reading" ? <ActivityIndicator /> : null}
      {status === "error" ? (
        <PrimaryButton
          icon="qr-code-outline"
          label="Сканировать снова"
          onPress={() => void retryScan()}
        />
      ) : null}
      <PrimaryButton icon="list-outline" label="Все метки" onPress={() => router.push(`/patrol/assignment/${assignmentId}/all-points`)} variant="secondary" />
    </Screen>
  );
}

function statusLabel(status: "idle" | "reading" | "matched" | "error") {
  switch (status) {
    case "reading":
      return "Ожидание";
    case "matched":
      return "QR подтвержден";
    case "error":
      return "Ошибка QR";
    default:
      return "Готово";
  }
}

function statusTone(status: "idle" | "reading" | "matched" | "error") {
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
  },
  cameraBox: {
    aspectRatio: 3 / 4,
    backgroundColor: "#0f1a2b",
    borderRadius: 8,
    overflow: "hidden"
  },
  camera: {
    flex: 1
  },
  permissionBox: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 16
  },
  permissionText: {
    color: "#f5f7fa",
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center"
  }
});
