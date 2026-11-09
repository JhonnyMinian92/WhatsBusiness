import type { PoolClient } from "pg";
import type { PrivacyRightsRequestInput, ValidatedPrivacyRightsRequest } from "../domain/privacy-rights.policy.js";

export interface PrivacyRequestSummary {
  readonly requestId: string;
  readonly tenantId: string;
  readonly subjectType: ValidatedPrivacyRightsRequest["subjectType"];
  readonly subjectId: string;
  readonly action: ValidatedPrivacyRightsRequest["action"];
  readonly status: "requested" | "approved" | "in_progress" | "completed" | "failed" | "cancelled" | "rejected";
  readonly approvalId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface PrivacyRightsRepositoryPort {
  findByIdempotency(input: Pick<PrivacyRightsRequestInput,"tenantId"|"requesterUserId"|"idempotencyKey"> & { readonly authzVersion: number }): Promise<PrivacyRequestSummary | null>;
  create(input: ValidatedPrivacyRightsRequest, requestId: string, authzVersion: number): Promise<PrivacyRequestSummary>;
  stageWithApproval(client: PoolClient, input: ValidatedPrivacyRightsRequest, requestId: string, approvalId: string): Promise<void>;
  get(tenantId: string, requestId: string): Promise<PrivacyRequestSummary | null>;
}
export const PRIVACY_RIGHTS_REPOSITORY = Symbol("PRIVACY_RIGHTS_REPOSITORY");
