import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { assertDataOwnerContext, captureDataOwnerContext, type DataOwnerContext } from '@/auth/dataOwnerContext';
import { createFocusedLoad } from './focusedLoad';

export function useFocusedOwnerLoad<Value>(
  read: (scope: DataOwnerContext) => Promise<Value>,
  publish: (value: Value) => void,
  onError: (error: unknown) => void,
  onSettled: () => void
) {
  const reader = useRef<ReturnType<typeof createFocusedLoad<DataOwnerContext, Value>> | null>(null);
  useFocusEffect(useCallback(() => {
    const session = createFocusedLoad({ capture: captureDataOwnerContext, assert: assertDataOwnerContext,
      read, publish, onError, onSettled });
    reader.current = session;
    void session.run();
    return () => { session.stop(); if (reader.current === session) reader.current = null; };
  }, [read, publish, onError, onSettled]));
  return useCallback(() => reader.current?.run() ?? Promise.resolve(), []);
}
