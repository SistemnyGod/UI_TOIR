import { useEffect, useRef } from 'react';

/** Independent read lanes; an old completion cannot clear a newer loading state. */
export function useHistoryReadScope() {
  const scope = useRef({ mounted: true, generation: 0, lanes: new Map<string, number>() });
  useEffect(() => {
    scope.current.mounted = true;
    return () => { scope.current.mounted = false; scope.current.generation++; };
  }, []);
  function invalidate(lane: string) { scope.current.lanes.set(lane, (scope.current.lanes.get(lane) ?? 0) + 1); }
  function take(lane: string) {
    invalidate(lane);
    const generation = scope.current.generation, version = scope.current.lanes.get(lane);
    return () => scope.current.mounted && generation === scope.current.generation && version === scope.current.lanes.get(lane);
  }
  return { take, invalidate };
}
