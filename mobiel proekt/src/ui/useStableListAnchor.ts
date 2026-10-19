import { useState } from 'react';

/** Native anchoring is safe for insertion/removal, but janky when rows reorder. */
export function preservesItemOrder(previous: string[], next: string[]) {
  if (!previous.length || !next.length) return false;
  const positions = new Map(previous.map((id, index) => [id, index]));
  let last = -1;
  for (const id of next) {
    const position = positions.get(id);
    if (position === undefined) continue;
    if (position < last) return false;
    last = position;
  }
  return last !== -1;
}

const anchor = { minIndexForVisible: 0 };

export function useStableListAnchor(keys: string[]) {
  const [snapshot, setSnapshot] = useState(() => ({ keys, safe: keys.length > 0 }));
  if (snapshot.keys.length !== keys.length || snapshot.keys.some((id, index) => id !== keys[index])) {
    const safe = preservesItemOrder(snapshot.keys, keys);
    setSnapshot({ keys, safe });
    return safe ? anchor : undefined;
  }
  return snapshot.safe ? anchor : undefined;
}
