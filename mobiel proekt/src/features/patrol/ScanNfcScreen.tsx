import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { currentContourId } from "@/core/environments";
import {
  AssignmentProgress,
  getAssignmentById,
  listAssignmentPoints,
  PointListItem,
  scanPointByNfc
} from "@/db/repositories/patrolRepository";
import { cancelNfcRead, getNfcCodes, initializeNfc, readNfcTag } from "@/services/nfcService";
import { Card } from "@/ui/Card";
import { useAppTheme } from "@/features/settings/themePreference";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";
import { requestPatrolSync } from "@/sync/PatrolSyncCoordinator";

type NfcStatus = "idle" | "reading" | "matched" | "unmatched" | "unsupported" | "disabled" | "blocked" | "routeUnavailable" | "error";

export function ScanNfcScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>();
  const scanInProgressRef = useRef(false);
  const screenActiveRef = useRef(false);
  const [status, setStatus] = useState<NfcStatus>("idle");
  const [routeName, setRouteName] = useState<string | null>(null);
  const [progress, setProgress] = useState<AssignmentProgress | null>(null);
  const [nextPoint, setNextPoint] = useState<PointListItem | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [message, setMessage] = useState("Поднесите телефон к NFC-метке.");

  const loadRouteProgress = useCallback(async () => {
    const ownerUserId = await getStoredOwnerUserId();
    const [assignment, points] = await Promise.all([
      getAssignmentById(assignmentId),
      ownerUserId ? listAssignmentPoints(assignmentId, ownerUserId, currentContourId) : Promise.resolve([])
    ]);

    if (!screenActiveRef.current) {
      return;
    }

    const loadedProgress = buildProgress(points);
    setRouteName(assignment?.routeName ?? null);
    setProgress(loadedProgress);
    setNextPoint(points.find((point) => !["ok", "issue", "skipped"].includes(point.status)) ?? null);
    if (loadedProgress.total === 0) {
      setStatus("routeUnavailable");
      setMessage("Метки маршрута ещё не загружены. Обновите маршрут перед сканированием.");
    } else {
      setStatus((current) => current === "routeUnavailable" ? "idle" : current);
      setMessage((current) => current === "Метки маршрута ещё не загружены. Обновите маршрут перед сканированием."
        ? "Поднесите телефон к NFC-метке."
        : current);
    }
    setProgressError(null);
  }, [assignmentId]);

  const handleScan = useCallback(async () => {
    if (!screenActiveRef.current || scanInProgressRef.current) {
      return;
    }

    scanInProgressRef.current = true;
    setStatus("reading");
    setMessage("Ожидание NFC-метки...");
    try {
      const nfc = await initializeNfc();
      if (!screenActiveRef.current) {
        return;
      }
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
      if (!screenActiveRef.current) {
        return;
      }
      const nfcCodes = getNfcCodes(tag);
      if (nfcCodes.length === 0) {
        setStatus("error");
        setMessage("Не удалось прочитать код NFC-метки.");
        return;
      }

      const result = await scanPointByNfc(assignmentId, nfcCodes);
      if (!screenActiveRef.current) {
        return;
      }
      if (!result.matched) {
        setStatus("unmatched");
        setMessage("Метка не относится к выбранному маршруту.");
        return;
      }

      setStatus("matched");
      setMessage("NFC подтвержден.");
      router.replace(`/patrol/assignment/${assignmentId}/point/${result.point.pointId}/fill`);
    } catch (error) {
      if (!screenActiveRef.current) {
        return;
      }
      const errorMessage = error instanceof Error ? error.message : "NFC недоступен или чтение отменено.";
      if (isLifecycleScanBlock(errorMessage)) {
        setStatus("blocked");
        setMessage("Запуск обхода восстанавливается. Повторите сканирование через несколько секунд.");
        void requestPatrolSync({ mode: "normal" });
      } else {
        setStatus("error");
        setMessage(errorMessage);
      }
    } finally {
      scanInProgressRef.current = false;
    }
  }, [assignmentId, router]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      screenActiveRef.current = true;
      void loadRouteProgress().catch(() => {
        if (isMounted) {
          setProgressError("Прогресс маршрута временно недоступен. Данные на телефоне сохранены.");
        }
      });
      return () => {
        isMounted = false;
        screenActiveRef.current = false;
        void cancelNfcRead();
      };
    }, [loadRouteProgress])
  );


  return (
    <Screen title="Сканирование NFC" subtitle={undefined}>
      {routeName ? <Text style={[styles.routeName, { color: colors.text }]}>{routeName}</Text> : null}
      {progressError ? <StatusPill label="Прогресс маршрута временно недоступен" tone="warning" /> : null}
      {progress && progress.total > 0 ? (
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
      ) : progress ? (
        <Card>
          <Text style={[styles.progressLabel, { color: colors.text }]}>Загружаем метки маршрута</Text>
          <Text style={[styles.text, { color: colors.mutedText }]}>Прогресс появится после получения списка меток.</Text>
        </Card>
      ) : null}
      <Card>
        <View style={styles.scanIcon}>
          <Ionicons color="#1e5bff" name="scan-outline" size={44} />
        </View>
        <Text style={styles.title}>{message}</Text>
        {status === "error" || status === "unmatched" || status === "unsupported" || status === "disabled" || status === "blocked" || status === "routeUnavailable" ? (
          <>
          <StatusPill label={statusLabel(status)} tone={statusTone(status)} />
          <Text style={styles.text}>
            {status === "blocked"
              ? "Данные обхода сохранены. Приложение восстанавливает запуск автоматически."
              : status === "routeUnavailable"
                ? "Сканирование будет доступно после загрузки точек маршрута."
                : "Если метка не считалась, поднесите телефон ближе или откройте точку из списка меток."}
          </Text>
          </>
        ) : null}
      </Card>

      {status === "reading" ? <ActivityIndicator /> : null}
      {status === "routeUnavailable" ? (
        <PrimaryButton icon="refresh-outline" label="Обновить маршрут" onPress={() => void loadRouteProgress()} />
      ) : status !== "reading" && status !== "matched" && status !== "unsupported" ? (
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

  if (status === "error" || status === "unmatched") {
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
    case "blocked":
      return "Запуск обхода восстанавливается";
    case "routeUnavailable":
      return "Маршрут ещё не загружен";
    case "unmatched":
      return "\u041c\u0435\u0442\u043a\u0430 \u0434\u0440\u0443\u0433\u043e\u0433\u043e \u043e\u0431\u0445\u043e\u0434\u0430";
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

  if (status === "blocked") {
    return "warning";
  }

  if (status === "error" || status === "unmatched" || status === "unsupported" || status === "disabled") {
    return "danger";
  }

  return "neutral";
}


function isLifecycleScanBlock(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("действие заблокировано текущим статусом назначения")
    || normalized.includes("действие недоступно для текущего статуса назначения")
    || normalized.includes("point action is unavailable after patrol completion");
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
