import { memo } from "react";
import { Text, View } from "react-native";

import { useAppTheme } from "@/features/settings/themePreference";
import { dangerBox } from "@/features/syncQueue/syncQueuePresentation";
import { queueStyles } from "@/features/syncQueue/syncQueueStyles";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { StatusPill } from "@/ui/StatusPill";

export const QueueLoadErrorBanner = memo(function QueueLoadErrorBanner({ message, onReload }: { message: string; onReload: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Card>
      <Text style={[queueStyles.errorText, dangerBox(colors)]}>{message}</Text>
      <PrimaryButton icon="refresh-outline" label="Повторить загрузку" onPress={onReload} variant="secondary" />
    </Card>
  );
});

export const QueueEmptyState = memo(function QueueEmptyState({ onReload }: { onReload: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Card>
      <Text style={[queueStyles.title, { color: colors.text }]}>Все данные отправлены</Text>
      <Text style={[queueStyles.text, { color: colors.mutedText }]}>Сервер подтвердил все отчеты, команды и вложения.</Text>
      <PrimaryButton icon="refresh-outline" label="Проверить еще раз" onPress={onReload} variant="ghost" />
    </Card>
  );
});

type QueueSummaryCardProps = {
  pendingCount: number;
  errorCount: number;
  waitingAuthCount: number;
  retryableCount: number;
  feedback: string | null;
  isSyncing: boolean;
  onConfirmLogin: () => void;
  onRetryNow: () => void;
};

/** Head of a non-empty queue: totals, problems to review, sign-in prompt, last result and the manual send button. */
export const QueueSummaryCard = memo(function QueueSummaryCard({ pendingCount, errorCount, waitingAuthCount, retryableCount, feedback, isSyncing, onConfirmLogin, onRetryNow }: QueueSummaryCardProps) {
  const { colors } = useAppTheme();
  return (
    <Card>
      <View style={queueStyles.headerRow}>
        <View style={queueStyles.headerText}>
          <Text style={[queueStyles.title, { color: colors.text }]}>Данные ожидают отправки</Text>
          <Text style={[queueStyles.text, { color: colors.mutedText }]}>
            Приложение повторит отправку автоматически после восстановления связи.
          </Text>
        </View>
        <StatusPill label={`${pendingCount} в очереди`} tone="warning" />
      </View>

      {errorCount > 0 ? (
        <Text style={[queueStyles.notice, { backgroundColor: colors.backgroundAccent, borderColor: colors.border, color: colors.primary }]}>
          Требуют проверки: {errorCount}. Откройте запись ниже, чтобы увидеть причину и исправить данные.
        </Text>
      ) : null}

      {waitingAuthCount > 0 ? (
        <View accessibilityLiveRegion="polite" style={[queueStyles.authNotice, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}>
          <Text style={[queueStyles.authNoticeTitle, { color: colors.warning }]}>Нужно подтвердить вход</Text>
          <Text style={[queueStyles.text, { color: colors.mutedText }]}>
            Локальные данные сохранены. После подтверждения приложение автоматически отправит {waitingAuthCount} ожидающих операций.
          </Text>
          <PrimaryButton
            icon="log-in-outline"
            label="Подтвердить вход для синхронизации"
            onPress={onConfirmLogin}
            size="large"
            variant="secondary"
          />
        </View>
      ) : null}

      {feedback ? <Text accessibilityLiveRegion="polite" style={[queueStyles.feedback, { backgroundColor: colors.backgroundAccent, borderColor: colors.border, color: colors.text }]}>{feedback}</Text> : null}

      {retryableCount > 0 ? (
        <PrimaryButton
          disabled={isSyncing}
          icon="refresh-outline"
          label={isSyncing ? "Проверяем отправку…" : "Отправить сейчас"}
          onPress={onRetryNow}
          size="large"
        />
      ) : null}
    </Card>
  );
});
