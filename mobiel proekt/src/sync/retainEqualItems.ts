/** Reuse unchanged JSON data so a background read does not redraw every row. */
export function retainEqualItems<T>(previous: T[], next: T[], key: (item: T) => string): T[] {
  const oldItems = new Map(previous.map(item => [key(item), item]));
  const merged = next.map(item => {
    const oldItem = oldItems.get(key(item));
    return oldItem !== undefined && JSON.stringify(oldItem) === JSON.stringify(item) ? oldItem : item;
  });
  return merged.length === previous.length && merged.every((item, index) => item === previous[index]) ? previous : merged;
}
