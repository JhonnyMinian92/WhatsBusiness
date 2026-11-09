import { OperationAbortedError, throwIfAborted } from "./contracts.js";

export class BulkheadRejectedError extends Error {
  constructor(readonly key: string, message = "The bulkhead queue is full.") {
    super(message);
    this.name = "BulkheadRejectedError";
  }
}

interface Waiter {
  readonly resolve: (release: () => void) => void;
  readonly reject: (error: Error) => void;
  readonly signal?: AbortSignal;
  abortHandler?: () => void;
}

interface GateState {
  active: number;
  readonly queue: Waiter[];
}

export interface ConcurrencyLimiter {
  acquire(key: string, signal?: AbortSignal): Promise<() => void>;
}

export interface KeyedConcurrencyLimiterOptions {
  readonly maxConcurrency: number;
  readonly maxQueue: number;
}

/** Fair FIFO semaphore partitioned by key (for example product + tenant). */
export class KeyedConcurrencyLimiter implements ConcurrencyLimiter {
  private readonly gates = new Map<string, GateState>();
  private readonly maxConcurrency: number;
  private readonly maxQueue: number;

  constructor(options: KeyedConcurrencyLimiterOptions) {
    this.maxConcurrency = positiveInteger(options.maxConcurrency, "maxConcurrency");
    this.maxQueue = nonNegativeInteger(options.maxQueue, "maxQueue");
  }

  acquire(key: string, signal?: AbortSignal): Promise<() => void> {
    if (!key.trim()) throw new Error("Bulkhead key is required.");
    throwIfAborted(signal);
    const gate = this.getGate(key);
    if (gate.active < this.maxConcurrency) {
      gate.active += 1;
      return Promise.resolve(this.createRelease(key, gate));
    }
    if (gate.queue.length >= this.maxQueue) return Promise.reject(new BulkheadRejectedError(key));

    return new Promise((resolve, reject) => {
      const waiter: Waiter = { resolve, reject, signal };
      if (signal) {
        waiter.abortHandler = () => {
          const index = gate.queue.indexOf(waiter);
          if (index >= 0) gate.queue.splice(index, 1);
          reject(new OperationAbortedError());
          this.cleanup(key, gate);
        };
        signal.addEventListener("abort", waiter.abortHandler, { once: true });
      }
      gate.queue.push(waiter);
      if (signal?.aborted) waiter.abortHandler?.();
    });
  }

  snapshot(key: string): Readonly<{ active: number; queued: number }> {
    const gate = this.gates.get(key);
    return Object.freeze({ active: gate?.active ?? 0, queued: gate?.queue.length ?? 0 });
  }

  private getGate(key: string): GateState {
    let gate = this.gates.get(key);
    if (!gate) {
      gate = { active: 0, queue: [] };
      this.gates.set(key, gate);
    }
    return gate;
  }

  private createRelease(key: string, gate: GateState): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      gate.active = Math.max(0, gate.active - 1);
      this.dispatch(key, gate);
      this.cleanup(key, gate);
    };
  }

  private dispatch(key: string, gate: GateState): void {
    while (gate.active < this.maxConcurrency && gate.queue.length > 0) {
      const waiter = gate.queue.shift()!;
      if (waiter.signal?.aborted) {
        waiter.abortHandler && waiter.signal.removeEventListener("abort", waiter.abortHandler);
        waiter.reject(new OperationAbortedError());
        continue;
      }
      waiter.abortHandler && waiter.signal?.removeEventListener("abort", waiter.abortHandler);
      gate.active += 1;
      waiter.resolve(this.createRelease(key, gate));
    }
  }

  private cleanup(key: string, gate: GateState): void {
    if (gate.active === 0 && gate.queue.length === 0) this.gates.delete(key);
  }
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer.`);
  return value;
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer.`);
  return value;
}
