type Checkpoint = () => Promise<boolean>;
type Entry<T> = {
  task: (checkpoint: Checkpoint) => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

/** Serial execution with cooperative priority at durable command boundaries.
 * A pending manual report never interrupts an HTTP request or SQLite write.
 */
export class PrioritySyncQueue<T> {
  private normal: Entry<T>[] = [];
  private urgent: Entry<T>[] = [];
  private running = false;

  run(task: (checkpoint: Checkpoint) => Promise<T>, priority = false): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      (priority ? this.urgent : this.normal).push({ task, resolve, reject });
      if (!this.running) void this.drain();
    });
  }

  private async execute(entry: Entry<T>, priority: boolean) {
    try {
      entry.resolve(await entry.task(async () => {
        // One report per boundary keeps the ordinary queue moving as well.
        const next = !priority ? this.urgent.shift() : undefined;
        if (next) await this.execute(next, true);
        return !!next;
      }));
    } catch (error) {
      entry.reject(error);
    }
  }

  private async drain() {
    this.running = true;
    try {
      while (this.urgent.length || this.normal.length) {
        const priority = this.urgent.length > 0;
        await this.execute((priority ? this.urgent : this.normal).shift()!, priority);
      }
    } finally {
      this.running = false;
    }
  }
}
