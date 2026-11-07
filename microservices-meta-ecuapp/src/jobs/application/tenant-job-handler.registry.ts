import type { TenantJobHandler } from "./tenant-job-ports.js";

const JOB_TYPE_PATTERN = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*){1,7}$/;

export class TenantJobHandlerRegistry {
  private readonly handlers: ReadonlyMap<string, TenantJobHandler>;

  constructor(handlers: readonly TenantJobHandler[]) {
    const registry = new Map<string, TenantJobHandler>();
    for (const handler of handlers) {
      if (!JOB_TYPE_PATTERN.test(handler.jobType)) {
        throw new Error("Tenant job handler type is invalid.");
      }
      if (registry.has(handler.jobType)) {
        throw new Error("Duplicate tenant job handler: " + handler.jobType);
      }
      registry.set(handler.jobType, handler);
    }
    this.handlers = registry;
  }

  resolve(jobType: string): TenantJobHandler | null {
    return this.handlers.get(jobType) ?? null;
  }

  get size(): number {
    return this.handlers.size;
  }
}
