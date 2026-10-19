import { useRouter, type Href } from "expo-router";
import { useCallback, useMemo } from "react";
import { ActivityIndicator, View, type ListRenderItem } from "react-native";

import { QueueEmptyState, QueueLoadErrorBanner, QueueSummaryCard } from "@/features/syncQueue/SyncQueueBanners";
import { CommandQueueCard, FileQueueCard, QueueSectionTitle } from "@/features/syncQueue/SyncQueueCards";
import { confirmationMessage, confirmationTitle } from "@/features/syncQueue/syncQueuePresentation";
import { useSyncQueue, type SyncQueueRow } from "@/features/syncQueue/useSyncQueue";
import { ActionSheet } from "@/ui/ActionSheet";
import { ScreenList } from "@/ui/Screen";

const keyExtractor = (row: SyncQueueRow) => row.key;
// ScreenList's header puts 10 between the title and its content; the queue keeps its 12 rhythm.
const headerStyle = { gap: 12, marginTop: 2 };

export function SyncQueueScreen() {
  const router = useRouter();
  const queue = useSyncQueue();
  const { rows, isLoading, loadError, pendingCount, actionInProgressId, expandedErrorId, pendingConfirmation, reload, retryNow, resolveCommand, retryFailedFile, toggleError, requestConfirmation, closeConfirmation } = queue;

  const openPath = useCallback((path: Href) => router.push(path), [router]);
  const openLogin = useCallback(() => router.push("/(auth)/login"), [router]);
  const onRetryNow = useCallback(() => { void retryNow(); }, [retryNow]);
  const onResolve = useCallback((...args: Parameters<typeof resolveCommand>) => { void resolveCommand(...args); }, [resolveCommand]);
  const onRetryFile = useCallback((...args: Parameters<typeof retryFailedFile>) => { void retryFailedFile(...args); }, [retryFailedFile]);

  const renderItem = useCallback<ListRenderItem<SyncQueueRow>>(({ item }) => {
    if (item.kind === "section") return <QueueSectionTitle title={item.title} />;
    if (item.kind === "file") {
      return <FileQueueCard actionsLocked={actionInProgressId !== null} file={item.file} onRetry={onRetryFile} stages={item.stages} />;
    }
    const id = item.command.clientOperationId;
    return (
      <CommandQueueCard
        busy={actionInProgressId === id}
        command={item.command}
        errorExpanded={expandedErrorId === id}
        onConfirm={requestConfirmation}
        onOpenPath={openPath}
        onResolve={onResolve}
        onToggleError={toggleError}
        stages={item.stages}
      />
    );
  }, [actionInProgressId, expandedErrorId, onResolve, onRetryFile, openPath, requestConfirmation, toggleError]);

  const confirmationActions = useMemo(() => pendingConfirmation ? [
    {
      danger: true,
      icon: pendingConfirmation.action === "serverWins" ? "cloud-done-outline" as const : "close-circle-outline" as const,
      label: pendingConfirmation.action === "serverWins" ? "Да, принять состояние сервера" : "Да, отменить действие",
      onPress: () => void resolveCommand(pendingConfirmation.command, pendingConfirmation.action)
    },
    { icon: "arrow-undo-outline" as const, label: "Оставить как есть", onPress: () => undefined }
  ] : [], [pendingConfirmation, resolveCommand]);

  const header = (
    <View style={headerStyle}>
      {isLoading ? <ActivityIndicator /> : null}
      {!isLoading && loadError ? <QueueLoadErrorBanner message={loadError} onReload={reload} /> : null}
      {!isLoading && !loadError && pendingCount === 0 ? <QueueEmptyState onReload={reload} /> : null}
      {!isLoading && pendingCount > 0 ? (
        <QueueSummaryCard
          errorCount={queue.summary.errors}
          feedback={queue.feedback}
          isSyncing={queue.isSyncing}
          onConfirmLogin={openLogin}
          onRetryNow={onRetryNow}
          pendingCount={pendingCount}
          retryableCount={queue.retryableCount}
          waitingAuthCount={queue.waitingAuthCount}
        />
      ) : null}
    </View>
  );

  return (
    <>
      <ScreenList
        data={rows}
        headerContent={header}
        initialNumToRender={6}
        keyExtractor={keyExtractor}
        maxToRenderPerBatch={6}
        renderItem={renderItem}
        title="Очередь отправки"
        windowSize={7}
      />
      <ActionSheet
        visible={pendingConfirmation !== null}
        title={pendingConfirmation ? confirmationTitle(pendingConfirmation.action) : ""}
        message={pendingConfirmation ? confirmationMessage(pendingConfirmation.command, pendingConfirmation.action) : undefined}
        onClose={closeConfirmation}
        actions={confirmationActions}
      />
    </>
  );
}
