import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { ApplicationError } from "../errors/application-error.js";

export interface TenantRequestContext {
  readonly tenantId: string;
  readonly userId: string;
  readonly correlationId: string;
}

const contextStorage = new AsyncLocalStorage<TenantRequestContext>();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class TenantContext {
  run<T>(
    context: Omit<TenantRequestContext, "correlationId"> & { correlationId?: string },
    operation: () => T
  ): T {
    if (!UUID_PATTERN.test(context.tenantId) || context.userId.length < 1) {
      throw new ApplicationError("VALIDATION_ERROR", "A valid tenant and authenticated user are required.");
    }
    return contextStorage.run(Object.freeze({
      tenantId: context.tenantId,
      userId: context.userId,
      correlationId: context.correlationId ?? randomUUID()
    }), operation);
  }

  current(): TenantRequestContext {
    const context = contextStorage.getStore();
    if (!context) {
      throw new ApplicationError("FORBIDDEN", "Tenant context is not available for this operation.");
    }
    return context;
  }

  optional(): TenantRequestContext | undefined {
    return contextStorage.getStore();
  }
}
