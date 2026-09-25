import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';
import { captureDataOwnerContext, assertDataOwnerContext } from '@/auth/dataOwnerContext';
import { clearCurrentPatrolIfMatches } from '@/db/repositories/patrolContextRepository';
import { Screen } from '@/ui/Screen';
import { PrimaryButton } from '@/ui/PrimaryButton';

// Preserve existing menu/notification URLs.
export function SwitchPatrolScreen() {
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(useCallback(() => {
    if (attempt > 0) setError(null);
    let active = true;
    void (async () => {
      const scope = await captureDataOwnerContext();
      await clearCurrentPatrolIfMatches(scope, assignmentId, () => active);
      await assertDataOwnerContext(scope);
      if (active) router.replace('/patrol/request-board');
    })().catch(caught => { if (active) setError(String(caught)); });
    return () => { active = false; };
  }, [assignmentId, attempt, router]));
  return <Screen title="Выбор заявки">
    <Text>{error ?? 'Открываем сохранённые заявки…'}</Text>
    {error ? <PrimaryButton label="Повторить" onPress={() => setAttempt(value => value + 1)} /> : null}
  </Screen>;
}
