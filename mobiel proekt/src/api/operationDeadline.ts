import { MobileNetworkError, withTimeout } from '@/api/networkTimeout';
export const mobileOperationTimeoutMs = 30_000;
export class OperationDeadline {
  private readonly expiresAt: number;
  private readonly controller = new AbortController();
  constructor(timeoutMs = mobileOperationTimeoutMs, private readonly now = () => Date.now()) {
    this.expiresAt = now() + timeoutMs;
  }
  get signal() { return this.controller.signal; }
  remaining() {
    const remaining = this.expiresAt - this.now();
    if (remaining <= 0 || this.signal.aborted) throw new MobileNetworkError('timeout');
    return remaining;
  }
  wait<T>(operation: Promise<T>): Promise<T> {
    return withTimeout(operation, this.remaining(), 'Превышено время операции. Локальные данные сохранены.', () => this.controller.abort());
  }
  cancel() { this.controller.abort(); }
}
