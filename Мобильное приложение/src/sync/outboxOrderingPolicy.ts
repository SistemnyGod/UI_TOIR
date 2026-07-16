export type OrderedOutboxItem = {
  createdAtLocal: string;
  assignmentId: string | null;
};

/** Returns only the next chronological action for each patrol. */
export function selectNextOutboxCommands<T extends OrderedOutboxItem>(commands: T[], batchLimit: number) {
  const firstCommandByAssignment = new Map<string, T>();
  const commandsWithoutAssignment: T[] = [];

  for (const command of [...commands].sort((left, right) => left.createdAtLocal.localeCompare(right.createdAtLocal))) {
    if (!command.assignmentId) {
      commandsWithoutAssignment.push(command);
      continue;
    }

    if (!firstCommandByAssignment.has(command.assignmentId)) {
      firstCommandByAssignment.set(command.assignmentId, command);
    }
  }

  return [...firstCommandByAssignment.values(), ...commandsWithoutAssignment]
    .sort((left, right) => left.createdAtLocal.localeCompare(right.createdAtLocal))
    .slice(0, batchLimit);
}
