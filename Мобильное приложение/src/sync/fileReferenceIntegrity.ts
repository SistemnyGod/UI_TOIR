export function findMissingClientFileIds(requestedIds: string[], availableIds: string[]) {
  const available = new Set(availableIds);
  return Array.from(new Set(requestedIds)).filter((clientFileId) => !available.has(clientFileId));
}
