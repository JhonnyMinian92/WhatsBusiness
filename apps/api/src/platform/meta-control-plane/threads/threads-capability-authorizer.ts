import {
  THREADS_CAPABILITY_CATALOG,
  type ThreadsCapabilityKey,
  type ThreadsCapabilityAuthorizer,
} from "@whatsbusiness/microservices-meta-ecuapp";
import type { MetaCapabilityDefinition, MetaCapabilityEvidence } from "../domain/meta-capability.js";
import { MetaCapabilityEvaluator } from "../domain/meta-capability-evaluator.js";

export interface ThreadsCapabilityEvidenceProvider {
  load(input: {
    readonly tenantId: string;
    readonly profileId: string;
    readonly capability: ThreadsCapabilityKey;
  }): Promise<MetaCapabilityEvidence>;
}

/** Connects the Threads adapter port with the shared fail-closed Meta evaluator. */
export class EvaluatedThreadsCapabilityAuthorizer implements ThreadsCapabilityAuthorizer {
  private readonly definitions: ReadonlyMap<ThreadsCapabilityKey, MetaCapabilityDefinition>;

  constructor(
    private readonly evaluator: MetaCapabilityEvaluator,
    private readonly evidence: ThreadsCapabilityEvidenceProvider,
    apiVersion: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    if (!/^v[1-9][0-9]*\.[0-9]+$/.test(apiVersion)) {
      throw new Error("THREADS_CAPABILITY_API_VERSION_INVALID");
    }
    const definitions = Object.values(THREADS_CAPABILITY_CATALOG).map((requirement) => ({
      key: "threads." + requirement.key,
      product: "threads",
      operationKey: requirement.key,
      apiVersion,
      requiredOAuthScopes: requirement.requiredOAuthScopes,
      requiredAssetTasks: [],
      requiredEntitlements: [],
      requiresAppReview: false,
      requiresConsentAndLegalBasis: true,
      requiresExplicitApproval: requirement.requiresExplicitApproval,
    } satisfies MetaCapabilityDefinition));
    this.definitions = new Map(definitions.map((definition) => [
      definition.operationKey as ThreadsCapabilityKey,
      Object.freeze(definition),
    ]));
  }

  async authorize(input: {
    readonly tenantId: string;
    readonly profileId: string;
    readonly capability: ThreadsCapabilityKey;
  }): Promise<{
    readonly state: "available" | "unavailable" | "unknown";
    readonly apiVersion: string;
    readonly reasonCodes: readonly string[];
  }> {
    const definition = this.definitions.get(input.capability);
    if (!definition) {
      return {
        state: "unknown",
        apiVersion: "",
        reasonCodes: ["THREADS_CAPABILITY_DEFINITION_MISSING"],
      };
    }
    const evidence = await this.evidence.load(input);
    const decision = this.evaluator.evaluate(definition, evidence, this.now());
    return Object.freeze({
      state: decision.state,
      apiVersion: decision.apiVersion,
      reasonCodes: Object.freeze(decision.reasons.map((reason) => reason.code)),
    });
  }
}
