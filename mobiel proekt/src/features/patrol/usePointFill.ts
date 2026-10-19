import { subscribeToSyncEvents } from "@/sync/syncEvents";
import { needsManualInspectionReason } from "./pointInspectionPresentation";
import { useNavigation, usePreventRemove } from 'expo-router/react-navigation';
import { createPointDraftController } from '@/services/pointDraftController';
import { registerFormNavigationGuard } from '@/services/formNavigationGuard';
import { getSessionGeneration } from '@/auth/sessionGeneration';
import { captureDataOwnerContext, assertDataOwnerContext, type DataOwnerContext } from '@/auth/dataOwnerContext';
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { listPointFiles } from "@/db/repositories/filesRepository";
import { beginManualPointInspection, assertPointCanBeOpened, deferPoint, getAssignmentScanPolicy, getPointForFill, getReportReadiness, listPointAttachmentEditBlocks, PointForFill, savePointDraft, savePointIssue, savePointOk, skipPoint } from "@/db/repositories/patrolRepository";
import { pointSubmissionError } from "@/domain/patrol/patrolRules";
import { restoreDeferredPointSelection } from "@/domain/patrol/pointDraftPolicy";
import { logMobileError } from "@/services/mobileErrorReporter";
import {
  attachPointPhotoFromCamera,
  attachPointPhotoSeriesFromCamera,
  attachPointMediaFromGallery,
  attachPointVideoFromCamera,
  deletePointAttachmentFile,
  replacePointPhotoFromCamera,
} from "@/services/mediaAttachmentService";
import type { MediaPreparationProgress } from "@/sync/fileUploadQueue";
import type { PointAttachment, SelectedStatus } from "./pointFillTypes";
import { appendDictatedText } from "./pointVoiceDictation";

type Draft = { selectedStatus: SelectedStatus | null; comment: string; issueTypeId: string; photoClientFileIds: string[]; manualReason?: string };
type MediaContext = { scope: DataOwnerContext; version: number; isCurrent: () => boolean; progress: (value: MediaPreparationProgress) => void };
export type PointFillMenu = "attachments" | "more" | null;

/**
 * State of the point form: loading, draft autosave, result selection, media,
 * the «Метка недоступна» reason step and the leave/save guards. Every async
 * step checks the focus session and account generation it started in, so a
 * stale result never writes a draft or navigates the next session.
 */
export function usePointFill() {
  const router = useRouter();
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
  const [openMenu, setOpenMenu] = useState<PointFillMenu>(null);
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

  function changeComment(value: string) {
    recordDraft({ comment: value });
    setComment(value);
  }

  /** Dictated text is appended to the newest comment revision, never to a stale render. */
  function appendComment(addition: string) {
    if (finalizingRef.current || savedRef.current) return;
    const next = appendDictatedText(latestDraftRef.current.comment, addition);
    if (next === latestDraftRef.current.comment) return;
    changeComment(next);
  }

  function flushCommentDraft() {
    void flushDraft().catch(() => showDraftError("Не удалось сохранить черновик точки."));
  }

  function changeManualReason(reason: string) {
    recordDraft({ manualReason: reason });
    setManualReason(reason);
  }

  function continueManual() {
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

  function openViewer(clientFileId: string) {
    setViewerFileId(clientFileId);
    void refreshEditBlocks(loadVersion.current);
  }

  return {
    assignmentId,
    point,
    loadError,
    reload,
    // «Метка недоступна» reason step
    manualOpen,
    manualReason,
    changeManualReason,
    continueManual,
    closeManual: () => router.back(),
    // result and comment
    detailsOpen,
    reopenStatusChoice: () => setDetailsOpen(false),
    selectedStatus,
    selectStatus,
    comment,
    changeComment,
    appendComment,
    flushCommentDraft,
    validationAttempted,
    // media
    attachments,
    isMediaBusy,
    mediaProgress,
    mediaFileLabel,
    mediaNotice,
    addPhoto: () => addMedia("photo"),
    addVideo: () => addMedia("video"),
    addFromGallery: () => addMedia("gallery"),
    addPhotoSeries,
    deleteAttachment,
    replaceAttachment,
    viewerAttachment,
    viewerBlockReason,
    openViewer,
    closeViewer: () => setViewerFileId(null),
    // menus
    openMenu,
    setOpenMenu,
    switchRoute: () => router.replace(`/patrol/assignment/${assignmentId}/switch` as never),
    // save, defer and leave guards
    isSubmitting,
    transitionPending,
    handleSave,
    handleDefer,
    retrySavedTransition,
    isSavingBeforeLeave,
    hasPendingLeave,
    retryPendingLeave,
    error,
    dismissError,
    noticeRevision,
  };
}

export type PointFillState = ReturnType<typeof usePointFill>;

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
