import { subscribeToSyncEvents } from "@/sync/syncEvents";
import { TransientNotice } from "@/ui/TransientNotice";
import { inspectionChoices, needsManualInspectionReason } from "./pointInspectionPresentation";
import type { ThemeColors } from "@/ui/atomTheme";
import { toneFill } from "@/ui/atomTheme";
import { font } from "@/ui/typography";
import { StatusMessage } from "@/ui/StatusMessage";
import { SelectField } from "@/ui/SelectField";
import { TextField as TextInput } from "@/ui/TextField";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, usePreventRemove } from 'expo-router/react-navigation';
import { createPointDraftController } from '@/services/pointDraftController';
import { registerFormNavigationGuard } from '@/services/formNavigationGuard';
import { getSessionGeneration } from '@/auth/sessionGeneration';
import { captureDataOwnerContext, assertDataOwnerContext, type DataOwnerContext } from '@/auth/dataOwnerContext';
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { listPointFiles } from "@/db/repositories/filesRepository";
import { beginManualPointInspection, assertPointCanBeOpened, deferPoint, getAssignmentScanPolicy, getPointForFill, getReportReadiness, listPointAttachmentEditBlocks, PointForFill, savePointDraft, savePointIssue, savePointOk, skipPoint } from "@/db/repositories/patrolRepository";
import { pointSubmissionError } from "@/domain/patrol/patrolRules";
import { restoreDeferredPointSelection } from "@/domain/patrol/pointDraftPolicy";
import { useAppTheme } from "@/features/settings/themePreference";
import { logMobileError } from "@/services/mobileErrorReporter";
import {
  attachPointPhotoFromCamera,
  attachPointPhotoSeriesFromCamera,
  attachPointMediaFromGallery,
  attachPointVideoFromCamera,
  deletePointAttachmentFile,
  replacePointPhotoFromCamera,
} from "@/services/mediaAttachmentService";
import { ActionSheet } from "@/ui/ActionSheet";
import { PersistentNotice } from "@/ui/PersistentNotice";
import { AttachmentViewer } from "./AttachmentViewer";
import { PointPhotoInstructionSlot } from "./PointPhotoInstructionSlot";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import type { MediaPreparationProgress } from "@/sync/fileUploadQueue";
import type { PointAttachment, SelectedStatus } from "./pointFillTypes";

const manualReasonOptions = ["Метка отсутствует", "Метка повреждена", "Не удаётся считать метку"].map(label => ({ id: label, label }));

