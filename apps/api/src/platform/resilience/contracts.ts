export type MetaProduct =
  | "whatsapp"
  | "facebook"
  | "messenger"
  | "instagram"
  | "threads"
  | "leadgen"
  | "marketing";

export interface MetaRequestScope {
  readonly product: MetaProduct;
  readonly appId: string;
  readonly tenantId: string;
  readonly connectionId: string;
  readonly assetId?: string;
  readonly businessId?: string;
}

export type HeaderCollection =
  | Headers
  | Readonly<Record<string, string | undefined>>
  | { get(name: string): string | null };

export interface Clock {
  now(): number;
}

export const systemClock: Clock = Object.freeze({ now: () => Date.now() });

export class OperationAbortedError extends Error {
  constructor(message = "The operation was aborted.") {
    super(message);
    this.name = "AbortError";
  }
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new OperationAbortedError();
}

export function abortableSleep(
  milliseconds: number,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return Promise.resolve();

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = (): void => finish(() => reject(new OperationAbortedError()));
    const timer = setTimeout(() => finish(resolve), milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

export function readHeader(headers: HeaderCollection, name: string): string | undefined {
  if (typeof (headers as { get?: unknown }).get === "function") {
    return (headers as { get(name: string): string | null }).get(name) ?? undefined;
  }
  const target = name.toLowerCase();
  const entry = Object.entries(headers as Readonly<Record<string, string | undefined>>)
    .find(([key]) => key.toLowerCase() === target);
  return entry?.[1];
}

export function assertNonEmpty(value: string, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}
