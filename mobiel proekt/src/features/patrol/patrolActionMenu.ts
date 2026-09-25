import type { ActionSheetItem } from '@/ui/ActionSheet';

type PatrolActionMenuInput = {
  assignmentId: string;
  status?: string;
  capabilities?: { patrolSwitch?: boolean; patrolAppeals?: boolean };
  onPause?: () => void;
  onContinue?: () => void;
  onQr?: () => void;
  onSwitch?: () => void;
  onPoints?: () => void;
  onSubmit?: () => void;
  onAppeal?: () => void;
  onCancel?: () => void;
};

/** One source of truth for actions offered from the route card and NFC scan. */
export function buildPatrolActionMenu(input: PatrolActionMenuInput): ActionSheetItem[] {
  return [
    ...(input.onContinue ? [{ label: 'Продолжить обход', icon: 'play-outline' as const, onPress: input.onContinue }] : []),
    ...(input.onPause && (!input.status || input.status === 'inProgress') ? [{ label: 'Приостановить', icon: 'pause-outline' as const, onPress: input.onPause }] : []),
    ...(input.onQr ? [{ label: 'QR', icon: 'qr-code-outline' as const, onPress: input.onQr }] : []),
    ...(input.onSwitch && (!input.capabilities || input.capabilities.patrolSwitch !== false) && (!input.status || ['accepted', 'inProgress', 'paused'].includes(input.status)) ? [{ label: 'Сменить маршрут', icon: 'swap-horizontal-outline' as const, onPress: input.onSwitch }] : []),
    ...(input.onPoints ? [{ label: 'Посмотреть точки', icon: 'list-outline' as const, onPress: input.onPoints }] : []),
    ...(input.onSubmit && (!input.status || ['inProgress', 'completedLocal'].includes(input.status)) ? [{ label: 'Завершить маршрут', icon: 'checkmark-circle-outline' as const, onPress: input.onSubmit }] : []),
    ...(input.onAppeal && (!input.capabilities || input.capabilities.patrolAppeals !== false) && !['completedServer', 'cancelledServer'].includes(input.status ?? '') ? [{ label: 'Связаться с диспетчером', icon: 'chatbubble-outline' as const, onPress: input.onAppeal }] : []),
    ...(input.onCancel && (!input.capabilities || input.capabilities.patrolAppeals !== false) && ['accepted', 'inProgress', 'paused', 'syncError', 'authRequired'].includes(input.status ?? 'inProgress') ? [{ label: 'Запросить отмену', icon: 'alert-circle-outline' as const, danger: true, onPress: input.onCancel }] : [])
  ];
}
