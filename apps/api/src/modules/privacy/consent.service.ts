import { ApplicationError } from "../../platform/errors/application-error.js";
import type { ConsentChannel, ConsentPurpose, ConsentRecordInput, ConsentRepository } from "./consent.repository.js";

export class ConsentService {
  constructor(private readonly repository: ConsentRepository) {}

  async record(input: ConsentRecordInput): Promise<void> {
    if (!input.subjectReference || input.subjectReference.length > 256
      || !input.source || input.source.length > 100) {
      throw new ApplicationError("VALIDATION_ERROR", "Consent subject and source are required.");
    }
    await this.repository.append(input);
  }

  hasActiveConsent(input: {
    tenantId: string;
    subjectReference: string;
    channel: ConsentChannel;
    purpose: ConsentPurpose;
  }): Promise<boolean> {
    return this.repository.hasActiveConsent(input);
  }

  async assertMarketingConsent(input: {
    tenantId: string;
    subjectReference: string;
    channel: ConsentChannel;
  }): Promise<void> {
    const granted = await this.hasActiveConsent({ ...input, purpose: "MARKETING" });
    if (!granted) {
      throw new ApplicationError("FORBIDDEN", "An active marketing consent is required for this tenant, subject, and channel.");
    }
  }
}
