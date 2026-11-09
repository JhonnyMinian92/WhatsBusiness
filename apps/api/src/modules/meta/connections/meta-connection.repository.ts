import type { MetaConnection, MetaConnectionMode, MetaConnectionStatus } from "../shared/meta-types.js";

export interface CreateMetaConnectionInput {
  readonly tenantId: string;
  readonly connectedBy: string;
  readonly mode: MetaConnectionMode;
  readonly providerUserId: string | null;
  readonly providerUserName: string | null;
}

export interface MetaConnectionRepository {
  create(input: CreateMetaConnectionInput): Promise<MetaConnection>;
  findById(tenantId: string, connectionId: string): Promise<MetaConnection | null>;
  listByTenant(tenantId: string): Promise<readonly MetaConnection[]>;
  updateStatus(tenantId: string, connectionId: string, status: MetaConnectionStatus): Promise<void>;
}
