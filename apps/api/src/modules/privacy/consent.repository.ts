export type ConsentChannel = "WHATSAPP" | "MESSENGER" | "INSTAGRAM" | "EMAIL" | "SMS" | "WEB";
export type ConsentPurpose = "SERVICE" | "MARKETING" | "ANALYTICS" | "PERSONALIZATION";

export interface ConsentRecordInput {
  readonly tenantId: string;
  readonly subjectReference: string;
  readonly channel: ConsentChannel;
  readonly purpose: ConsentPurpose;
  readonly status: "GRANTED" | "REVOKED";
  readonly source: string;
  readonly evidenceReference?: string;
  readonly recordedBy: string;
}

export interface ConsentRepository {
  append(input: ConsentRecordInput): Promise<void>;
  hasActiveConsent(input: {
    tenantId: string;
    subjectReference: string;
    channel: ConsentChannel;
    purpose: ConsentPurpose;
  }): Promise<boolean>;
}
