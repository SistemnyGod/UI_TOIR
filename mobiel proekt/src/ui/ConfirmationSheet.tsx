import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/features/settings/themePreference';
import { PrimaryButton } from '@/ui/PrimaryButton';

export function ConfirmationSheet({
  visible,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  disabled = false
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  disabled?: boolean;
}) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType='slide' onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel='Закрыть подтверждение'
          accessibilityRole='button'
          disabled={disabled}
          onPress={onCancel}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              paddingBottom: Math.max(insets.bottom, 16)
            }
          ]}
        >
          <View style={styles.handle} />
          <Text accessibilityRole='header' style={[styles.title, { color: colors.text }]}>
            {title}
          </Text>
          <Text style={[styles.message, { color: colors.mutedText }]}>{message}</Text>
          <PrimaryButton
            disabled={disabled}
            icon='checkmark-circle-outline'
            label={confirmLabel}
            onPress={onConfirm}
            size='large'
          />
          <PrimaryButton
            disabled={disabled}
            label='Вернуться'
            onPress={onCancel}
            variant='secondary'
            size='large'
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    flex: 1,
    justifyContent: 'flex-end'
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: '#cbd5e1',
    borderRadius: 999,
    height: 4,
    width: 42
  },
  title: {
    fontSize: 21,
    fontWeight: '900',
    lineHeight: 27
  },
  message: {
    fontSize: 15,
    lineHeight: 21
  }
});