export function PointFillScreen() {
  const styles = usePointStyles();
  const router = useRouter();
  const { colors } = useAppTheme();
  const { fontScale, width } = useWindowDimensions();
  const { assignmentId, pointId, manual } = useLocalSearchParams<{ assignmentId: string; pointId: string; manual?: string }>();
  const [point, setPoint] = useState<PointForFill | null>(null);
  const [manualReason, setManualReason] = useState("");
  const [manualOpen, setManualOpen] = useState(manual === "1");
  const [selectedStatus, setSelectedStatus] = useState<SelectedStatus | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [attachments, setAttachments] = useState<PointAttachment[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingBeforeLeave, setIsSavingBeforeLeave] = useState(false);
  const [hasPendingLeave, setHasPendingLeave] = useState(false);
  const [isMediaBusy, setIsMediaBusy] = useState(false);
  const [mediaFileLabel, setMediaFileLabel] = useState<string | null>(null);
  const [mediaNotice, setMediaNotice] = useState<string | null>(null);
  const [mediaProgress, setMediaProgress] = useState<number | null>(null);
  const [transitionPending, setTransitionPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noticeRevision, setNoticeRevision] = useState(0);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<"attachments" | "more" | null>(null);
  const [viewerFileId, setViewerFileId] = useState<string | null>(null);
  // Shown in the viewer only; the repository re-checks on every delete or replace.
  const [editBlocks, setEditBlocks] = useState<Record<string, string> | "loading" | "failed">("loading");
  const draftErrorRef = useRef<string | null>(null);
  const draftReadyRef = useRef(false);
  const finalizingRef = useRef(false);
  const savedRef = useRef(false);
  const loadVersion = useRef(0);
  const focused = useRef(false);
  const mediaOperation = useRef<object | null>(null);
  type Draft = { selectedStatus: SelectedStatus | null; comment: string; issueTypeId: string; photoClientFileIds: string[]; manualReason?: string };
  const scopeRef = useRef<DataOwnerContext | null>(null);
  const draftController = useRef<ReturnType<typeof createPointDraftController<Draft>> | null>(null);
  const leaving = useRef(false);
  const pendingLeaveAction = useRef<(() => void) | null>(null);
  const allowLeave = useRef(false);
  const navigation = useNavigation();
  const latestDraftRef = useRef<Draft>({ selectedStatus: null, comment: "", issueTypeId: "Неисправность", photoClientFileIds: [] });
  const recordDraft = useCallback((change: Partial<Draft>) => {
    latestDraftRef.current = { ...latestDraftRef.current, ...change };
    if (draftReadyRef.current && !finalizingRef.current) draftController.current?.update(latestDraftRef.current);
  }, []);
  const persistDraft = useCallback(async () => {
    if (!finalizingRef.current) await draftController.current?.flushUntilSettled();
  }, []);
  const flushDraft = persistDraft;
  // A draft error stays visible until it is dismissed or a later draft write succeeds.
  const showDraftError = useCallback((message: string) => { draftErrorRef.current = message; setError(message); }, []);
  const clearDraftError = useCallback(() => {
    const message = draftErrorRef.current;
    if (!message) return;
    draftErrorRef.current = null;
    setError(current => current === message ? null : current);
  }, []);
  const dismissError = useCallback(() => { draftErrorRef.current = null; setError(null); }, []);
  const refreshEditBlocks = useCallback(async (version: number) => {
    const scope = scopeRef.current;
    if (!scope) return;
    let blocks: Record<string, string> | "failed";
    try {
      blocks = await listPointAttachmentEditBlocks(assignmentId, pointId);
      await assertDataOwnerContext(scope);
    } catch {
      blocks = "failed";
    }
    if (focused.current && version === loadVersion.current && scopeRef.current === scope) setEditBlocks(blocks);
  }, [assignmentId, pointId]);
  const retryPendingLeave = useCallback(() => {
    const action = pendingLeaveAction.current;
    if (!action || leaving.current) return;
    const version = loadVersion.current;
    const scope = scopeRef.current;
    const isCurrent = () => focused.current && version === loadVersion.current && !!scope && scope.generation === getSessionGeneration();
    leaving.current = true;
    setIsSavingBeforeLeave(true);
    void draftController.current?.flushUntilSettled(() => {
      if (!isCurrent()) return;
      allowLeave.current = true;
      try { action(); } catch (caught) { allowLeave.current = false; throw caught; }
      pendingLeaveAction.current = null;
      setHasPendingLeave(false);
    }).catch(caught => { if (isCurrent()) setError(caught instanceof Error ? caught.message : "Не удалось сохранить. Повторите переход."); })
      .finally(() => { if (isCurrent()) { leaving.current = false; setIsSavingBeforeLeave(false); } });
  }, []);
  const requestLeave = useCallback((action: () => void) => {
    if (!draftReadyRef.current || savedRef.current || allowLeave.current) { action(); return; }
    if (finalizingRef.current) return;
    if (!pendingLeaveAction.current) pendingLeaveAction.current = action;
    setHasPendingLeave(true);
    retryPendingLeave();
  }, [retryPendingLeave]);
  usePreventRemove(!!point, ({ data }) => {
    requestLeave(() => navigation.dispatch(data.action));
  });
  useFocusEffect(useCallback(() => registerFormNavigationGuard(requestLeave), [requestLeave]));

  const reload = useCallback(async () => {
    const version = ++loadVersion.current;
    pendingLeaveAction.current = null;
    leaving.current = false;
    setIsSavingBeforeLeave(false);
    allowLeave.current = false;
    setHasPendingLeave(false);
    draftController.current?.close();
    draftController.current = null;
    draftReadyRef.current = false;
    finalizingRef.current = false;
    savedRef.current = false;
    setTransitionPending(false);
    setValidationAttempted(false);
    mediaOperation.current = null;
    setIsMediaBusy(false);
    setViewerFileId(null);
    setEditBlocks("loading");
    const scope = await captureDataOwnerContext();
    if (!focused.current || version !== loadVersion.current) return;
    scopeRef.current = scope;
    const [loaded, files] = await Promise.all([assertPointCanBeOpened(assignmentId, pointId), listPointFiles(assignmentId, pointId)]);
    await assertDataOwnerContext(scope);
    if (version !== loadVersion.current) return;
    setLoadError(null);
    setPoint(loaded);
    setComment(loaded?.comment ?? "");
    setManualReason(loaded?.manualReason ?? '');
    setManualOpen(needsManualInspectionReason(loaded));
    setAttachments(files.map(toPointAttachment));

    if (loaded?.status === "ok" || loaded?.status === "issue" || loaded?.status === "skipped") {
      setSelectedStatus(loaded.status);
      setDetailsOpen(true);
    } else if (loaded?.status === "deferred") {
      setSelectedStatus(restoreDeferredPointSelection(loaded));
      setDetailsOpen(!!restoreDeferredPointSelection(loaded));
    } else {
      setSelectedStatus(null);
      setDetailsOpen(false);
    }
    latestDraftRef.current = {
      selectedStatus: loaded?.status === 'deferred' ? restoreDeferredPointSelection(loaded) : loaded && ['ok','issue','skipped'].includes(loaded.status) ? loaded.status as SelectedStatus : null,
      comment: loaded?.comment ?? '', issueTypeId: loaded?.issueTypeId ?? 'Неисправность',
      photoClientFileIds: files.map(file => file.clientFileId),
      manualReason: loaded?.manualReason ?? undefined
    };
    draftController.current = createPointDraftController(async draft => {
      await assertDataOwnerContext(scope);
      await savePointDraft(assignmentId, pointId, draft, scope);
      clearDraftError();
    }, caught => showDraftError(caught instanceof Error ? caught.message : 'Не удалось сохранить черновик точки.'));
    draftReadyRef.current = Boolean(loaded);
    void refreshEditBlocks(version);
  }, [assignmentId, pointId, clearDraftError, refreshEditBlocks, showDraftError]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      focused.current = true;

      void reload().catch((caught) => {
        void logMobileError("patrol.point.load.failed", caught);
        if (isMounted) {
          setLoadError(caught instanceof Error ? caught.message : "Не удалось загрузить точку обхода.");
        }
      });

      return () => {
        isMounted = false;
        focused.current = false;
        loadVersion.current++;
        const controller = draftController.current;
        if (controller) {
          // Focus can be lost without React Navigation dispatching a remove
          // action (tabs and native camera do this). Drain the last revision
          // before invalidating the controller; an immediate close used to
          // cancel that write.
          void controller.flushUntilSettled()
            .catch((draftError) => { void logMobileError("patrol.point.draft.save.failed", draftError); })
            .finally(() => {
              if (draftController.current === controller) controller.close();
            });
        }
      };
    }, [reload])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        void flushDraft().catch((draftError) => {
          void logMobileError("patrol.point.draft.save.failed", draftError);
        });
      }
    });

    return () => subscription.remove();
  }, [flushDraft]);

  function selectStatus(status: SelectedStatus) {
    if (finalizingRef.current || savedRef.current) return;
    recordDraft({ selectedStatus: status });
    setSelectedStatus(status);
    setDetailsOpen(true);
    setError(null);
    setValidationAttempted(false);
  }


  async function handleSave() {
    if (savedRef.current && transitionPending) {
      await retrySavedTransition();
      return;
    }
    if (finalizingRef.current) return;
    const scope = scopeRef.current;
    if (!scope) return;
    const version = loadVersion.current;
    const controller = draftController.current;
    const isCurrent = () => focused.current && version === loadVersion.current && scope.generation === getSessionGeneration();
    const { selectedStatus, comment, issueTypeId } = latestDraftRef.current;
    setError(null);
    setValidationAttempted(true);
    setNoticeRevision(value => value + 1);
    const submissionError = pointSubmissionError(selectedStatus, comment, Boolean(point?.requiresPhoto), hasPhotoAttachment(attachments));
    if (submissionError) {
      setError(submissionError);
      return;
    }

    finalizingRef.current = true;
    setIsSubmitting(true);
    let pointSaved = false;
    try {
      await controller?.pause();
      await assertDataOwnerContext(scope);
      if (!isCurrent()) return;
      if (selectedStatus === "issue") {
        await savePointIssue(assignmentId, pointId, comment.trim(), issueTypeId.trim() || "Неисправность");
      } else if (selectedStatus === "skipped") {
        await skipPoint(assignmentId, pointId, {
          comment: comment.trim(),
          photoClientFileIds: attachments.map((attachment) => attachment.clientFileId)
        });
      } else {
        await savePointOk(assignmentId, pointId, comment.trim());
      }
      pointSaved = true;
      controller?.close();
      if (!isCurrent()) return;
      savedRef.current = true;
      await continuePatrolFlow(scope, version);
    } catch {
      if (!isCurrent()) return;
      if (!pointSaved) {
        finalizingRef.current = false;
        draftController.current?.resume();
        void persistDraft().catch((draftError) => { void logMobileError("patrol.point.draft.save.failed", draftError); });
      } else {
        // The point is already persisted. Keep the action idempotent and let
        // the employee retry only navigation, never the point command.
        finalizingRef.current = false;
        setTransitionPending(true);
      }
      setError(pointSaved ? "Метка сохранена, но переход к следующей точке не выполнен." : "Не удалось сохранить метку.");
    } finally {
      if (isCurrent()) setIsSubmitting(false);
    }
  }
  async function handleDefer() {
    if (savedRef.current && transitionPending) {
      await retrySavedTransition();
      return;
    }
    if (finalizingRef.current) return;
    const scope = scopeRef.current;
    if (!scope) return;
    const version = loadVersion.current;
    const controller = draftController.current;
    const isCurrent = () => focused.current && version === loadVersion.current && scope.generation === getSessionGeneration();
    const { selectedStatus, comment, issueTypeId } = latestDraftRef.current;
    setError(null);
    finalizingRef.current = true;
    setIsSubmitting(true);
    let deferred = false;
    try {
      await controller?.pause();
      await assertDataOwnerContext(scope);
      if (!isCurrent()) return;
      await deferPoint(assignmentId, pointId, {
        selectedStatus,
        comment: comment.trim(),
        issueTypeId: issueTypeId.trim() || "Неисправность",
        photoClientFileIds: attachments.map((attachment) => attachment.clientFileId)
      });
      deferred = true;
      controller?.close();
      if (!isCurrent()) return;
      savedRef.current = true;
      await continuePatrolFlow(scope, version);
    } catch {
      if (!isCurrent()) return;
      if (!deferred) {
        finalizingRef.current = false;
        draftController.current?.resume();
        void persistDraft().catch((draftError) => { void logMobileError("patrol.point.draft.save.failed", draftError); });
      } else {
        finalizingRef.current = false;
        setTransitionPending(true);
      }
      setError(deferred ? "Точка отложена, но переход к следующей точке не выполнен." : "Не удалось отложить метку.");
    } finally {
      if (isCurrent()) setIsSubmitting(false);
    }
  }

  async function retrySavedTransition() {
    if (!savedRef.current || finalizingRef.current) return;
    const scope = scopeRef.current;
    if (!scope) return;
    const version = loadVersion.current;
    const isCurrent = () => focused.current && version === loadVersion.current && scope.generation === getSessionGeneration();
    finalizingRef.current = true;
    setIsSubmitting(true);
    setError(null);
    try {
      await continuePatrolFlow(scope, version);
      if (isCurrent()) setTransitionPending(false);
    } catch (caught) {
      if (!isCurrent()) return;
      setTransitionPending(true);
      setError(caught instanceof Error ? caught.message : "Метка сохранена, но переход не выполнен. Повторите переход.");
    } finally {
      if (isCurrent()) { finalizingRef.current = false; setIsSubmitting(false); }
    }
  }
  type MediaContext = { scope: DataOwnerContext; version: number; isCurrent: () => boolean; progress: (value: MediaPreparationProgress) => void };
  /** One media operation at a time: the latest draft is saved first and stale sessions never publish results. */
  async function runMediaOperation(run: (context: MediaContext) => Promise<void>, failure: string) {
    if (mediaOperation.current || finalizingRef.current || savedRef.current || pendingLeaveAction.current) return;
    const scope = scopeRef.current;
    if (!scope) return;
    const operation = {};
    const version = loadVersion.current;
    const isCurrent = () => focused.current && loadVersion.current === version && scopeRef.current === scope && mediaOperation.current === operation;
    mediaOperation.current = operation;
    setError(null);
    setIsMediaBusy(true);
    setMediaProgress(null);
    setMediaFileLabel(null);
    setMediaNotice(null);
    const progress = ({ progress, fileIndex, fileCount }: MediaPreparationProgress) => { if (isCurrent()) { setMediaProgress(progress); setMediaFileLabel(fileIndex && fileCount ? `Файл ${fileIndex} из ${fileCount}` : "Файл"); } };
    try {
      await flushDraft();
      await assertDataOwnerContext(scope);
      if (!isCurrent()) return;
      await run({ scope, version, isCurrent, progress });
    } catch (caught) {
      if (isCurrent()) setError(caught instanceof Error ? caught.message : failure);
    } finally {
      if (isCurrent()) { setIsMediaBusy(false); setMediaProgress(null); }
      if (mediaOperation.current === operation) mediaOperation.current = null;
    }
  }
  async function addMedia(kind: "photo" | "video" | "gallery") {
    await runMediaOperation(async ({ scope, version, isCurrent, progress }) => {
      const result = kind === "photo" ? await attachPointPhotoFromCamera(assignmentId, pointId, progress)
        : kind === "video" ? await attachPointVideoFromCamera(assignmentId, pointId, progress)
        : await attachPointMediaFromGallery(assignmentId, pointId, progress);
      await assertDataOwnerContext(scope);
      if (!isCurrent()) return;
      if (result === "attached" || (typeof result === "object" && result.status === "attached")) {
        await reloadPointAndAttachments(scope, version);
        if (isCurrent()) setMediaNotice(typeof result === "object" ? `Прикреплено: фото ${result.photoCount}, видео ${result.videoCount}` : kind === "video" ? "Видео прикреплено" : "Фото прикреплено");
      }
      if (isCurrent() && typeof result === "object" && result.errors.length) setError(`Добавлено: ${result.attachedCount}. Не удалось: ${result.errors.length}. ${result.errors[0]}`);
    }, "Не удалось добавить вложение.");
  }
  async function addPhotoSeries() {
    await runMediaOperation(async ({ scope, version, isCurrent, progress }) => {
      const series = await attachPointPhotoSeriesFromCamera(assignmentId, pointId, {
        shouldContinue: isCurrent,
        onProgress: progress,
        // Each photo is shown before the camera opens again.
        onPhotoAttached: async () => {
          if (!isCurrent()) return;
          await reloadPointAndAttachments(scope, version);
          await flushDraft();
        }
      });
      await assertDataOwnerContext(scope);
      if (!isCurrent()) return;
      if (series.attachedCount > 0) setMediaNotice(`Серия: добавлено фото ${series.attachedCount}`);
      if (series.error) setError(`Добавлено фото: ${series.attachedCount}. Следующее не сохранено: ${series.error}`);
    }, "Не удалось добавить фото.");
  }
  async function deleteAttachment(attachment: PointAttachment) {
    await runMediaOperation(async ({ scope, version, isCurrent }) => {
      await deletePointAttachmentFile(assignmentId, pointId, attachment.clientFileId);
      await assertDataOwnerContext(scope);
      if (!isCurrent()) return;
      setViewerFileId(null);
      await reloadPointAndAttachments(scope, version);
      if (isCurrent()) setMediaNotice(attachment.mediaKind === "video" ? "Видео удалено" : "Фото удалено");
    }, "Не удалось удалить вложение.");
  }
  async function replaceAttachment(attachment: PointAttachment) {
    await runMediaOperation(async ({ scope, version, isCurrent, progress }) => {
      const result = await replacePointPhotoFromCamera(assignmentId, pointId, attachment.clientFileId, progress);
      await assertDataOwnerContext(scope);
      if (!isCurrent() || result !== "attached") return;
      setViewerFileId(null);
      await reloadPointAndAttachments(scope, version);
      if (isCurrent()) setMediaNotice("Фото заменено");
    }, "Не удалось заменить фото.");
  }
  const handleAddPhoto = () => addMedia("photo");
  const handleAddVideo = () => addMedia("video");
  const handleAddFromGallery = () => addMedia("gallery");

  async function continuePatrolFlow(scope: DataOwnerContext, version: number) {
    if (!focused.current || version !== loadVersion.current) return;
    await assertDataOwnerContext(scope);
    const [readiness, scanPolicy] = await Promise.all([
      getReportReadiness(assignmentId),
      getAssignmentScanPolicy(assignmentId)
    ]);
    await assertDataOwnerContext(scope);
    if (!focused.current || version !== loadVersion.current) return;
    router.replace(readiness.ready
      ? `/patrol/assignment/${assignmentId}/submit`
      : scanPolicy.nfcEnabled
        ? `/patrol/assignment/${assignmentId}/scan-nfc`
        : scanPolicy.qrFallbackEnabled
          ? `/patrol/assignment/${assignmentId}/scan-qr`
          : `/patrol/assignment/${assignmentId}/all-points`);
  }

  async function reloadPointAndAttachments(scope: DataOwnerContext, version: number) {
    await assertDataOwnerContext(scope);
    const [updatedPoint, files] = await Promise.all([
      getPointForFill(assignmentId, pointId, scope.ownerUserId, scope.contourId), listPointFiles(assignmentId, pointId)
    ]);
    await assertDataOwnerContext(scope);
    if (!focused.current || version !== loadVersion.current) return;
    setPoint(updatedPoint);
    setAttachments(files.map(toPointAttachment));
    recordDraft({ photoClientFileIds: files.map(file => file.clientFileId) });
    await refreshEditBlocks(version);
  }

  useFocusEffect(useCallback(() => {
    let active = true;
    let request = 0;
    let running = false;
    let dirty = false;
    const refresh = () => {
      if (!active || running) return;
      running = true;
      void Promise.resolve().then(async () => {
        dirty = false;
        if (!active || !focused.current) return;
        const scope = scopeRef.current;
        const version = loadVersion.current;
        const currentRequest = request;
        if (!scope) return;
        await assertDataOwnerContext(scope);
        const files = await listPointFiles(assignmentId, pointId);
        await assertDataOwnerContext(scope);
        if (active && focused.current && currentRequest === request && version === loadVersion.current) {
          setAttachments(files.map(toPointAttachment));
          // An upload that started meanwhile makes its attachment read-only.
          await refreshEditBlocks(version);
        }
      }).catch(() => { /* A later event or focus retries a failed local read. */ }).finally(() => {
        running = false;
        if (active && dirty) refresh();
      });
    };
    const unsubscribe = subscribeToSyncEvents(event => {
      if (!event.deliveryChangedAssignmentIds?.includes(assignmentId) && !event.changedAssignmentIds?.includes(assignmentId) && !event.completedAssignmentIds.includes(assignmentId)) return;
      request++;
      dirty = true;
      refresh();
    });
    return () => { active = false; unsubscribe(); };
  }, [assignmentId, pointId, refreshEditBlocks]));

  const viewerAttachment = attachments.find(attachment => attachment.clientFileId === viewerFileId) ?? null;
  const viewerBlockReason = (clientFileId: string) => transitionPending || isSubmitting
    ? "Метка сохраняется. Вложения можно изменить после сохранения."
    : editBlocks === "loading" ? "Проверяем, отправлено ли вложение…"
      : editBlocks === "failed" ? "Не удалось проверить, отправлено ли вложение. Закройте просмотр и откройте снова."
        : editBlocks[clientFileId] ?? null;

  if (loadError) {
    return (
      <Screen title="Заполнение метки" subtitle="Статус, комментарий и вложения точки.">
        <Card>
          <Text style={[styles.text, { color: colors.danger }]}>{loadError}</Text>
          <PrimaryButton icon="refresh-outline" label="Повторить загрузку" onPress={() => void reload()} variant="secondary" />
        </Card>
      </Screen>
    );
  }
  if (!point) {
    return (
      <Screen title="Заполнение метки" subtitle="Статус, комментарий и вложения точки.">
        <Card>
          <Text style={[styles.text, { color: colors.mutedText }]}>Точка не найдена на телефоне.</Text>
        </Card>
      </Screen>
    );
  }

  if (manualOpen) {
    return <Screen compactHeader scroll={false} title="Осмотр без NFC">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end", paddingTop: 16 }}>
        <View style={{ alignItems: "center", gap: 10, padding: 24 }}>
          <Text style={{ color: colors.mutedText, fontSize: 16 }}>{point.name}</Text>
          <View style={{ width: 96, height: 96, borderRadius: 32, alignItems: "center", justifyContent: "center", backgroundColor: colors.warningSurface }}><Ionicons name="pricetag-outline" size={48} color={colors.warning} /></View>
        </View>
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, gap: 14, borderWidth: 1, borderColor: colors.cardBorder, shadowColor: colors.shadow, shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: -8 }, elevation: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text accessibilityRole="header" style={[font(800), { flex: 1, fontSize: 22, color: colors.text }]}>Метка недоступна</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Закрыть причину недоступности метки" disabled={isSubmitting} onPress={() => router.back()} style={{ minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="close-outline" size={24} color={colors.text} />
            </Pressable>
          </View>
          <Text style={{ color: colors.mutedText, fontSize: 16, lineHeight: 24 }}>Укажите причину, затем осмотрите объект без NFC.</Text>
          {isSavingBeforeLeave ? <StatusMessage message="Сохраняем последние изменения…" /> : null}
          {hasPendingLeave && !isSavingBeforeLeave ? <PrimaryButton label="Повторить сохранение" onPress={retryPendingLeave} variant="secondary" /> : null}
          <SelectField label="Причина *" disabled={isSubmitting}
            options={[...manualReasonOptions, { id: "other", label: "Другая причина" }]}
            selectedId={manualReasonOptions.some(option => option.id === manualReason) ? manualReason : manualReason ? "other" : ""}
            onSelect={value => { const reason = value === "other" ? "" : value; recordDraft({ manualReason: reason }); setManualReason(reason); }} />
          {!manualReasonOptions.some(option => option.id === manualReason) ? <TextInput accessibilityLabel="Причина недоступности NFC" value={manualReason} onChangeText={value => { recordDraft({ manualReason: value }); setManualReason(value); }}
            placeholder="Опишите причину" maxLength={120} style={[styles.input, { color: colors.text }]} /> : null}
        {error ? <StatusMessage message={error} tone="danger" /> : null}
        <PrimaryButton testID="point-manual-continue" label="Продолжить" loading={isSubmitting} disabled={!manualReason.trim() || isSubmitting} onPress={() => {
          if (finalizingRef.current) return;
          finalizingRef.current = true;
          setIsSubmitting(true);
          void (async () => {
            await draftController.current?.pause();
            if (scopeRef.current) await assertDataOwnerContext(scopeRef.current);
            await beginManualPointInspection(assignmentId, pointId, latestDraftRef.current.manualReason ?? manualReason);
            await reload(); setManualOpen(false);
          })().catch((e) => { draftController.current?.resume(); setError(e instanceof Error ? e.message : "Не удалось сохранить причину"); })
            .finally(() => { finalizingRef.current = false; setIsSubmitting(false); });
        }} />
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </Screen>;
  }

  return (
    <Screen
      compactHeader
      contentContainerStyle={!detailsOpen ? styles.statusScreen : undefined}
      floatingNotice={<View pointerEvents="box-none" style={styles.notices}>
        <PersistentNotice message={error} onDismiss={dismissError} />
        <TransientNotice key={noticeRevision} message={mediaNotice} />
      </View>}
      bottomActionBackground="transparent"
      bottomAction={detailsOpen ? <PrimaryButton testID="point-save" disabled={isSubmitting || isMediaBusy || hasPendingLeave || (!selectedStatus && !transitionPending)} disabledReason={!selectedStatus ? "Выберите результат осмотра" : undefined} icon="save-outline" loading={isSubmitting} label={transitionPending ? "Повторить переход" : "Сохранить и продолжить"} onPress={transitionPending ? () => void retrySavedTransition() : handleSave} size="large" /> : undefined}
      title=""
    >
      <View style={styles.row}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text, flex: 1 }]}>Метка — {point.name}</Text>
        <Text accessibilityLabel={`Метка номер ${point.orderIndex}`} style={{ color: colors.mutedText, fontSize: 18 }}>{point.orderIndex}</Text>
      </View>
      {!detailsOpen ? <View style={styles.statusCenter}><View accessibilityRole="radiogroup" accessibilityLabel="Результат осмотра" style={[styles.statusGrid, (fontScale > 1.3 || width < 350) && styles.statusStack]}>
        {inspectionChoices.filter(choice => choice.status !== "skipped").map(choice => <StatusButton key={choice.status} testID={`point-status-${choice.status}`} label={choice.label}
          tone={choice.tone} selected={selectedStatus === choice.status} disabled={isSubmitting || transitionPending}
          stacked={fontScale > 1.3 || width < 350} wrap={false} onPress={() => selectStatus(choice.status)} />)}
      </View></View> : <>
      <View style={styles.row}><Pressable accessibilityRole="button" accessibilityLabel="Изменить статус" disabled={isSubmitting || transitionPending || hasPendingLeave}
        onPress={() => setDetailsOpen(false)} style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons name="chevron-back" size={18} color={colors.primary} />
        <Text style={{ color: selectedStatus === "issue" ? colors.danger : selectedStatus === "skipped" ? colors.warning : colors.success, fontSize: 14 }}>{selectedStatus === "issue" ? "Неисправно" : selectedStatus === "skipped" ? "Не осмотрено" : "Исправно"} · Изменить</Text>
      </Pressable><Pressable accessibilityRole="button" accessibilityLabel="Дополнительные действия" disabled={isSubmitting || transitionPending || hasPendingLeave} onPress={() => setOpenMenu("more")} style={styles.moreButton}><Ionicons name="ellipsis-horizontal" size={22} color={colors.primary} /></Pressable></View>
      <PointGuidanceCard
        description={point.description}
        instruction={point.instruction}
        mutedColor={colors.mutedText}
        textColor={colors.text}
      />
      <PointPhotoInstructionSlot instruction={point.photoInstruction} />

      <Card>
        <View style={styles.field}>
          <Text style={{ color: colors.mutedText, fontSize: 14 }}>Результат осмотра</Text>
          <TextInput
            testID="point-comment"
            accessibilityLabel="Результат осмотра"
            editable={!isSubmitting && !transitionPending} multiline
            onBlur={() => void flushDraft().catch(() => showDraftError("Не удалось сохранить черновик точки."))}
            onChangeText={value => { recordDraft({ comment: value }); setComment(value); }}
            placeholder="Описание результатов осмотра оборудования" style={[styles.input, styles.textArea]} textAlignVertical="top" value={comment} />
          {validationAttempted && (selectedStatus === "issue" || selectedStatus === "skipped") && !comment.trim() ? <Text accessibilityRole="alert" style={styles.error}>{selectedStatus === "issue" ? "Опишите неисправность." : "Укажите, почему осмотр невозможен."}</Text> : null}
        </View>
      </Card>

      <Card>
        <View style={styles.photoHeader}>
          <Text style={[styles.label, { color: colors.text }]}>Фото и видео</Text>
          <Text style={styles.photoNote}>Необязательно</Text>
        </View>
        {attachments.length > 0 ? (
          <View style={styles.photoGrid}>
            {attachments.map((attachment) => (
              <Pressable key={attachment.clientFileId} style={styles.photoTile} accessibilityRole="button" accessibilityHint="Открыть на весь экран"
                accessibilityLabel={`${attachment.mediaKind === 'video' ? 'Видео' : 'Фото'}. ${fileStatusLabel(attachment.status)}`}
                disabled={isMediaBusy} onPress={() => { setViewerFileId(attachment.clientFileId); void refreshEditBlocks(loadVersion.current); }}>
                {attachment.mediaKind === "video" ? (
                  <View style={styles.videoTile}>
                    <Ionicons color={colors.primary} name="videocam-outline" size={24} />
                    <Text style={styles.videoLabel}>Видео</Text>
                  </View>
                ) : (
                  <Image source={{ uri: attachment.localPath }} style={styles.photo} />
                )}
                {attachment.status === 'failed' || attachment.status === 'retryLater' ? (
                  <Text style={[styles.photoStatus, { color: colors.danger }]}>Не отправлено</Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.emptyPhotoBox}>
            <Text style={styles.photoNote}>Вложения пока не добавлены</Text>
          </View>
        )}
        {attachments.length > 0 ? (
          <Text style={styles.photoNote}>
            Фото: {attachments.filter((item) => item.mediaKind !== "video").length} · Видео: {attachments.filter((item) => item.mediaKind === "video").length}
          </Text>
        ) : null}
        {isMediaBusy ? (
          <View style={styles.mediaProgress}>
            <ActivityIndicator />
            <Text style={styles.photoNote}>
              {mediaProgress === null ? "Открываем выбор или камеру…" : `${mediaFileLabel ?? "Файл"} · Подготовка ${Math.round(mediaProgress * 100)}%`}
            </Text>
          </View>
        ) : null}
        {isMediaBusy && mediaProgress !== null ? <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(mediaProgress * 100) }} style={{ height: 4, borderRadius: 2, backgroundColor: colors.border }}><View style={{ height: 4, borderRadius: 2, width: `${Math.round(mediaProgress * 100)}%`, backgroundColor: colors.primary }} /></View> : null}
        <PrimaryButton disabled={isSubmitting || transitionPending || isMediaBusy || hasPendingLeave} icon="attach-outline" label="Добавить фото или видео" onPress={() => setOpenMenu("attachments")} variant="secondary" />
      </Card>

      </>}
      {hasPendingLeave && !isSavingBeforeLeave ? <PrimaryButton label="Повторить сохранение" onPress={retryPendingLeave} variant="secondary" /> : null}
      {isSubmitting ? <ActivityIndicator /> : null}
      {isSavingBeforeLeave ? <Text accessibilityLiveRegion="polite" style={styles.savingNotice}>Сохраняем последние изменения…</Text> : null}
      <ActionSheet
        actions={openMenu === "attachments" ? [
          { label: "Сделать фото", icon: "camera-outline", onPress: () => void handleAddPhoto() },
          { label: "Серия фото подряд", icon: "albums-outline", onPress: () => void addPhotoSeries() },
          { label: "Снять видео", icon: "videocam-outline", onPress: () => void handleAddVideo() },
          { label: "Выбрать фото и видео с телефона", icon: "images-outline", onPress: () => void handleAddFromGallery() }
        ] : [
          { label: 'Сменить маршрут', icon: 'swap-horizontal-outline', onPress: () => router.replace(`/patrol/assignment/${assignmentId}/switch` as never) },
          { label: "Отложить точку", icon: "time-outline", danger: true, onPress: () => void handleDefer() }
        ]}
        onClose={() => setOpenMenu(null)}
        title={openMenu === "attachments" ? "Добавить фото или видео" : "Действия с точкой"}
        visible={openMenu !== null}
      />
      {viewerAttachment ? <AttachmentViewer
        attachment={viewerAttachment}
        blockReason={viewerBlockReason(viewerAttachment.clientFileId)}
        busy={isMediaBusy}
        error={error}
        onDismissError={dismissError}
        onClose={() => setViewerFileId(null)}
        onDelete={attachment => void deleteAttachment(attachment)}
        onReplace={attachment => void replaceAttachment(attachment)}
      /> : null}
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

function StatusButton({ testID, label, tone, selected, disabled, stacked, wrap, onPress }: {
  testID?: string; label: string; tone: "success" | "danger" | "warning"; selected: boolean; disabled: boolean; stacked: boolean; wrap: boolean; onPress: () => void;
}) {
  const styles = usePointStyles();
  const { colors } = useAppTheme();
  return <Pressable testID={testID} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: selected, disabled }}
    disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.statusButton, stacked && styles.statusButtonStack,
      wrap && { flexGrow: 1, flexBasis: tone === 'warning' ? '100%' : '45%' },
      { backgroundColor: colors[`${tone}Surface`], borderColor: selected ? colors[tone] : colors[`${tone}Surface`], opacity: disabled ? 0.55 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
    <View style={[styles.statusIcon, { backgroundColor: toneFill(colors, tone), shadowColor: toneFill(colors, tone) }]}>
      <Ionicons color={colors.onAccent} name={tone === "success" ? "checkmark" : tone === "danger" ? "alert" : "eye-off-outline"} size={34} />
    </View>
    <Text textBreakStrategy="simple" style={[styles.statusText, font(800), { color: colors[tone] }]}>{!stacked && label === "Осмотр невозможен" ? "Осмотр\nневозможен" : label}</Text>
  </Pressable>;
}

function fileStatusLabel(status: string) {
  switch (status) {
    case "uploaded":
    case "linked":
    case "deletedAfterRetention":
      return "Прикреплено · на сервере";
    case "uploading":
      return "Прикреплено · отправляется";
    case "retryLater":
    case "failed":
      return "Прикреплено · ожидает повтор";
    default:
      return "Прикреплено · на телефоне";
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

function usePointStyles() {
  const { colors } = useAppTheme();
  return useMemo(() => createStyles(colors), [colors]);
}
const createStyles = (colors: ThemeColors) => StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  title: {
    flex: 1,
    fontSize: 22,
    fontFamily: "Manrope_800ExtraBold",
    letterSpacing: -0.3,
    lineHeight: 28
  },
  text: {
    fontSize: 16,
    lineHeight: 21
  },
  scanMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7
  },
  scanMetaText: {
    flex: 1,
    fontSize: 14, lineHeight: 20, color: colors.mutedText
  },
  field: { gap: 8 },
  label: { color: colors.text, fontSize: 16, lineHeight: 22, fontFamily: "Manrope_700Bold" },
  input: {
    borderColor: colors.cardBorder,
    borderRadius: 14,
    borderWidth: 1.5,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  textArea: {
    minHeight: 110
  },
  statusScreen: { flexGrow: 1 },
  statusCenter: { flexGrow: 1, justifyContent: "center", alignItems: "center", paddingVertical: 24 },
  statusGrid: { width: "100%", maxWidth: 560, flexDirection: "row", alignItems: "stretch", gap: 12 },
  statusStack: { flexDirection: "column" },
  statusButton: { flex: 1, minHeight: 156, alignItems: "center", justifyContent: "center", gap: 16, borderRadius: 24, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 24 },
  statusButtonStack: { flex: 0, minHeight: 120, flexDirection: "row", paddingHorizontal: 20 },
  statusIcon: { width: 64, height: 64, borderRadius: 22, alignItems: "center", justifyContent: "center", shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
  statusText: { flexShrink: 1, fontSize: 20, lineHeight: 26, textAlign: "center" },
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
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20
  },
  photoHeader: {
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  emptyPhotoBox: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 12,
    borderStyle: "dashed",
    borderWidth: 1,
    minHeight: 40,
    padding: 8,
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
    backgroundColor: colors.backgroundAccent,
    width: "100%"
  },
  photoSource: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20
  },
  photoStatus: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20
  },
  videoTile: {
    alignItems: "center",
    aspectRatio: 1,
    backgroundColor: colors.backgroundAccent,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    width: "100%"
  },
  videoLabel: {
    color: colors.primary,
    fontSize: 14,
    fontFamily: "Manrope_800ExtraBold",
    marginTop: 4
  },
  bottomActions: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  savingNotice: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20,
    marginRight: 8
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
    fontFamily: "Manrope_800ExtraBold"
  },
  moreButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 48
  },
  notices: { gap: 8 },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20
  }
});
