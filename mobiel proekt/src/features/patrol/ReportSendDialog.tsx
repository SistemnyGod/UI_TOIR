import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ReportDeliveryState } from '@/domain/reporting/reportDeliveryState';
import { useAppTheme } from '@/features/settings/themePreference';
import { GradientFill } from '@/ui/GradientFill';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { useReducedMotion } from '@/ui/useReducedMotion';

export type ReportSendDialogProps = {
  visible: boolean;
  delivery: ReportDeliveryState | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onContinue: () => void;
};

export function ReportSendDialog({ visible, delivery, busy, error, onClose, onContinue }: ReportSendDialogProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const saved = !!delivery && delivery.status !== 'notQueued';
  const delivered = delivery?.status === 'delivered';
  const needsAttention = !!error || (saved && ['waitingAuth', 'wrongContour', 'conflict', 'repairRequired', 'blockedByDependency'].includes(delivery.status));
  const waiting = delivery?.status === 'waitingNetwork' || delivery?.status === 'retryScheduled';
  const sending = !delivered && !needsAttention && !waiting && (busy || delivery?.status === 'sending');
  const title = delivered ? 'Отчёт отправлен' : needsAttention ? saved ? 'Нужно ваше внимание' : 'Не удалось сохранить отчёт'
    : sending ? 'Отправляем отчёт' : 'Отчёт сохранён';
  const message = delivered ? 'Сервер подтвердил получение.'
    : needsAttention ? saved ? 'Данные сохранены. Проверьте сообщение в отчёте.' : 'Вернитесь к отчёту и повторите сохранение.'
    : waiting ? delivery.status === 'waitingNetwork' ? 'Отправим автоматически, когда появится связь.' : 'Повторим отправку автоматически.'
    : sending ? 'Подождите немного. Можно продолжить работу.' : 'Отправка продолжится автоматически.';
  const tint = delivered ? colors.success : needsAttention ? colors.warning : colors.primary;

  return (
    <Modal transparent statusBarTranslucent navigationBarTranslucent visible={visible}
      animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: colors.scrim, paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
        <View accessibilityViewIsModal style={[styles.dialog, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable accessibilityRole='button' accessibilityLabel='Скрыть окно отправки' onPress={onClose} style={styles.close}>
            <Ionicons name='close' size={22} color={colors.mutedText} />
          </Pressable>
          <ScrollView contentContainerStyle={styles.content} bounces={false}>
            <View style={[styles.halo, { backgroundColor: delivered ? colors.successSurface : needsAttention ? colors.warningSurface : colors.backgroundAccent }]}>
              <View style={[styles.symbol, { backgroundColor: tint, shadowColor: tint }]}>
                <GradientFill colors={colors} kind={delivered ? 'success' : needsAttention ? 'warning' : 'accent'} radius={24} />
                {sending ? <ActivityIndicator size='large' color={colors.onAccent} /> : <Ionicons
                  name={delivered ? 'checkmark-circle-outline' : needsAttention ? 'alert-circle-outline' : 'cloud-upload-outline'} size={36} color={colors.onAccent} />}
              </View>
            </View>
            <View accessibilityLiveRegion='polite' style={styles.copy}>
              <Text accessibilityRole='header' style={[styles.title, { color: colors.text }]}>{title}</Text>
              <Text style={[styles.message, { color: colors.mutedText }]}>{message}</Text>
            </View>
            <View style={styles.action}>
              <PrimaryButton label={needsAttention ? 'К отчёту' : delivered ? 'Готово' : saved ? 'Продолжить работу' : 'Скрыть окно'}
                onPress={needsAttention || !saved ? onClose : onContinue} variant={sending ? 'secondary' : 'primary'} />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  dialog: { width: '100%', maxWidth: 400, maxHeight: '100%', borderRadius: 28, borderWidth: 1, padding: 20 },
  close: { alignSelf: 'flex-end', alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44, marginTop: -8, marginRight: -8 },
  content: { alignItems: 'center', gap: 20, paddingBottom: 4 },
  halo: { width: 112, height: 112, borderRadius: 56, alignItems: 'center', justifyContent: 'center' },
  symbol: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
    shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  copy: { gap: 10, alignSelf: 'stretch' },
  title: { fontSize: 22, lineHeight: 28, fontFamily: "Manrope_800ExtraBold", textAlign: 'center' },
  message: { fontSize: 16, lineHeight: 24, textAlign: 'center' },
  action: { alignSelf: 'stretch' }
});
