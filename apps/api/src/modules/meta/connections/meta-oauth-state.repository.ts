import type { MetaConnectionMode } from "../shared/meta-types.js";

export interface MetaOAuthState {
  readonly stateHash: string;
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly mode: MetaConnectionMode;
  readonly expiresAt: Date;
}

export interface MetaOAuthStateRepository {
  create(state: MetaOAuthState): Promise<void>;
  consume(stateHash: string): Promise<MetaOAuthState | null>;
}
