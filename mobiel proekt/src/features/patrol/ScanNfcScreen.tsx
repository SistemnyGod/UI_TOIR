import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import {
  AssignmentProgress,
  getAssignmentById,
  listAssignmentPoints,
  PointListItem,
  scanPointByNfc
} from "@/db/repositories/patrolRepository";
import { cancelNfcRead, getNfcCode, initializeNfc, readNfcTag } from "@/services/nfcService";
import { Card } from "@/ui/Card";
import { useAppTheme } from "@/features/settings/themePreference";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";

type NfcStatus = "idle" | "reading" | "matched" | "unsupported" | "disabled" | "error";

export function ScanNfcScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>();
  const autoScanStartedRef = useRef(false);
  const [status, setStatus] = useState<NfcStatus>("idle");
  const [routeName, setRouteName] = useState<string | null>(null);
  const [progress, setProgress] = useState<AssignmentProgress | null>(null);
  const [nextPoint, setNextPoint] = useState<PointListItem | null>(null);

  const loadRouteProgress = useCallback(async () => {
    const [assignment, points] = await Promise.all([
      getAssignmentById(assignmentId),
      listAssignmentPoints(assignmentId)
    ]);

    setRouteName(assignment?.routeName ?? null);
    setProgress(buildProgress(points));
    setNextPoint(points.find((point) => !["ok", "issue", "skipped"].includes(point.status)) ?? null);
  }, [assignmentId]);
  const [message, setMessage] = useState("Поднесите телефон к NFC-метке.");

  const handleScan = useCallback(async () => {
    setStatus("reading");
    setMessage("Ожидание NFC-метки...");
    try {
      const nfc = await initializeNfc();
      if (!nfc.supported) {
        setStatus("unsupported");
        setMessage("Телефон не поддерживает NFC.");
        return;
      }

      if (!nfc.enabled) {
        setStatus("disabled");
        setMessage("Включите NFC в настройках телефона.");
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

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      void loadRouteProgress().catch(() => {
        if (isMounted) {
          setProgress(null);
          setNextPoint(null);
        }
      });
      return () => {
        isMounted = false;
      };
    }, [loadRouteProgress])
  );

  useEffect(() => {
    if (autoScanStartedRef.current) {
      return;
    }

    autoScanStartedRef.current = true;
    void handleScan();

    return () => {
      void cancelNfcRead();
    };
  }, [handleScan]);

  return (
    <Screen title="Сканирование NFC" subtitle={undefined}>
      {routeName ? <Text style={[styles.routeName, { color: colors.text }]}>{routeName}</Text> : null}
      {progress ? (
        <Card>
          <View style={styles.progressHeader}>
            <Text style={[styles.progressLabel, { color: colors.text }]}>Прогресс маршрута</Text>
            <Text style={[styles.progressLabel, { color: colors.text }]}>{progress.completed} из {progress.total}</Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <View style={[styles.progressFill, { width: `${progressPercent(progress)}%` }]} />
          </View>
          <Text style={[styles.progressPercent, { color: colors.mutedText }]}>{progressPercent(progress)}%</Text>
          <View style={[styles.nextPointBox, { backgroundColor: colors.backgroundAccent, borderColor: colors.border }]}>
            <Text style={[styles.nextPointLabel, { color: colors.primary }]}>СЛЕДУЮЩАЯ МЕТКА</Text>
            <Text style={[styles.nextPointName, { color: colors.text }]}>
              {nextPoint ? `${nextPoint.orderIndex}. ${nextPoint.name}` : "Все метки обработаны"}
            </Text>
          </View>
        </Card>
      ) : null}
      <Card>
        <View style={styles.scanIcon}>
          <Ionicons color="#1e5bff" name="scan-outline" size={44} />
        </View>
        <Text style={styles.title}>{message}</Text>
        {status === "error" || status === "unsupported" || status === "disabled" ? (
          <>
          <StatusPill label={statusLabel(status)} tone={statusTone(status)} />
          <Text style={styles.text}>
            Если метка не считалась, поднесите телефон ближе или откройте точку из списка меток.
          </Text>
          </>
        ) : null}
      </Card>

      {status === "reading" ? <ActivityIndicator /> : null}
      {status === "error" || status === "disabled" ? (
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
    case "unsupported":
      return "NFC не поддерживается";
    case "disabled":
      return "NFC выключен";
    default:
      return "Готово";
  }
}

function statusTone(status: NfcStatus) {
  if (status === "matched") {
    return "success";
  }

  if (status === "error" || status === "unsupported" || status === "disabled") {
    return "danger";
  }

  return "neutral";
}

const styles = StyleSheet.create({
  routeName: {
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 24
  },
  progressHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  progressLabel: {
    fontSize: 15,
    fontWeight: "900"
  },
  progressTrack: {
    borderRadius: 999,
    height: 10,
    overflow: "hidden"
  },
  progressFill: {
    backgroundColor: "#1e5bff",
    borderRadius: 999,
    height: "100%"
  },
  progressPercent: {
    fontSize: 13,
    fontWeight: "800"
  },
  nextPointBox: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
    padding: 12
  },
  nextPointLabel: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6
  },
  nextPointName: {
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 22
  },
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

function progressPercent(progress: AssignmentProgress) {
  if (progress.total === 0) {
    return 0;
  }

  return Math.min(100, Math.round((progress.completed / progress.total) * 100));
}

function buildProgress(points: PointListItem[]): AssignmentProgress {
  return {
    total: points.length,
    completed: points.filter((point) => ["ok", "issue", "skipped"].includes(point.status)).length,
    deferred: points.filter((point) => point.status === "deferred").length,
    issues: points.filter((point) => point.status === "issue").length,
    skipped: points.filter((point) => point.status === "skipped").length
  };
}
