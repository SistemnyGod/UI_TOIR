import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { currentContourId } from "@/core/environments";
import { listPointFiles } from "@/db/repositories/filesRepository";
import { deferPoint, getPointForFill, getReportReadiness, PointForFill, savePointDraft, savePointIssue, savePointOk, skipPoint } from "@/db/repositories/patrolRepository";
import { isPhotoEvidenceRequired } from "@/domain/patrol/photoEvidencePolicy";
import { restoreDeferredPointSelection } from "@/domain/patrol/pointDraftPolicy";
import { useAppTheme } from "@/features/settings/themePreference";
import { logMobileError } from "@/services/mobileErrorReporter";
import {
  attachPointPhotoFromCamera,
  attachPointMediaFromGallery,
  attachPointVideoFromCamera,
} from "@/services/mediaAttachmentService";
import { ActionSheet } from "@/ui/ActionSheet";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";
import type { MediaPreparationProgress } from "@/sync/fileUploadQueue";
import type { FillPhase, PointAttachment, SelectedStatus } from "./pointFillTypes";

export function PointFillScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { assignmentId, pointId } = useLocalSearchParams<{ assignmentId: string; pointId: string }>();
  const [point, setPoint] = useState<PointForFill | null>(null);
  const [phase, setPhase] = useState<FillPhase>("status");
  const [selectedStatus, setSelectedStatus] = useState<SelectedStatus | null>(null);
  const [comment, setComment] = useState("");
  const [issueTypeId, setIssueTypeId] = useState("Р СњР ВµР С‘РЎРѓР С—РЎР‚Р В°Р Р†Р Р…Р С•РЎРѓРЎвЂљРЎРЉ");
  const [attachments, setAttachments] = useState<PointAttachment[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMediaBusy, setIsMediaBusy] = useState(false);
  const [mediaProgress, setMediaProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<"attachments" | "more" | null>(null);
  const draftReadyRef = useRef(false);
  const finalizingRef = useRef(false);
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftSaveChainRef = useRef<Promise<void>>(Promise.resolve());
  const handleMediaProgress = useCallback(({ progress }: MediaPreparationProgress) => {
    setMediaProgress(progress);
  }, []);

  const latestDraftRef = useRef({
    selectedStatus: null as SelectedStatus | null,
    comment: "",
    issueTypeId: "Р СњР ВµР С‘РЎРѓР С—РЎР‚Р В°Р Р†Р Р…Р С•РЎРѓРЎвЂљРЎРЉ",
    photoClientFileIds: [] as string[]
  });

  useEffect(() => {
    latestDraftRef.current = {
      selectedStatus,
      comment,
      issueTypeId,
      photoClientFileIds: attachments.map((attachment) => attachment.clientFileId)
    };
  }, [attachments, comment, issueTypeId, selectedStatus]);

  const clearDraftSaveTimer = useCallback(() => {
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
  }, []);

  const persistDraft = useCallback(async () => {
    if (!draftReadyRef.current || finalizingRef.current) {
      return;
    }

    const draft = latestDraftRef.current;
    if (!draft.selectedStatus) {
      return;
    }

    const save = draftSaveChainRef.current
      .catch(() => undefined)
      .then(() => savePointDraft(assignmentId, pointId, draft));
    draftSaveChainRef.current = save;
    await save;
  }, [assignmentId, pointId]);

  const flushDraft = useCallback(async () => {
    clearDraftSaveTimer();
    await persistDraft();
  }, [clearDraftSaveTimer, persistDraft]);

  const reload = useCallback(async () => {
    clearDraftSaveTimer();
    draftReadyRef.current = false;
    finalizingRef.current = false;
    const ownerUserId = await getStoredOwnerUserId();
    if (!ownerUserId) {
      setPoint(null);
      setAttachments([]);
      return;
    }
    const [loaded, files] = await Promise.all([getPointForFill(assignmentId, pointId, ownerUserId, currentContourId), listPointFiles(assignmentId, pointId)]);
    setLoadError(null);
    setPoint(loaded);
    setComment(loaded?.comment ?? "");
    setIssueTypeId(loaded?.issueTypeId ?? "Р СњР ВµР С‘РЎРѓР С—РЎР‚Р В°Р Р†Р Р…Р С•РЎРѓРЎвЂљРЎРЉ");
    setAttachments(files.map(toPointAttachment));

    if (loaded?.status === "ok" || loaded?.status === "issue" || loaded?.status === "skipped") {
      setSelectedStatus(loaded.status);
      setPhase("details");
    } else if (loaded?.status === "deferred") {
      setSelectedStatus(restoreDeferredPointSelection(loaded));
      setPhase("details");
    } else {
      setSelectedStatus(null);
      setPhase("status");
    }
    draftReadyRef.current = Boolean(loaded);
  }, [assignmentId, clearDraftSaveTimer, pointId]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      void reload().catch((caught) => {
        void logMobileError("patrol.point.load.failed", caught);
        if (isMounted) {
          setLoadError(caught instanceof Error ? caught.message : "Р СњР Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ Р В·Р В°Р С–РЎР‚РЎС“Р В·Р С‘РЎвЂљРЎРЉ РЎвЂљР С•РЎвЂЎР С”РЎС“ Р С•Р В±РЎвЂ¦Р С•Р Т‘Р В°.");
        }
      });

      return () => {
        isMounted = false;
        clearDraftSaveTimer();
        void persistDraft().catch((draftError) => { void logMobileError("patrol.point.draft.save.failed", draftError); });
      };
    }, [clearDraftSaveTimer, persistDraft, reload])
  );

  useEffect(() => {
    if (!draftReadyRef.current || finalizingRef.current || !selectedStatus) {
      return;
    }

    clearDraftSaveTimer();
    draftSaveTimerRef.current = setTimeout(() => {
      draftSaveTimerRef.current = null;
      void persistDraft().catch(() => setError("Р СњР Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ РЎРѓР С•РЎвЂ¦РЎР‚Р В°Р Р…Р С‘РЎвЂљРЎРЉ РЎвЂЎР ВµРЎР‚Р Р…Р С•Р Р†Р С‘Р С” РЎвЂљР С•РЎвЂЎР С”Р С‘."));
    }, 400);

    return clearDraftSaveTimer;
  }, [attachments, clearDraftSaveTimer, comment, issueTypeId, persistDraft, selectedStatus]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        void flushDraft().catch(() => undefined);
      }
    });

    return () => subscription.remove();
  }, [flushDraft]);

  function selectStatus(status: SelectedStatus) {
    setSelectedStatus(status);
    setError(null);
    setPhase("details");
  }

  function handleSkipTag() {
    selectStatus("skipped");
  }

  async function handleSave() {
    setError(null);
    if (!selectedStatus) {
      setPhase("status");
      return;
    }

    if (selectedStatus === "issue" && comment.trim().length === 0) {
      setError("Р вЂќР В»РЎРЏ Р Р…Р ВµР С‘РЎРѓР С—РЎР‚Р В°Р Р†Р Р…Р С•РЎРѓРЎвЂљР С‘ Р Р…РЎС“Р В¶Р ВµР Р… Р С”Р С•Р СР СР ВµР Р…РЎвЂљР В°РЎР‚Р С‘Р в„–.");
      return;
    }

    if (selectedStatus === "skipped" && comment.trim().length === 0) {
      setError("Р Р€Р С”Р В°Р В¶Р С‘РЎвЂљР Вµ, Р С—Р С•РЎвЂЎР ВµР СРЎС“ Р СР ВµРЎвЂљР С”Р В° Р Р…Р ВµР Т‘Р С•РЎРѓРЎвЂљРЎС“Р С—Р Р…Р В°.");
      return;
    }

    if (isPhotoEvidenceRequired(Boolean(point?.requiresPhoto), selectedStatus) && !hasPhotoAttachment(attachments)) {
      setError("Р вЂќР В»РЎРЏ РЎРЊРЎвЂљР С•Р в„– Р СР ВµРЎвЂљР С”Р С‘ РЎвЂљРЎР‚Р ВµР В±РЎС“Р ВµРЎвЂљРЎРѓРЎРЏ РЎвЂћР С•РЎвЂљР С•РЎвЂћР С‘Р С”РЎРѓР В°РЎвЂ Р С‘РЎРЏ.");
      return;
    }

    clearDraftSaveTimer();
    finalizingRef.current = true;
    setIsSubmitting(true);
    let pointSaved = false;
    try {
      await draftSaveChainRef.current.catch(() => undefined);
      if (selectedStatus === "issue") {
        await savePointIssue(assignmentId, pointId, comment.trim(), issueTypeId.trim() || "Р СњР ВµР С‘РЎРѓР С—РЎР‚Р В°Р Р†Р Р…Р С•РЎРѓРЎвЂљРЎРЉ");
      } else if (selectedStatus === "skipped") {
        await skipPoint(assignmentId, pointId, {
          comment: comment.trim(),
          photoClientFileIds: attachments.map((attachment) => attachment.clientFileId)
        });
      } else {
        await savePointOk(assignmentId, pointId, comment.trim());
      }
      pointSaved = true;
      await continuePatrolFlow();
    } catch {
      if (!pointSaved) {
        finalizingRef.current = false;
        void persistDraft().catch((draftError) => { void logMobileError("patrol.point.draft.save.failed", draftError); });
      }
      setError(pointSaved ? "Р СљР ВµРЎвЂљР С”Р В° РЎРѓР С•РЎвЂ¦РЎР‚Р В°Р Р…Р ВµР Р…Р В°, Р Р…Р С• Р С—Р ВµРЎР‚Р ВµРЎвЂ¦Р С•Р Т‘ Р С” РЎРѓР В»Р ВµР Т‘РЎС“РЎР‹РЎвЂ°Р ВµР в„– РЎвЂљР С•РЎвЂЎР С”Р Вµ Р Р…Р Вµ Р Р†РЎвЂ№Р С—Р С•Р В»Р Р…Р ВµР Р…." : "Р СњР Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ РЎРѓР С•РЎвЂ¦РЎР‚Р В°Р Р…Р С‘РЎвЂљРЎРЉ Р СР ВµРЎвЂљР С”РЎС“.");
    } finally {
      setIsSubmitting(false);
    }
  }
  async function handleDefer() {
    setError(null);
    clearDraftSaveTimer();
    finalizingRef.current = true;
    setIsSubmitting(true);
    let deferred = false;
    try {
      await draftSaveChainRef.current.catch(() => undefined);
      await deferPoint(assignmentId, pointId, {
        selectedStatus,
        comment: comment.trim(),
        issueTypeId: issueTypeId.trim() || "Р СњР ВµР С‘РЎРѓР С—РЎР‚Р В°Р Р†Р Р…Р С•РЎРѓРЎвЂљРЎРЉ",
        photoClientFileIds: attachments.map((attachment) => attachment.clientFileId)
      });
      deferred = true;
      await continuePatrolFlow();
    } catch {
      if (!deferred) {
        finalizingRef.current = false;
        void persistDraft().catch((draftError) => { void logMobileError("patrol.point.draft.save.failed", draftError); });
      }
      setError(deferred ? "Р СћР С•РЎвЂЎР С”Р В° Р С•РЎвЂљР В»Р С•Р В¶Р ВµР Р…Р В°, Р Р…Р С• Р С—Р ВµРЎР‚Р ВµРЎвЂ¦Р С•Р Т‘ Р С” РЎРѓР В»Р ВµР Т‘РЎС“РЎР‹РЎвЂ°Р ВµР в„– РЎвЂљР С•РЎвЂЎР С”Р Вµ Р Р…Р Вµ Р Р†РЎвЂ№Р С—Р С•Р В»Р Р…Р ВµР Р…." : "Р СњР Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ Р С•РЎвЂљР В»Р С•Р В¶Р С‘РЎвЂљРЎРЉ Р СР ВµРЎвЂљР С”РЎС“.");
    } finally {
      setIsSubmitting(false);
    }
  }
  async function handleAddPhoto() {
    setError(null);
    setIsMediaBusy(true);
    setMediaProgress(0);
    try {
      await flushDraft();
      const result = await attachPointPhotoFromCamera(assignmentId, pointId, handleMediaProgress);

      if (result === "attached") {
        await reloadPointAndAttachments();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Р СњР Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ Р Т‘Р С•Р В±Р В°Р Р†Р С‘РЎвЂљРЎРЉ РЎвЂћР С•РЎвЂљР С•.");
    } finally {
      setIsMediaBusy(false);
      setMediaProgress(null);
    }
  }

  async function handleAddVideo() {
    setError(null);
    setIsMediaBusy(true);
    setMediaProgress(0);
    try {
      await flushDraft();
      const result = await attachPointVideoFromCamera(assignmentId, pointId, handleMediaProgress);

      if (result === "attached") {
        await reloadPointAndAttachments();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Р СњР Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ Р Т‘Р С•Р В±Р В°Р Р†Р С‘РЎвЂљРЎРЉ Р Р†Р С‘Р Т‘Р ВµР С•.");
    } finally {
      setIsMediaBusy(false);
      setMediaProgress(null);
    }
  }

  async function handleAddFromGallery() {
    setError(null);
    setIsMediaBusy(true);
    setMediaProgress(0);
    try {
      await flushDraft();
      const result = await attachPointMediaFromGallery(assignmentId, pointId, handleMediaProgress);
      if (result.status === "attached") {
        await reloadPointAndAttachments();
      }
      if (result.errors.length > 0) {
        setError(`Р вЂќР С•Р В±Р В°Р Р†Р В»Р ВµР Р…Р С•: ${result.attachedCount}. Р СњР Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ: ${result.errors.length}. ${result.errors[0]}`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Р СњР Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ Р Т‘Р С•Р В±Р В°Р Р†Р С‘РЎвЂљРЎРЉ Р Р†Р В»Р С•Р В¶Р ВµР Р…Р С‘РЎРЏ.");
    } finally {
      setIsMediaBusy(false);
      setMediaProgress(null);
    }
  }

  async function continuePatrolFlow() {
    const readiness = await getReportReadiness(assignmentId);
    router.replace(readiness.ready
      ? `/patrol/assignment/${assignmentId}/submit`
      : `/patrol/assignment/${assignmentId}/scan-nfc`);
  }

  async function reloadPointAndAttachments() {
    const ownerUserId = await getStoredOwnerUserId();
    if (!ownerUserId) {
      setPoint(null);
      setAttachments([]);
      return;
    }
    const [updatedPoint, files] = await Promise.all([
      getPointForFill(assignmentId, pointId, ownerUserId, currentContourId),
      listPointFiles(assignmentId, pointId)
    ]);
    setPoint(updatedPoint);
    setAttachments(files.map(toPointAttachment));
  }

  if (loadError) {
    return (
      <Screen title="Р вЂ”Р В°Р С—Р С•Р В»Р Р…Р ВµР Р…Р С‘Р Вµ Р СР ВµРЎвЂљР С”Р С‘" subtitle="Р РЋРЎвЂљР В°РЎвЂљРЎС“РЎРѓ, Р С”Р С•Р СР СР ВµР Р…РЎвЂљР В°РЎР‚Р С‘Р в„– Р С‘ Р Р†Р В»Р С•Р В¶Р ВµР Р…Р С‘РЎРЏ РЎвЂљР С•РЎвЂЎР С”Р С‘.">
        <Card>
          <Text style={[styles.text, { color: "#b91c1c" }]}>{loadError}</Text>
          <PrimaryButton icon="refresh-outline" label="Р СџР С•Р Р†РЎвЂљР С•РЎР‚Р С‘РЎвЂљРЎРЉ Р В·Р В°Р С–РЎР‚РЎС“Р В·Р С”РЎС“" onPress={() => void reload()} variant="secondary" />
        </Card>
      </Screen>
    );
  }
  if (!point) {
    return (
      <Screen title="Р вЂ”Р В°Р С—Р С•Р В»Р Р…Р ВµР Р…Р С‘Р Вµ Р СР ВµРЎвЂљР С”Р С‘" subtitle="Р РЋРЎвЂљР В°РЎвЂљРЎС“РЎРѓ, Р С”Р С•Р СР СР ВµР Р…РЎвЂљР В°РЎР‚Р С‘Р в„– Р С‘ Р Р†Р В»Р С•Р В¶Р ВµР Р…Р С‘РЎРЏ РЎвЂљР С•РЎвЂЎР С”Р С‘.">
        <Card>
          <Text style={[styles.text, { color: colors.mutedText }]}>Р СћР С•РЎвЂЎР С”Р В° Р Р…Р Вµ Р Р…Р В°Р в„–Р Т‘Р ВµР Р…Р В° Р Р…Р В° РЎвЂљР ВµР В»Р ВµРЎвЂћР С•Р Р…Р Вµ.</Text>
        </Card>
      </Screen>
    );
  }

  if (phase === "status") {
    return (
      <Screen title="Р РЋРЎвЂљР В°РЎвЂљРЎС“РЎРѓ Р СР ВµРЎвЂљР С”Р С‘" subtitle="Р вЂ™РЎвЂ№Р В±Р ВµРЎР‚Р С‘РЎвЂљР Вµ РЎРѓР С•РЎРѓРЎвЂљР С•РЎРЏР Р…Р С‘Р Вµ Р С•Р В±РЎР‰Р ВµР С”РЎвЂљР В°.">
        <Card>
          <View style={styles.row}>
            <Text style={[styles.title, { color: colors.text }]}>
              {point.orderIndex}. {point.name}
            </Text>
            <StatusPill label={confirmationLabel(point)} tone={point.confirmationType === "nfc" ? "success" : "neutral"} />
          </View>
          <View style={styles.scanMeta}>
            <Ionicons color={colors.mutedText} name="time-outline" size={17} />
            <Text style={[styles.scanMetaText, { color: colors.mutedText }]}>Р РЋР С”Р В°Р Р…Р С‘РЎР‚Р С•Р Р†Р В°Р Р…Р С‘Р Вµ: {formatScanTime(point.scannedAtLocal)}</Text>
          </View>
        </Card>

        <PointGuidanceCard
          description={point.description}
          instruction={point.instruction}
          mutedColor={colors.mutedText}
          textColor={colors.text}
        />

        <View style={styles.statusGrid}>
          <StatusButton label="Р ВРЎРѓР С—РЎР‚Р В°Р Р†Р Р…Р С•" description="Р С›Р В±РЎР‰Р ВµР С”РЎвЂљ Р Р† Р Р…Р С•РЎР‚Р СР В°Р В»РЎРЉР Р…Р С•Р С РЎРѓР С•РЎРѓРЎвЂљР С•РЎРЏР Р…Р С‘Р С‘" tone="success" onPress={() => selectStatus("ok")} />
          <StatusButton label="Р СњР ВµР С‘РЎРѓР С—РЎР‚Р В°Р Р†Р Р…Р С•" description="Р СњР В°Р в„–Р Т‘Р ВµР Р…Р В° Р Р…Р ВµР С‘РЎРѓР С—РЎР‚Р В°Р Р†Р Р…Р С•РЎРѓРЎвЂљРЎРЉ Р С‘Р В»Р С‘ Р С•РЎвЂљР С”Р В»Р С•Р Р…Р ВµР Р…Р С‘Р Вµ" tone="danger" onPress={() => selectStatus("issue")} />
        </View>

        <Card style={styles.manualCloseCard}>
          <Text style={styles.manualCloseTitle}>{"\u0420\u0443\u0447\u043d\u043e\u0435 \u0437\u0430\u043a\u0440\u044b\u0442\u0438\u0435 \u0442\u043e\u0447\u043a\u0438"}</Text>
          <Text style={styles.photoNote}>{"\u0415\u0441\u043b\u0438 NFC/QR \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b, \u043d\u0430\u0436\u043c\u0438\u0442\u0435 \u00ab\u041c\u0435\u0442\u043a\u0430 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0430\u00bb \u0438 \u0437\u0430\u043f\u043e\u043b\u043d\u0438\u0442\u0435 \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442 \u0432\u0440\u0443\u0447\u043d\u0443\u044e."}</Text>
        </Card>

        <Pressable
          accessibilityLabel="Р С›РЎвЂљР СР ВµРЎвЂљР С‘РЎвЂљРЎРЉ Р СР ВµРЎвЂљР С”РЎС“ Р С”Р В°Р С” Р Р…Р ВµР Т‘Р С•РЎРѓРЎвЂљРЎС“Р С—Р Р…РЎС“РЎР‹"
          accessibilityRole="button"
          disabled={isSubmitting}
          onPress={handleSkipTag}
          style={({ pressed }) => [
            styles.skipButton,
            pressed && !isSubmitting ? styles.skipButtonPressed : null,
            isSubmitting ? styles.skipButtonDisabled : null
          ]}
        >
          <View style={styles.skipIcon}>
            <Ionicons color="#b45309" name="alert-circle-outline" size={18} />
          </View>
          <View style={styles.skipTextBlock}>
            <Text style={styles.skipTitle}>Р СљР ВµРЎвЂљР С”Р В° Р Р…Р ВµР Т‘Р С•РЎРѓРЎвЂљРЎС“Р С—Р Р…Р В°</Text>
            <Text style={styles.skipDescription}>Р СњР ВµРЎвЂљ NFC/QR Р С‘Р В»Р С‘ Р СР ВµРЎвЂљР С”Р В° РЎС“РЎвЂљР ВµРЎР‚РЎРЏР Р…Р В°</Text>
          </View>
          <Ionicons color="#b45309" name="chevron-forward" size={18} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.replace(`/patrol/assignment/${assignmentId}/all-points`)} style={styles.inlineLink}>
          <Ionicons color={colors.primary} name="list-outline" size={19} />
          <Text style={[styles.inlineLinkText, { color: colors.primary }]}>Р вЂ™РЎРѓР Вµ Р СР ВµРЎвЂљР С”Р С‘</Text>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen title="Р В Р ВµР В·РЎС“Р В»РЎРЉРЎвЂљР В°РЎвЂљ РЎвЂљР С•РЎвЂЎР С”Р С‘" subtitle="Р вЂ”Р В°Р С—Р С•Р В»Р Р…Р С‘РЎвЂљР Вµ РЎвЂљР С•Р В»РЎРЉР С”Р С• Р Р…Р ВµР С•Р В±РЎвЂ¦Р С•Р Т‘Р С‘Р СРЎвЂ№Р Вµ РЎРѓР Р†Р ВµР Т‘Р ВµР Р…Р С‘РЎРЏ.">
      <Card>
        <View style={styles.row}>
          <Text style={[styles.title, { color: colors.text }]}>
            {point.orderIndex}. {point.name}
          </Text>
          <StatusPill label={statusLabel(selectedStatus)} tone={statusTone(selectedStatus)} />
        </View>
      </Card>

      <PointGuidanceCard
        description={point.description}
        instruction={point.instruction}
        mutedColor={colors.mutedText}
        textColor={colors.text}
      />

      {selectedStatus === "skipped" ? (
        <Card style={styles.skipInfoCard}>
          <Text style={[styles.label, { color: colors.text }]}>Р С’Р Р†Р В°РЎР‚Р С‘Р в„–Р Р…Р С•Р Вµ Р В·Р В°Р С”РЎР‚РЎвЂ№РЎвЂљР С‘Р Вµ РЎвЂљР С•РЎвЂЎР С”Р С‘</Text>
          <Text style={[styles.text, { color: colors.mutedText }]}>
            Р вЂ™ web-Р С•РЎвЂљРЎвЂЎР ВµРЎвЂљР Вµ Р В±РЎС“Р Т‘Р ВµРЎвЂљ РЎС“Р С”Р В°Р В·Р В°Р Р…Р С•: Р СР ВµРЎвЂљР С”Р В° Р Р…Р ВµР Т‘Р С•РЎРѓРЎвЂљРЎС“Р С—Р Р…Р В°, РЎвЂљР С•РЎвЂЎР С”Р В° Р В·Р В°Р С”РЎР‚РЎвЂ№РЎвЂљР В° Р Р†РЎР‚РЎС“РЎвЂЎР Р…РЎС“РЎР‹ Р В±Р ВµР В· РЎРѓР С”Р В°Р Р…Р С‘РЎР‚Р С•Р Р†Р В°Р Р…Р С‘РЎРЏ.
          </Text>
        </Card>
      ) : null}

      {selectedStatus === "issue" ? (
        <Card>
          <Text style={[styles.label, { color: colors.text }]}>Р СћР С‘Р С— Р Р…Р ВµР С‘РЎРѓР С—РЎР‚Р В°Р Р†Р Р…Р С•РЎРѓРЎвЂљР С‘</Text>
          <TextInput editable={!isSubmitting} onBlur={() => void flushDraft().catch(() => setError("Р СњР Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ РЎРѓР С•РЎвЂ¦РЎР‚Р В°Р Р…Р С‘РЎвЂљРЎРЉ РЎвЂЎР ВµРЎР‚Р Р…Р С•Р Р†Р С‘Р С” РЎвЂљР С•РЎвЂЎР С”Р С‘."))} onChangeText={setIssueTypeId} style={styles.input} value={issueTypeId} />
        </Card>
      ) : null}

      <Card>
        <Text style={[styles.label, { color: colors.text }]}>Р С™Р С•Р СР СР ВµР Р…РЎвЂљР В°РЎР‚Р С‘Р в„–</Text>
        <TextInput
          editable={!isSubmitting}
          multiline
          onBlur={() => void flushDraft().catch(() => setError("Р СњР Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ РЎРѓР С•РЎвЂ¦РЎР‚Р В°Р Р…Р С‘РЎвЂљРЎРЉ РЎвЂЎР ВµРЎР‚Р Р…Р С•Р Р†Р С‘Р С” РЎвЂљР С•РЎвЂЎР С”Р С‘."))}
          onChangeText={setComment}
          placeholder={commentPlaceholder(selectedStatus)}
          placeholderTextColor="#9ca3af"
          style={[styles.input, styles.textArea]}
          textAlignVertical="top"
          value={comment}
        />
      </Card>

      <Card>
        <View style={styles.photoHeader}>
          <Text style={[styles.label, { color: colors.text }]}>Р В¤Р С•РЎвЂљР С• Р С‘ Р Р†Р С‘Р Т‘Р ВµР С•</Text>
          <Text style={styles.photoNote}>{point.requiresPhoto ? "\u041e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u043e \u043f\u0440\u0438 \u043d\u0435\u0438\u0441\u043f\u0440\u0430\u0432\u043d\u043e\u0441\u0442\u0438 \u0438\u043b\u0438 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u043e\u0439 \u043c\u0435\u0442\u043a\u0435" : "\u041d\u0435\u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u043e"}</Text>
        </View>
        {attachments.length > 0 ? (
          <View style={styles.photoGrid}>
            {attachments.map((attachment) => (
              <View key={attachment.clientFileId} style={styles.photoTile}>
                {attachment.mediaKind === "video" ? (
                  <View style={styles.videoTile}>
                    <Ionicons color="#2563eb" name="videocam-outline" size={24} />
                    <Text style={styles.videoLabel}>Р вЂ™Р С‘Р Т‘Р ВµР С•</Text>
                  </View>
                ) : (
                  <Image source={{ uri: attachment.localPath }} style={styles.photo} />
                )}
                <Text style={styles.photoStatus}>{fileStatusLabel(attachment.status)}</Text>
                <Text style={styles.photoSource}>{"\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a: \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u0430\u044f \u043a\u043e\u043f\u0438\u044f"}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyPhotoBox}>
            <Text style={styles.photoNote}>Р вЂ™Р В»Р С•Р В¶Р ВµР Р…Р С‘РЎРЏ Р С—Р С•Р С”Р В° Р Р…Р Вµ Р Т‘Р С•Р В±Р В°Р Р†Р В»Р ВµР Р…РЎвЂ№</Text>
          </View>
        )}
        {attachments.length > 0 ? (
          <Text style={styles.photoNote}>
            Р В¤Р С•РЎвЂљР С•: {attachments.filter((item) => item.mediaKind !== "video").length} Р’В· Р вЂ™Р С‘Р Т‘Р ВµР С•: {attachments.filter((item) => item.mediaKind === "video").length}
          </Text>
        ) : null}
        {isMediaBusy ? (
          <View style={styles.mediaProgress}>
            <ActivityIndicator />
            <Text style={styles.photoNote}>
              {mediaProgress === null ? "Подготовка вложения…" : `Подготовка вложения: ${Math.round(mediaProgress * 100)}%`}
            </Text>
          </View>
        ) : null}
        <PrimaryButton disabled={isSubmitting || isMediaBusy} icon="attach-outline" label="Р вЂќР С•Р В±Р В°Р Р†Р С‘РЎвЂљРЎРЉ Р Р†Р В»Р С•Р В¶Р ВµР Р…Р С‘Р Вµ" onPress={() => setOpenMenu("attachments")} variant="secondary" />
      </Card>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {isSubmitting ? <ActivityIndicator /> : null}
      <PrimaryButton disabled={isSubmitting || isMediaBusy} icon="save-outline" label="Р РЋР С•РЎвЂ¦РЎР‚Р В°Р Р…Р С‘РЎвЂљРЎРЉ Р С‘ Р С—РЎР‚Р С•Р Т‘Р С•Р В»Р В¶Р С‘РЎвЂљРЎРЉ" onPress={handleSave} size="large" />
      <View style={styles.bottomActions}>
        <Pressable accessibilityRole="button" onPress={() => setPhase("status")} style={styles.inlineLink}>
          <Ionicons color={colors.primary} name="swap-horizontal-outline" size={19} />
          <Text style={[styles.inlineLinkText, { color: colors.primary }]}>Р ВР В·Р СР ВµР Р…Р С‘РЎвЂљРЎРЉ РЎРѓР С•РЎРѓРЎвЂљР С•РЎРЏР Р…Р С‘Р Вµ</Text>
        </Pressable>
        <Pressable accessibilityLabel="Р вЂќР С•Р С—Р С•Р В»Р Р…Р С‘РЎвЂљР ВµР В»РЎРЉР Р…РЎвЂ№Р Вµ Р Т‘Р ВµР в„–РЎРѓРЎвЂљР Р†Р С‘РЎРЏ" accessibilityRole="button" onPress={() => setOpenMenu("more")} style={styles.moreButton}>
          <Ionicons color={colors.primary} name="ellipsis-horizontal" size={22} />
        </Pressable>
      </View>
      <ActionSheet
        actions={openMenu === "attachments" ? [
          { label: "Р РЋР Т‘Р ВµР В»Р В°РЎвЂљРЎРЉ РЎвЂћР С•РЎвЂљР С•", icon: "camera-outline", onPress: () => void handleAddPhoto() },
          { label: "Р РЋР Р…РЎРЏРЎвЂљРЎРЉ Р Р†Р С‘Р Т‘Р ВµР С•", icon: "videocam-outline", onPress: () => void handleAddVideo() },
          { label: "Р вЂ™РЎвЂ№Р В±РЎР‚Р В°РЎвЂљРЎРЉ Р С‘Р В· Р С–Р В°Р В»Р ВµРЎР‚Р ВµР С‘", icon: "images-outline", onPress: () => void handleAddFromGallery() }
        ] : [
          { label: "Р С›РЎвЂљР В»Р С•Р В¶Р С‘РЎвЂљРЎРЉ РЎвЂљР С•РЎвЂЎР С”РЎС“", icon: "time-outline", danger: true, onPress: () => void handleDefer() }
        ]}
        onClose={() => setOpenMenu(null)}
        title={openMenu === "attachments" ? "Р вЂќР С•Р В±Р В°Р Р†Р С‘РЎвЂљРЎРЉ Р Р†Р В»Р С•Р В¶Р ВµР Р…Р С‘Р Вµ" : "Р вЂќР ВµР в„–РЎРѓРЎвЂљР Р†Р С‘РЎРЏ РЎРѓ РЎвЂљР С•РЎвЂЎР С”Р С•Р в„–"}
        visible={openMenu !== null}
      />
    </Screen>
  );
}

function PointGuidanceCard({
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
  if (!description?.trim() && !instruction?.trim()) {
    return null;
  }

  return (
    <Card>
      {description?.trim() ? (
        <View style={styles.guidanceBlock}>
          <Text style={[styles.label, { color: textColor }]}>Р С›Р С—Р С‘РЎРѓР В°Р Р…Р С‘Р Вµ Р С•Р В±Р С•РЎР‚РЎС“Р Т‘Р С•Р Р†Р В°Р Р…Р С‘РЎРЏ</Text>
          <Text style={[styles.text, { color: mutedColor }]}>{description.trim()}</Text>
        </View>
      ) : null}
      {instruction?.trim() ? (
        <View style={styles.guidanceBlock}>
          <Text style={[styles.label, { color: textColor }]}>Р ВР Р…РЎРѓРЎвЂљРЎР‚РЎС“Р С”РЎвЂ Р С‘РЎРЏ Р С” Р СР ВµРЎвЂљР С”Р Вµ</Text>
          <Text style={[styles.text, { color: mutedColor }]}>{instruction.trim()}</Text>
        </View>
      ) : null}
    </Card>
  );
}

function StatusButton({
  label,
  description,
  tone,
  onPress
}: {
  label: string;
  description: string;
  tone: "success" | "danger";
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.statusButton, tone === "success" ? styles.statusButtonSuccess : styles.statusButtonDanger]}
    >
      <View style={[styles.statusIcon, tone === "success" ? styles.statusIconSuccess : styles.statusIconDanger]}>
        <Ionicons color="#ffffff" name={tone === "success" ? "checkmark" : "alert"} size={30} />
      </View>
      <Text style={[styles.statusText, tone === "success" ? styles.statusTextSuccess : styles.statusTextDanger]}>{label}</Text>
      <Text style={styles.statusDescription}>{description}</Text>
    </Pressable>
  );
}

function confirmationLabel(point: PointForFill) {
  if (point.confirmationType === "nfc") {
    return "NFC Р С—Р С•Р Т‘РЎвЂљР Р†Р ВµРЎР‚Р В¶Р Т‘Р ВµР Р…";
  }

  if (point.confirmationType === "qr") {
    return "QR Р С—Р С•Р Т‘РЎвЂљР Р†Р ВµРЎР‚Р В¶Р Т‘Р ВµР Р…";
  }

  if (point.status === "deferred") {
    return "Р С›РЎвЂљР В»Р С•Р В¶Р ВµР Р…Р В°";
  }

  if (point.status === "skipped") {
    return "Р СљР ВµРЎвЂљР С”Р В° Р Р…Р ВµР Т‘Р С•РЎРѓРЎвЂљРЎС“Р С—Р Р…Р В°";
  }

  return "Р В РЎС“РЎвЂЎР Р…Р С•Р Вµ Р В·Р В°Р С—Р С•Р В»Р Р…Р ВµР Р…Р С‘Р Вµ";
}

function statusLabel(status: SelectedStatus | null) {
  if (status === "issue") {
    return "Р СњР ВµР С‘РЎРѓР С—РЎР‚Р В°Р Р†Р Р…Р С•";
  }

  if (status === "skipped") {
    return "Р СљР ВµРЎвЂљР С”Р В° Р Р…Р ВµР Т‘Р С•РЎРѓРЎвЂљРЎС“Р С—Р Р…Р В°";
  }

  return "Р ВРЎРѓР С—РЎР‚Р В°Р Р†Р Р…Р С•";
}

function statusTone(status: SelectedStatus | null) {
  if (status === "issue") {
    return "danger";
  }

  if (status === "skipped") {
    return "warning";
  }

  return "success";
}

function commentPlaceholder(status: SelectedStatus | null) {
  if (status === "issue") {
    return "Р С›Р С—Р С‘РЎв‚¬Р С‘РЎвЂљР Вµ Р Р…Р ВµР С‘РЎРѓР С—РЎР‚Р В°Р Р†Р Р…Р С•РЎРѓРЎвЂљРЎРЉ";
  }

  if (status === "skipped") {
    return "Р СљР С•Р В¶Р Р…Р С• РЎС“РЎвЂљР С•РЎвЂЎР Р…Р С‘РЎвЂљРЎРЉ, Р С—Р С•РЎвЂЎР ВµР СРЎС“ Р СР ВµРЎвЂљР С”Р В° Р Р…Р ВµР Т‘Р С•РЎРѓРЎвЂљРЎС“Р С—Р Р…Р В°";
  }

  return "Р В§РЎвЂљР С• Р В·Р В°Р СР ВµРЎвЂљР С‘Р В»Р С‘ Р Р†Р С• Р Р†РЎР‚Р ВµР СРЎРЏ Р С•Р В±РЎвЂ¦Р С•Р Т‘Р В°?";
}

function fileStatusLabel(status: string) {
  switch (status) {
    case "uploaded":
    case "linked":
      return "Р вЂ”Р В°Р С–РЎР‚РЎС“Р В¶Р ВµР Р…Р С•";
    case "uploading":
      return "Р С›РЎвЂљР С—РЎР‚Р В°Р Р†Р С”Р В°";
    case "retryLater":
    case "failed":
      return "Р С›Р В¶Р С‘Р Т‘Р В°Р ВµРЎвЂљ Р С—Р С•Р Р†РЎвЂљР С•РЎР‚";
    default:
      return "Р СњР В° РЎвЂљР ВµР В»Р ВµРЎвЂћР С•Р Р…Р Вµ";
  }
}

function toPointAttachment(file: { clientFileId: string; localPath: string; status: string; mediaKind?: "photo" | "video" | null }) {
  return {
    clientFileId: file.clientFileId,
    localPath: file.localPath,
    status: file.status,
    mediaKind: file.mediaKind ?? "photo"
  } satisfies PointAttachment;
}

function hasPhotoAttachment(attachments: PointAttachment[]) {
  return attachments.some((attachment) => attachment.mediaKind !== "video");
}

function formatScanTime(value: string | null) {
  if (!value) {
    return "Р Р†РЎР‚РЎС“РЎвЂЎР Р…РЎС“РЎР‹";
  }

  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 26
  },
  text: {
    fontSize: 15,
    lineHeight: 21
  },
  scanMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7
  },
  scanMetaText: {
    fontSize: 13,
    fontWeight: "700"
  },
  label: {
    fontSize: 14,
    fontWeight: "700"
  },
  input: {
    borderColor: "#d1d5db",
    borderRadius: 8,
    borderWidth: 1,
    color: "#0f1a2b",
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  textArea: {
    minHeight: 110
  },
  statusGrid: {
    flexDirection: "row",
    gap: 12
  },
  statusButton: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    minHeight: 174,
    justifyContent: "center",
    padding: 12
  },
  statusButtonSuccess: {
    backgroundColor: "#f1fcf6",
    borderColor: "#22c55e"
  },
  statusButtonDanger: {
    backgroundColor: "#fff7ed",
    borderColor: "#ef4444"
  },
  statusIcon: {
    alignItems: "center",
    borderRadius: 999,
    height: 50,
    justifyContent: "center",
    marginBottom: 14,
    width: 50
  },
  statusIconSuccess: {
    backgroundColor: "#22c55e"
  },
  statusIconDanger: {
    backgroundColor: "#ef4444"
  },
  statusText: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8
  },
  statusTextSuccess: {
    color: "#22c55e"
  },
  statusTextDanger: {
    color: "#ef4444"
  },
  statusDescription: {
    color: "#4b5563",
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center"
  },
  skipButton: {
    alignItems: "center",
    backgroundColor: "#fffbeb",
    borderColor: "#f59e0b",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 88,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  skipButtonPressed: {
    backgroundColor: "#fef3c7"
  },
  skipButtonDisabled: {
    opacity: 0.62
  },
  skipIcon: {
    alignItems: "center",
    backgroundColor: "#fef3c7",
    borderColor: "#fbbf24",
    borderWidth: 1,
    borderRadius: 999,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  skipTextBlock: {
    flex: 1,
    gap: 1
  },
  skipTitle: {
    color: "#78350f",
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 21
  },
  skipDescription: {
    color: "#92400e",
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 14
  },
  manualCloseCard: {
    borderColor: "#fbbf24",
    gap: 4
  },
  manualCloseTitle: {
    color: "#78350f",
    fontSize: 15,
    fontWeight: "800"
  },
  skipInfoCard: {
    borderColor: "#fbbf24"
  },
  guidanceBlock: {
    gap: 5
  },
  mediaProgress: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 8
  },
  photoNote: {
    color: "#6b7280",
    fontSize: 13,
    lineHeight: 18
  },
  photoHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  emptyPhotoBox: {
    alignItems: "center",
    borderColor: "#b9cdfd",
    borderRadius: 12,
    borderStyle: "dashed",
    borderWidth: 1,
    minHeight: 92,
    justifyContent: "center"
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  photoTile: {
    gap: 6,
    width: 96
  },
  photo: {
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: "#e5e7eb",
    width: "100%"
  },
  photoSource: {
    color: "#64748b",
    fontSize: 10,
    lineHeight: 14
  },
  photoStatus: {
    color: "#6b7280",
    fontSize: 11
  },
  videoTile: {
    alignItems: "center",
    aspectRatio: 1,
    backgroundColor: "#eff6ff",
    borderColor: "#bfdbfe",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    width: "100%"
  },
  videoLabel: {
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4
  },
  bottomActions: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  inlineLink: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 4
  },
  inlineLinkText: {
    fontSize: 14,
    fontWeight: "800"
  },
  moreButton: {
    alignItems: "center",
    borderColor: "#dbe5f2",
    borderRadius: 12,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 48
  },
  error: {
    color: "#ef4444",
    fontSize: 14,
    lineHeight: 20
  }
});
