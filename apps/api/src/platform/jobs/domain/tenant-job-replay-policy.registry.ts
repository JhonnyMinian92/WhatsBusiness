export const TENANT_JOB_REPLAY_POLICY_VERSION = "tenant-job-replay.v1";
export const TENANT_JOB_REPLAY_POLICY_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const TENANT_JOB_TYPE_PATTERN = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*){1,7}$/;

export interface TenantJobReplayMetadata {
  readonly jobType: string;
  readonly status: "dead_letter";
  readonly deadLetterReason: "attempts_exhausted";
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly errorCode: string | null;
  readonly requestSha256: string;
}

export interface TenantJobReplayPolicy {
  readonly jobType: string;
  readonly version: string;
  readonly idempotencyGuarantee: "stable-domain-effect-key";
  canReplay(metadata: TenantJobReplayMetadata): boolean;
}

export class TenantJobReplayPolicyRegistry {
  private readonly policies: ReadonlyMap<string, TenantJobReplayPolicy>;

  constructor(policies: readonly TenantJobReplayPolicy[] = []) {
    const registry = new Map<string, TenantJobReplayPolicy>();
    for (const policy of policies) {
      if (!TENANT_JOB_TYPE_PATTERN.test(policy.jobType)) {
        throw new Error("Tenant job replay policy has an invalid job type.");
      }
      if (!TENANT_JOB_REPLAY_POLICY_VERSION_PATTERN.test(policy.version)) {
        throw new Error("Tenant job replay policy version is invalid.");
      }
      if (policy.version !== TENANT_JOB_REPLAY_POLICY_VERSION) {
        throw new Error("Tenant job replay policy version must match the database boundary version.");
      }
      if (policy.idempotencyGuarantee !== "stable-domain-effect-key") {
        throw new Error("Tenant job replay requires a stable domain effect idempotency guarantee.");
      }
      if (registry.has(policy.jobType)) {
        throw new Error("Duplicate tenant job replay policy: " + policy.jobType);
      }
      registry.set(policy.jobType, Object.freeze(policy));
    }
    this.policies = registry;
  }

  resolve(jobType: string): TenantJobReplayPolicy | null {
    return this.policies.get(jobType) ?? null;
  }

  get size(): number {
    return this.policies.size;
  }
}
