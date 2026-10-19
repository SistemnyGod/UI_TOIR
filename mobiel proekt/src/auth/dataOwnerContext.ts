import { getStoredOwnerUserId } from '@/auth/tokenStorage';
import { getSessionGeneration } from '@/auth/sessionGeneration';
import { currentContourId } from '@/core/environments';
export type DataOwnerContext = { ownerUserId: string; contourId: string; generation: number };
export class StaleDataOwnerContextError extends Error {}
export async function captureDataOwnerContext(): Promise<DataOwnerContext> {
  const generation = getSessionGeneration();
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId || generation !== getSessionGeneration()) throw new StaleDataOwnerContextError('Сессия изменилась. Повторите загрузку.');
  return { ownerUserId, contourId: currentContourId, generation };
}
export async function assertDataOwnerContext(context: DataOwnerContext) {
  const owner = await getStoredOwnerUserId();
  if (context.generation !== getSessionGeneration() || owner !== context.ownerUserId || context.contourId !== currentContourId) {
    throw new StaleDataOwnerContextError('Устаревший ответ прежней сессии отклонён. Локальные данные сохранены.');
  }
}
