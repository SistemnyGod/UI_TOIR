import { CameraView } from "expo-camera";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from '@expo/vector-icons';

import { scanPointByQr, listAssignmentPoints, getAssignmentById, pauseAssignmentLocally, PointListItem } from "@/db/repositories/patrolRepository";
import { assertDataOwnerContext, captureDataOwnerContext } from "@/auth/dataOwnerContext";
import { ensureCameraPermission } from "@/services/cameraService";
import { createQrScanResult } from "@/services/qrScannerService";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { useAppTheme } from "@/features/settings/themePreference";
import { ActionSheet } from '@/ui/ActionSheet';
import { buildPatrolActionMenu } from './patrolActionMenu';
import { ScanActionBar } from './ScanActionBar';
import { ScanMessage, ScanProgress } from './ScanPresentation';

export function ScanQrScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>();
  const [status, setStatus] = useState<"idle" | "reading" | "matched" | "error">("reading");
  const [hasPermission, setHasPermission] = useState(false);
  const [message, setMessage] = useState("Наведите камеру на QR-метку точки.");
  const [points, setPoints] = useState<PointListItem[]>([]);
  const [assignmentStatus, setAssignmentStatus] = useState<string | null>(null);
  const [routeName, setRouteName] = useState<string | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(false);
  const isHandlingScanRef = useRef(false);
  const focusEpochRef = useRef(0);
  const focused = useRef(false);

  useFocusEffect(
    useCallback(() => {
      const epoch = ++focusEpochRef.current;
      focused.current = true;
      setCameraVisible(true);
      isHandlingScanRef.current = false;
      setStatus("reading");
      void (async () => {
        const scope = await captureDataOwnerContext();
        const [rows, assignment] = await Promise.all([listAssignmentPoints(assignmentId, scope.ownerUserId, scope.contourId), getAssignmentById(assignmentId)]);
        await assertDataOwnerContext(scope);
        if (epoch !== focusEpochRef.current) return;
        setPoints(rows);
        setAssignmentStatus(assignment?.status ?? null);
        setRouteName(assignment?.routeName ?? null);
      })().catch(() => { if (epoch === focusEpochRef.current) { setPoints([]); setAssignmentStatus(null); } });
      return () => {
        focused.current = false;
        setCameraVisible(false);
        if (focusEpochRef.current === epoch) focusEpochRef.current++;
      };
    }, [assignmentId])
  );

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
    if (!focused.current || status !== "reading" || isHandlingScanRef.current) {
      return;
    }

    isHandlingScanRef.current = true;
    setStatus("idle");
    const epoch = focusEpochRef.current;

    try {
      const scope = await captureDataOwnerContext();
      const qr = createQrScanResult(data);
      const result = await scanPointByQr(assignmentId, qr.qrCodeHash);
      await assertDataOwnerContext(scope);
      if (epoch !== focusEpochRef.current) {
        throw new Error("Сканирование устарело после смены маршрута.");
      }

      if (!result.matched) {
        setStatus("error");
        setMessage("QR-метка не соответствует этому обходу.");
        return;
      }

      setStatus("matched");
      setMessage("QR подтвержден.");
      await assertDataOwnerContext(scope);
      if (epoch !== focusEpochRef.current) return;
      router.replace(`/patrol/assignment/${assignmentId}/point/${result.point.pointId}/fill`);
    } catch (error) {
      if (epoch !== focusEpochRef.current) return;
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Не удалось обработать QR-метку. Проверьте подключение и попробуйте снова.");
    } finally {
      if (epoch === focusEpochRef.current) isHandlingScanRef.current = false;
    }
  }

  async function retryScan() {
    const epoch = focusEpochRef.current;
    const granted = hasPermission || (await ensureCameraPermission());
    if (!focused.current || epoch !== focusEpochRef.current) return;
    setHasPermission(granted);
    setStatus(granted ? "reading" : "error");
    setMessage(granted ? "Ожидание QR-метки..." : "Нет доступа к камере.");
  }

  const pausePatrol = useCallback(async () => {
    const epoch = focusEpochRef.current;
    const isCurrent = () => focused.current && epoch === focusEpochRef.current;
    try {
      const scope = await captureDataOwnerContext();
      if (!isCurrent()) return;
      await pauseAssignmentLocally(assignmentId);
      await assertDataOwnerContext(scope);
      if (isCurrent()) router.replace(`/patrol/assignment/${assignmentId}` as never);
    } catch (error) {
      if (!isCurrent()) return;
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Не удалось приостановить обход.');
    }
  }, [assignmentId, router]);

  const completed = points.filter(point => ["ok", "issue", "skipped"].includes(point.status)).length;
  const nextPoint = points.find(point => !["ok", "issue", "skipped"].includes(point.status));

  return (
    <Screen compactHeader plainBackground title='' bottomActionBackground='transparent' bottomAction={<ScanActionBar
      onPoints={() => router.push(`/patrol/assignment/${assignmentId}/all-points` as never)}
      onManual={nextPoint && assignmentStatus === 'inProgress' ? () => router.push(`/patrol/assignment/${assignmentId}/point/${nextPoint.pointId}/fill?manual=1` as never) : undefined}
      onMore={() => setActionsOpen(true)} />}>
      <ScanProgress routeName={routeName || 'Сканирование QR'} completed={completed} total={points.length} nextPoint={nextPoint} />
      <ScanMessage message={status === 'idle' ? 'Проверяем QR-метку…' : message}
        icon={status === 'error' ? 'warning-outline' : status === 'matched' ? 'checkmark-circle-outline' : 'qr-code-outline'}
        tone={status === 'error' ? 'error' : status === 'matched' ? 'success' : 'neutral'} busy={status === 'idle'} />

      <View style={[styles.cameraBox, { backgroundColor: colors.backgroundAccent }]}>
        {hasPermission && cameraVisible ? (
          <CameraView
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            facing="back"
            onBarcodeScanned={status === "reading" ? (event) => void handleBarcode(event.data) : undefined}
            style={styles.camera}
          />
        ) : (
          <View style={styles.permissionBox}>
            <Ionicons name="camera-outline" size={48} color={colors.primary} />
          </View>
        )}
      </View>

      {status === "error" ? (
        <PrimaryButton
          icon="qr-code-outline"
          label={hasPermission ? 'Сканировать снова' : 'Разрешить камеру'}
          onPress={() => void retryScan()}
        />
      ) : null}
      <ActionSheet title="Действия с обходом" visible={actionsOpen} onClose={() => setActionsOpen(false)}
        actions={[
          ...(assignmentStatus === 'inProgress' ? [{ label: 'Приостановить', icon: 'pause-outline' as const, onPress: pausePatrol }] : []),
          ...buildPatrolActionMenu({
          assignmentId,
          status: assignmentStatus ?? 'unknown',
          onSwitch: () => router.push(`/patrol/assignment/${assignmentId}/switch` as never),
          onSubmit: () => router.push(`/patrol/assignment/${assignmentId}/submit` as never),
          onAppeal: () => router.push(`/patrol/assignment/${assignmentId}/appeal` as never),
          onCancel: () => router.push(`/patrol/assignment/${assignmentId}/appeal?kind=cancel` as never)
        })]} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  cameraBox: {
    height: 240,
    borderRadius: 16,
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
  }
});
