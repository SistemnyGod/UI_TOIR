import { Ionicons } from "@expo/vector-icons";
import { useNavigation, usePreventRemove } from 'expo-router/react-navigation';
import { createPointDraftController } from '@/services/pointDraftController';
import { captureDataOwnerContext, assertDataOwnerContext, type DataOwnerContext } from '@/auth/dataOwnerContext';
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { currentContourId } from "@/core/environments";
import { listPointFiles } from "@/db/repositories/filesRepository";
import { beginManualPointInspection, assertPointCanBeOpened, deferPoint, getAssignmentScanPolicy, getPointForFill, getReportReadiness, PointForFill, savePointDraft, savePointIssue, savePointOk, skipPoint } from "@/db/repositories/patrolRepository";
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
  const { assignmentId, pointId, manual } = useLocalSearchParams<{ assignmentId: string; pointId: string; manual?: string }>();
  const [point, setPoint] = useState<PointForFill | null>(null);
  const [manualReason, setManualReason] = useState("");
  const [manualOpen, setManualOpen] = useState(manual === "1");
  const [phase, setPhase] = useState<FillPhase>("status");
  const [selectedStatus, setSelectedStatus] = useState<SelectedStatus | null>(null);
  const [comment, setComment] = useState("");
  const [issueTypeId, setIssueTypeId] = useState("Неисправность");
  const [attachments, setAttachments] = useState<PointAttachment[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingBeforeLeave, setIsSavingBeforeLeave] = useState(false);
  const [hasPendingLeave, setHasPendingLeave] = useState(false);
  const [isMediaBusy, setIsMediaBusy] = useState(false);
  const [mediaProgress, setMediaProgress] = useState<number | null>(null);
  const [transitionPending, setTransitionPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<"attachments" | "more" | null>(null);
  const draftReadyRef = useRef(false);
  const finalizingRef = useRef(false);
  const savedRef = useRef(false);
  const loadVersion = useRef(0);
  type Draft = { selectedStatus: SelectedStatus | null; comment: string; issueTypeId: string; photoClientFileIds: string[]; manualReason?: string };
  const scopeRef = useRef<DataOwnerContext | null>(null);
  const draftController = useRef<ReturnType<typeof createPointDraftController<Draft>> | null>(null);
  const leaving = useRef(false);
  const pendingLeaveAction = useRef<Parameters<typeof navigation.dispatch>[0] | null>(null);
  const navigation = useNavigation();
  const handleMediaProgress = useCallback(({ progress }: MediaPreparationProgress) => setMediaProgress(progress), []);
  const latestDraftRef = useRef<Draft>({ selectedStatus: null, comment: "", issueTypeId: "Неисправность", photoClientFileIds: [] });
  const recordDraft = useCallback((change: Partial<Draft>) => {
    latestDraftRef.current = { ...latestDraftRef.current, ...change };
    if (draftReadyRef.current && !finalizingRef.current) draftController.current?.update(latestDraftRef.current);
  }, []);
  const persistDraft = useCallback(async () => {
    if (!finalizingRef.current) await draftController.current?.flushUntilSettled();
  }, []);
  const flushDraft = persistDraft;
  const retryPendingLeave = useCallback(() => {
    const action = pendingLeaveAction.current;
    if (!action || leaving.current) return;
    leaving.current = true;
    setIsSavingBeforeLeave(true);
    void flushDraft().then(() => {
      pendingLeaveAction.current = null;
      setHasPendingLeave(false);
      navigation.dispatch(action);
    }).catch(caught => setError(caught instanceof Error ? caught.message : "Не удалось сохранить. Повторите переход."))
      .finally(() => { leaving.current = false; setIsSavingBeforeLeave(false); });
  }, [flushDraft, navigation]);
  usePreventRemove(!!point, ({ data }) => {
    if (savedRef.current) { navigation.dispatch(data.action); return; }
    if (finalizingRef.current) return;
    if (leaving.current) return;
    // The first requested destination is the employee's intent. Further
    // taps while SQLite is still saving must not silently replace it.
    if (!pendingLeaveAction.current) pendingLeaveAction.current = data.action;
    const action = pendingLeaveAction.current;
    setHasPendingLeave(true);
    leaving.current = true;
    setIsSavingBeforeLeave(true);
    void flushDraft().then(() => {
      pendingLeaveAction.current = null;
      setHasPendingLeave(false);
      navigation.dispatch(action);
    })
      .catch(caught => setError(caught instanceof Error ? caught.message : "Не удалось сохранить. Повторите переход."))
      .finally(() => { leaving.current = false; setIsSavingBeforeLeave(false); });
  });

  const reload = useCallback(async () => {
    const version = ++loadVersion.current;
    pendingLeaveAction.current = null;
    setHasPendingLeave(false);
    draftController.current?.close();
    draftReadyRef.current = false;
    finalizingRef.current = false;
    savedRef.current = false;
    setTransitionPending(false);
    const scope = await captureDataOwnerContext();
    scopeRef.current = scope;
    const ownerUserId = await getStoredOwnerUserId();
    if (!ownerUserId) {
      setPoint(null);
      setAttachments([]);
      return;
    }
    const [loaded, files] = await Promise.all([assertPointCanBeOpened(assignmentId, pointId), listPointFiles(assignmentId, pointId)]);
    await assertDataOwnerContext(scope);
    if (version !== loadVersion.current) return;
    setLoadError(null);
    setPoint(loaded);
    setComment(loaded?.comment ?? "");
    setManualReason(loaded?.manualReason ?? '');
    setIssueTypeId(loaded?.issueTypeId ?? "Неисправность");
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
    latestDraftRef.current = {
      selectedStatus: loaded?.status === 'deferred' ? restoreDeferredPointSelection(loaded) : loaded && ['ok','issue','skipped'].includes(loaded.status) ? loaded.status as SelectedStatus : null,
      comment: loaded?.comment ?? '', issueTypeId: loaded?.issueTypeId ?? 'Неисправность',
      photoClientFileIds: files.map(file => file.clientFileId),
      manualReason: loaded?.manualReason ?? undefined
    };
    draftController.current = createPointDraftController(async draft => {
      await assertDataOwnerContext(scope);
      if (draft.selectedStatus || draft.manualReason !== undefined) await savePointDraft(assignmentId, pointId, draft, scope);
    }, caught => setError(caught instanceof Error ? caught.message : 'Не удалось сохранить черновик точки.'));
    draftReadyRef.current = Boolean(loaded);
  }, [assignmentId, pointId]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      void reload().catch((caught) => {
        void logMobileError("patrol.point.load.failed", caught);
        if (isMounted) {
          setLoadError(caught instanceof Error ? caught.message : "Не удалось загрузить точку обхода.");
        }
      });

      return () => {
        isMounted = false;
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
    recordDraft({ selectedStatus: status });
    setSelectedStatus(status);
    setError(null);
    setPhase("details");
  }

  function handleSkipTag() {
    setManualOpen(true);
  }

  async function handleSave() {
    if (savedRef.current && transitionPending) {
      await retrySavedTransition();
      return;
    }
    if (finalizingRef.current) return;
    const { selectedStatus, comment, issueTypeId } = latestDraftRef.current;
    setError(null);
    if (!selectedStatus) {
      setPhase("status");
      return;
    }

    if (selectedStatus === "issue" && comment.trim().length === 0) {
      setError("Для неисправности нужен комментарий.");
      return;
    }

    if (selectedStatus === "skipped" && comment.trim().length === 0) {
      setError("Укажите, почему метка недоступна.");
      return;
    }

    if (isPhotoEvidenceRequired(Boolean(point?.requiresPhoto), selectedStatus) && !hasPhotoAttachment(attachments)) {
      setError("Для этой метки требуется фотофиксация.");
      return;
    }

    finalizingRef.current = true;
    setIsSubmitting(true);
    let pointSaved = false;
    try {
      await draftController.current?.pause();
      if (scopeRef.current) await assertDataOwnerContext(scopeRef.current);
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
      savedRef.current = true;
      draftController.current?.close();
      await continuePatrolFlow();
    } catch {
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
      setIsSubmitting(false);
    }
  }
  async function handleDefer() {
    if (savedRef.current && transitionPending) {
      await retrySavedTransition();
      return;
    }
    if (finalizingRef.current) return;
    const { selectedStatus, comment, issueTypeId } = latestDraftRef.current;
    setError(null);
    finalizingRef.current = true;
    setIsSubmitting(true);
    let deferred = false;
    try {
      await draftController.current?.pause();
      if (scopeRef.current) await assertDataOwnerContext(scopeRef.current);
      await deferPoint(assignmentId, pointId, {
        selectedStatus,
        comment: comment.trim(),
        issueTypeId: issueTypeId.trim() || "Неисправность",
        photoClientFileIds: attachments.map((attachment) => attachment.clientFileId)
      });
      deferred = true;
      savedRef.current = true;
      draftController.current?.close();
      await continuePatrolFlow();
    } catch {
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
      setIsSubmitting(false);
    }
  }

  async function retrySavedTransition() {
    if (!savedRef.current || finalizingRef.current) return;
    finalizingRef.current = true;
    setIsSubmitting(true);
    setError(null);
    try {
      await continuePatrolFlow();
      setTransitionPending(false);
    } catch (caught) {
      setTransitionPending(true);
      setError(caught instanceof Error ? caught.message : "Метка сохранена, но переход не выполнен. Повторите переход.");
    } finally {
      finalizingRef.current = false;
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
      setError(caught instanceof Error ? caught.message : "Не удалось добавить фото.");
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
      setError(caught instanceof Error ? caught.message : "Не удалось добавить видео.");
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
        setError(`Добавлено: ${result.attachedCount}. Не удалось: ${result.errors.length}. ${result.errors[0]}`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось добавить вложения.");
    } finally {
      setIsMediaBusy(false);
      setMediaProgress(null);
    }
  }

  async function continuePatrolFlow() {
    const [readiness, scanPolicy] = await Promise.all([
      getReportReadiness(assignmentId),
      getAssignmentScanPolicy(assignmentId)
    ]);
    if (scopeRef.current) await assertDataOwnerContext(scopeRef.current);
    router.replace(readiness.ready
      ? `/patrol/assignment/${assignmentId}/submit`
      : scanPolicy.nfcEnabled
        ? `/patrol/assignment/${assignmentId}/scan-nfc`
        : scanPolicy.qrFallbackEnabled
          ? `/patrol/assignment/${assignmentId}/scan-qr`
          : `/patrol/assignment/${assignmentId}/all-points`);
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
    recordDraft({ photoClientFileIds: files.map(file => file.clientFileId) });
  }

  if (loadError) {
    return (
      <Screen title="Заполнение метки" subtitle="Статус, комментарий и вложения точки.">
        <Card>
          <Text style={[styles.text, { color: "#b91c1c" }]}>{loadError}</Text>
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
    return <Screen title="Метка недоступна" subtitle="Укажите причину, затем осмотрите объект без NFC.">
      <Card>
        <Text style={{ color: colors.text }}>Почему нельзя считать метку?</Text>
        <TextInput accessibilityLabel="Причина недоступности NFC" value={manualReason} onChangeText={value => { recordDraft({ manualReason: value }); setManualReason(value); }}
          placeholder="Например: повреждена" maxLength={120} style={[styles.input, { color: colors.text }]} />
        {error ? <Text style={{ color: "#dc2626" }}>{error}</Text> : null}
        <PrimaryButton label="Перейти к осмотру" disabled={!manualReason.trim() || isSubmitting} onPress={() => {
          if (finalizingRef.current) return;
          finalizingRef.current = true;
          setIsSubmitting(true);
          void (async () => {
            await draftController.current?.pause();
            if (scopeRef.current) await assertDataOwnerContext(scopeRef.current);
            await beginManualPointInspection(assignmentId, pointId, latestDraftRef.current.manualReason ?? manualReason);
            await reload(); setPhase("status"); setManualOpen(false);
          })().catch((e) => { draftController.current?.resume(); setError(e instanceof Error ? e.message : "Не удалось сохранить причину"); })
            .finally(() => { finalizingRef.current = false; setIsSubmitting(false); });
        }} />
        <PrimaryButton label="Назад" variant="secondary" onPress={() => setManualOpen(false)} />
      </Card>
    </Screen>;
  }

  if (phase === "status") {
    return (
      <Screen title="Статус метки" subtitle="Выберите состояние объекта.">
        <Card>
          <View style={styles.row}>
            <Text style={[styles.title, { color: colors.text }]}>
              {point.orderIndex}. {point.name}
            </Text>
            <StatusPill label={confirmationLabel(point)} tone={point.confirmationType === "nfc" ? "success" : "neutral"} />
          </View>
          <View style={styles.scanMeta}>
            <Ionicons color={colors.mutedText} name="time-outline" size={17} />
            <Text style={[styles.scanMetaText, { color: colors.mutedText }]}>{point.confirmationType === "manual" ? `Без NFC: ${point.manualReason ?? "ручной осмотр"}` : `Сканирование: ${formatScanTime(point.scannedAtLocal)}`}</Text>
          </View>
        </Card>

        <PointGuidanceCard
          description={point.description}
          instruction={point.instruction}
          mutedColor={colors.mutedText}
          textColor={colors.text}
        />

        <View style={styles.statusGrid}>
          <StatusButton label="Исправно" description="Объект в нормальном состоянии" tone="success" onPress={() => selectStatus("ok")} />
          <StatusButton label="Неисправно" description="Найдена неисправность или отклонение" tone="danger" onPress={() => selectStatus("issue")} />
        </View>

        <Pressable accessibilityRole="button" onPress={() => selectStatus("skipped")} style={styles.uninspectableButton}>
          <Ionicons color="#b45309" name="eye-off-outline" size={24} />
          <View style={{ flex: 1 }}>
            <Text style={styles.skipTitle}>Осмотр невозможен</Text>
            <Text style={styles.skipDescription}>Оборудование недоступно. Укажите причину и приложите фото, если оно требуется.</Text>
          </View>
          <Ionicons color="#b45309" name="chevron-forward" size={18} />
        </Pressable>

        <Card style={styles.manualCloseCard}>
          <Text style={styles.manualCloseTitle}>Осмотр без NFC</Text>
          <Text style={styles.photoNote}>Если недоступна только метка, выберите «Метка недоступна», укажите причину и выполните обычный осмотр.</Text>
        </Card>

        <Pressable
          accessibilityLabel="Отметить метку как недоступную"
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
            <Text style={styles.skipTitle}>Осмотреть без NFC</Text>
            <Text style={styles.skipDescription}>Нет NFC/QR или метка утеряна</Text>
          </View>
          <Ionicons color="#b45309" name="chevron-forward" size={18} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.replace(`/patrol/assignment/${assignmentId}/all-points`)} style={styles.inlineLink}>
          <Ionicons color={colors.primary} name="list-outline" size={19} />
          <Text style={[styles.inlineLinkText, { color: colors.primary }]}>Все метки</Text>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen
      bottomAction={<PrimaryButton disabled={isSubmitting || isMediaBusy} icon="save-outline" label="Сохранить и продолжить" onPress={handleSave} size="large" />}
      title="Результат точки"
      subtitle="Заполните только необходимые сведения."
    >
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
          <Text style={[styles.label, { color: colors.text }]}>Осмотр невозможен</Text>
          <Text style={[styles.text, { color: colors.mutedText }]}>
            В отчёте будет указано, что оборудование не осмотрено, с указанной причиной.
          </Text>
        </Card>
      ) : null}

      {selectedStatus === "issue" ? (
        <Card>
          <Text style={[styles.label, { color: colors.text }]}>Тип неисправности</Text>
          <TextInput editable={!isSubmitting} onBlur={() => void flushDraft().catch(() => setError("Не удалось сохранить черновик точки."))} onChangeText={value => { recordDraft({ issueTypeId: value }); setIssueTypeId(value); }} style={styles.input} value={issueTypeId} />
        </Card>
      ) : null}

      <Card>
        <Text style={[styles.label, { color: colors.text }]}>Комментарий</Text>
        <TextInput
          editable={!isSubmitting}
          multiline
          onBlur={() => void flushDraft().catch(() => setError("Не удалось сохранить черновик точки."))}
          onChangeText={value => { recordDraft({ comment: value }); setComment(value); }}
          placeholder={commentPlaceholder(selectedStatus)}
          placeholderTextColor="#9ca3af"
          style={[styles.input, styles.textArea]}
          textAlignVertical="top"
          value={comment}
        />
      </Card>

      <Card>
        <View style={styles.photoHeader}>
          <Text style={[styles.label, { color: colors.text }]}>Фото и видео</Text>
          <Text style={styles.photoNote}>{point.requiresPhoto ? "\u041e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u043e \u043f\u0440\u0438 \u043d\u0435\u0438\u0441\u043f\u0440\u0430\u0432\u043d\u043e\u0441\u0442\u0438 \u0438\u043b\u0438 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u043e\u0439 \u043c\u0435\u0442\u043a\u0435" : "\u041d\u0435\u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u043e"}</Text>
        </View>
        {attachments.length > 0 ? (
          <View style={styles.photoGrid}>
            {attachments.map((attachment) => (
              <View key={attachment.clientFileId} style={styles.photoTile}>
                {attachment.mediaKind === "video" ? (
                  <View style={styles.videoTile}>
                    <Ionicons color="#2563eb" name="videocam-outline" size={24} />
                    <Text style={styles.videoLabel}>Видео</Text>
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
              {mediaProgress === null ? "Подготовка вложения…" : `Подготовка вложения: ${Math.round(mediaProgress * 100)}%`}
            </Text>
          </View>
        ) : null}
        <PrimaryButton disabled={isSubmitting || isMediaBusy} icon="attach-outline" label="Добавить вложение" onPress={() => setOpenMenu("attachments")} variant="secondary" />
      </Card>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {transitionPending ? <PrimaryButton label="Повторить переход" onPress={() => void retrySavedTransition()} variant="secondary" /> : null}
      {hasPendingLeave && !isSavingBeforeLeave ? <PrimaryButton label="Повторить сохранение" onPress={retryPendingLeave} variant="secondary" /> : null}
      {isSubmitting ? <ActivityIndicator /> : null}
      <View style={styles.bottomActions}>
        {isSavingBeforeLeave ? <Text accessibilityLiveRegion="polite" style={[styles.savingNotice, { color: colors.mutedText }]}>Сохраняем последние изменения…</Text> : null}
        <Pressable accessibilityRole="button" onPress={() => setPhase("status")} style={styles.inlineLink}>
          <Ionicons color={colors.primary} name="swap-horizontal-outline" size={19} />
          <Text style={[styles.inlineLinkText, { color: colors.primary }]}>Изменить состояние</Text>
        </Pressable>
        <Pressable accessibilityLabel="Дополнительные действия" accessibilityRole="button" onPress={() => setOpenMenu("more")} style={styles.moreButton}>
          <Ionicons color={colors.primary} name="ellipsis-horizontal" size={22} />
        </Pressable>
      </View>
      <ActionSheet
        actions={openMenu === "attachments" ? [
          { label: "Сделать фото", icon: "camera-outline", onPress: () => void handleAddPhoto() },
          { label: "Снять видео", icon: "videocam-outline", onPress: () => void handleAddVideo() },
          { label: "Выбрать из галереи", icon: "images-outline", onPress: () => void handleAddFromGallery() }
        ] : [
          { label: 'Сменить маршрут', icon: 'swap-horizontal-outline', onPress: () => router.replace(`/patrol/assignment/${assignmentId}/switch` as never) },
          { label: "Отложить точку", icon: "time-outline", danger: true, onPress: () => void handleDefer() }
        ]}
        onClose={() => setOpenMenu(null)}
        title={openMenu === "attachments" ? "Добавить вложение" : "Действия с точкой"}
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
    return "NFC подтвержден";
  }

  if (point.confirmationType === "qr") {
    return "QR подтвержден";
  }

  if (point.status === "deferred") {
    return "Отложена";
  }

  if (point.status === "skipped") {
    return "Не осмотрена";
  }

  return "Ручное заполнение";
}

function statusLabel(status: SelectedStatus | null) {
  if (status === "issue") {
    return "Неисправно";
  }

  if (status === "skipped") {
    return "Не осмотрено";
  }

  return "Исправно";
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
    return "Опишите неисправность";
  }

  if (status === "skipped") {
    return "Обязательно укажите, почему осмотр невозможен";
  }

  return "Что заметили во время обхода?";
}

function fileStatusLabel(status: string) {
  switch (status) {
    case "uploaded":
    case "linked":
      return "Загружено";
    case "uploading":
      return "Отправка";
    case "retryLater":
    case "failed":
      return "Ожидает повтор";
    default:
      return "На телефоне";
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
    return "вручную";
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
  uninspectableButton: {
    alignItems: "center",
    backgroundColor: "#fffbeb",
    borderColor: "#f59e0b",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 68,
    paddingHorizontal: 14,
    paddingVertical: 10
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
  savingNotice: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
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
