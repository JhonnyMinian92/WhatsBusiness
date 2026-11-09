export type MetaConnectionMode = "BUSINESS_LOGIN" | "WHATSAPP_EMBEDDED_SIGNUP_V4" | "INSTAGRAM_LOGIN";
export type MetaConnectionStatus = "ACTIVE" | "REAUTH_REQUIRED" | "REVOKED" | "DISCONNECTED" | "ERROR";

export interface MetaTokenInspection {
  readonly appId: string;
  readonly isValid: boolean;
  readonly userId?: string;
  readonly tokenType?: string;
  readonly expiresAt?: Date;
  readonly dataAccessExpiresAt?: Date;
  readonly scopes: readonly string[];
  readonly granularScopes: readonly {
    readonly scope: string;
    readonly targetIds: readonly string[];
  }[];
}

export interface MetaAccessToken {
  readonly value: string;
  readonly tokenType: string;
  readonly expiresAt: Date | null;
  readonly dataAccessExpiresAt: Date | null;
  readonly scopes: readonly string[];
}

export interface MetaConnection {
  readonly id: string;
  readonly tenantId: string;
  readonly connectedBy: string;
  readonly mode: MetaConnectionMode;
  readonly status: MetaConnectionStatus;
  readonly providerUserId: string | null;
  readonly providerUserName: string | null;
  readonly createdAt: Date;
  readonly lastVerifiedAt: Date | null;
}

export interface MetaAssetSelection {
  readonly businessId?: string;
  readonly wabaId?: string;
  readonly phoneNumberId?: string;
}
