import { TransientNotice } from "@/ui/TransientNotice";
import { ActivityIndicator, Text, View } from "react-native";

import { useAppTheme } from "@/features/settings/themePreference";
import { ActionSheet } from "@/ui/ActionSheet";
import { PersistentNotice } from "@/ui/PersistentNotice";
import { AttachmentViewer } from "./AttachmentViewer";
import { PointAttachmentsBlock } from "./PointAttachmentsBlock";
import { PointCommentField } from "./PointCommentField";
import { PointGuidanceCard } from "./PointGuidanceCard";
import { PointManualSheet } from "./PointManualSheet";
import { PointPhotoInstructionSlot } from "./PointPhotoInstructionSlot";
import { PointStatusSummary, PointStatusTiles } from "./PointStatusTiles";
import { usePointStyles } from "./pointFillStyles";
import { usePointFill } from "./usePointFill";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";

export function PointFillScreen() {
  const styles = usePointStyles();
  const { colors } = useAppTheme();
  const form = usePointFill();
  const { point, selectedStatus, isSubmitting, transitionPending, hasPendingLeave, isSavingBeforeLeave } = form;

  if (form.loadError) {
    return (
      <Screen title="Заполнение метки" subtitle="Статус, комментарий и вложения точки.">
        <Card>
          <Text style={[styles.text, { color: colors.danger }]}>{form.loadError}</Text>
          <PrimaryButton icon="refresh-outline" label="Повторить загрузку" onPress={() => void form.reload()} variant="secondary" />
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

  if (form.manualOpen) {
    return <PointManualSheet pointName={point.name} reason={form.manualReason} error={form.error}
      isSubmitting={isSubmitting} isSavingBeforeLeave={isSavingBeforeLeave} hasPendingLeave={hasPendingLeave}
      onChangeReason={form.changeManualReason} onRetryLeave={form.retryPendingLeave} onClose={form.closeManual} onContinue={form.continueManual} />;
  }

  return (
    <Screen
      compactHeader
      contentContainerStyle={!form.detailsOpen ? styles.statusScreen : undefined}
      floatingNotice={<View pointerEvents="box-none" style={styles.notices}>
        <PersistentNotice message={form.error} onDismiss={form.dismissError} />
        <TransientNotice key={form.noticeRevision} message={form.mediaNotice} />
      </View>}
      bottomActionBackground="transparent"
      bottomAction={form.detailsOpen ? <PrimaryButton testID="point-save" disabled={isSubmitting || form.isMediaBusy || hasPendingLeave || (!selectedStatus && !transitionPending)} disabledReason={!selectedStatus ? "Выберите результат осмотра" : undefined} icon="save-outline" loading={isSubmitting} label={transitionPending ? "Повторить переход" : "Сохранить и продолжить"} onPress={transitionPending ? () => void form.retrySavedTransition() : form.handleSave} size="large" /> : undefined}
      title=""
    >
      <View style={styles.row}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text, flex: 1 }]}>Метка — {point.name}</Text>
        <Text accessibilityLabel={`Метка номер ${point.orderIndex}`} style={{ color: colors.mutedText, fontSize: 18 }}>{point.orderIndex}</Text>
      </View>
      {!form.detailsOpen ? <PointStatusTiles selectedStatus={selectedStatus} disabled={isSubmitting || transitionPending} onSelect={form.selectStatus} /> : <>
      <PointStatusSummary selectedStatus={selectedStatus} disabled={isSubmitting || transitionPending || hasPendingLeave}
        onChange={form.reopenStatusChoice} onMore={() => form.setOpenMenu("more")} />
      <PointGuidanceCard
        description={point.description}
        instruction={point.instruction}
        mutedColor={colors.mutedText}
        textColor={colors.text}
      />
      <PointPhotoInstructionSlot instruction={point.photoInstruction} />
      <PointCommentField value={form.comment} editable={!isSubmitting && !transitionPending} selectedStatus={selectedStatus}
        validationAttempted={form.validationAttempted} onChangeText={form.changeComment} onAppendText={form.appendComment} onBlur={form.flushCommentDraft} />
      <PointAttachmentsBlock attachments={form.attachments} isMediaBusy={form.isMediaBusy} mediaProgress={form.mediaProgress} mediaFileLabel={form.mediaFileLabel}
        addDisabled={isSubmitting || transitionPending || form.isMediaBusy || hasPendingLeave} onOpen={form.openViewer} onAdd={() => form.setOpenMenu("attachments")} />
      </>}
      {hasPendingLeave && !isSavingBeforeLeave ? <PrimaryButton label="Повторить сохранение" onPress={form.retryPendingLeave} variant="secondary" /> : null}
      {isSubmitting ? <ActivityIndicator /> : null}
      {isSavingBeforeLeave ? <Text accessibilityLiveRegion="polite" style={styles.savingNotice}>Сохраняем последние изменения…</Text> : null}
      <ActionSheet
        actions={form.openMenu === "attachments" ? [
          { label: "Сделать фото", icon: "camera-outline", onPress: () => void form.addPhoto() },
          { label: "Серия фото подряд", icon: "albums-outline", onPress: () => void form.addPhotoSeries() },
          { label: "Снять видео", icon: "videocam-outline", onPress: () => void form.addVideo() },
          { label: "Выбрать фото и видео с телефона", icon: "images-outline", onPress: () => void form.addFromGallery() }
        ] : [
          { label: 'Сменить маршрут', icon: 'swap-horizontal-outline', onPress: form.switchRoute },
          { label: "Отложить точку", icon: "time-outline", danger: true, onPress: () => void form.handleDefer() }
        ]}
        onClose={() => form.setOpenMenu(null)}
        title={form.openMenu === "attachments" ? "Добавить фото или видео" : "Действия с точкой"}
        visible={form.openMenu !== null}
      />
      {form.viewerAttachment ? <AttachmentViewer
        attachment={form.viewerAttachment}
        blockReason={form.viewerBlockReason(form.viewerAttachment.clientFileId)}
        busy={form.isMediaBusy}
        error={form.error}
        onDismissError={form.dismissError}
        onClose={form.closeViewer}
        onDelete={attachment => void form.deleteAttachment(attachment)}
        onReplace={attachment => void form.replaceAttachment(attachment)}
      /> : null}
    </Screen>
  );
}
