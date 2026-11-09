export class BatchLoadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "BatchLoadError";
  }
}

interface PendingLoad<K, V> {
  readonly key: K;
  readonly waiters: Array<{ resolve(value: V): void; reject(error: unknown): void }>;
}

/** Coalesces concurrent lookups into bounded bulk reads; deliberately has no N+1 fallback. */
export class CoalescingBatchLoader<K, V> {
  private readonly pending = new Map<K, PendingLoad<K, V>>();
  private scheduled = false;

  constructor(
    private readonly fetchMany: (keys: readonly K[]) => Promise<ReadonlyMap<K, V>>,
    private readonly maxBatchSize = 100,
  ) {
    if (!Number.isInteger(maxBatchSize) || maxBatchSize < 1) {
      throw new Error("maxBatchSize must be a positive integer.");
    }
  }

  load(key: K): Promise<V> {
    let entry = this.pending.get(key);
    if (!entry) {
      entry = { key, waiters: [] };
      this.pending.set(key, entry);
    }
    const promise = new Promise<V>((resolve, reject) => entry!.waiters.push({ resolve, reject }));
    this.schedule();
    return promise;
  }

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => void this.dispatch());
  }

  private async dispatch(): Promise<void> {
    this.scheduled = false;
    const entries = [...this.pending.values()].slice(0, this.maxBatchSize);
    for (const entry of entries) this.pending.delete(entry.key);
    if (entries.length === 0) return;

    try {
      const values = await this.fetchMany(entries.map(entry => entry.key));
      for (const entry of entries) {
        if (!values.has(entry.key)) {
          const error = new BatchLoadError("The bulk endpoint did not return a requested key.");
          for (const waiter of entry.waiters) waiter.reject(error);
          continue;
        }
        const value = values.get(entry.key)!;
        for (const waiter of entry.waiters) waiter.resolve(value);
      }
    } catch (error) {
      const wrapped = new BatchLoadError("The Meta bulk read failed.", { cause: error });
      for (const entry of entries) for (const waiter of entry.waiters) waiter.reject(wrapped);
    }

    if (this.pending.size > 0) this.schedule();
  }
}
