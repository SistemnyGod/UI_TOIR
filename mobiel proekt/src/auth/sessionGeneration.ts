let generation = 0;
export const getSessionGeneration = () => generation;
export function advanceSessionGeneration() { generation += 1; }
