export class SerializedTaskQueue<T> {
  private tail: Promise<T> | null = null;

  run(task: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    const current = previous
      ? previous.catch(() => undefined).then(task)
      : task();

    this.tail = current;

    return current.finally(() => {
      if (this.tail === current) {
        this.tail = null;
      }
    });
  }
}
