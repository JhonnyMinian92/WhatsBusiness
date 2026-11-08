export type ConversionDeliveryState =
  | "not_submitted" | "accepted_by_provider" | "rejected_by_provider" | "outcome_unknown";
export type ConversionDeduplicationState = "not_checked" | "unique_local" | "duplicate_local";

export type ProviderMatchQuality =
  | { readonly state: "provider_reported"; readonly provider: "meta"; readonly value: number; readonly observedAt: Date }
  | { readonly state: "unavailable"; readonly reason: "integration_not_configured" | "not_reported" | "account_not_eligible" };

export type ProviderAttribution =
  | { readonly state: "not_reported" }
  | {
      readonly state: "provider_reported";
      readonly provider: "meta";
      readonly attributedConversions: number;
      readonly windowStart: Date;
      readonly windowEnd: Date;
      readonly observedAt: Date;
    };

export interface ConversionMeasurementReport {
  readonly datasetId: string;
  readonly eventName: string;
  readonly eventId: string;
  readonly delivery: ConversionDeliveryState;
  readonly deduplication: ConversionDeduplicationState;
  readonly matchQuality: ProviderMatchQuality;
  readonly attribution: ProviderAttribution;
}

/** Provider observations only; never estimates match quality or attribution locally. */
export function createConversionMeasurementReport(
  input: ConversionMeasurementReport,
): Readonly<ConversionMeasurementReport> {
  if (!isSafeIdentifier(input.datasetId, 128)
      || !isSafeIdentifier(input.eventName, 100)
      || !isSafeIdentifier(input.eventId, 255)) {
    throw new Error("Conversion measurement report identifiers are invalid.");
  }
  if (!["not_submitted", "accepted_by_provider", "rejected_by_provider", "outcome_unknown"].includes(input.delivery)) {
    throw new Error("Conversion delivery state is invalid.");
  }
  if (!["not_checked", "unique_local", "duplicate_local"].includes(input.deduplication)) {
    throw new Error("Conversion deduplication state is invalid.");
  }
  if (input.matchQuality.state === "provider_reported") {
    if (input.matchQuality.provider !== "meta" || !Number.isFinite(input.matchQuality.value)
        || !isValidDate(input.matchQuality.observedAt)) {
      throw new Error("Provider match quality observation is invalid.");
    }
  } else if (!["integration_not_configured", "not_reported", "account_not_eligible"].includes(input.matchQuality.reason)) {
    throw new Error("Unavailable match quality reason is invalid.");
  }
  if (input.attribution.state === "provider_reported") {
    const { attributedConversions, windowStart, windowEnd, observedAt } = input.attribution;
    if (input.attribution.provider !== "meta"
        || !Number.isSafeInteger(attributedConversions) || attributedConversions < 0
        || !isValidDate(windowStart) || !isValidDate(windowEnd)
        || !isValidDate(observedAt) || windowStart.getTime() > windowEnd.getTime()) {
      throw new Error("Provider attribution observation is invalid.");
    }
  } else if (input.attribution.state !== "not_reported") {
    throw new Error("Attribution state is invalid.");
  }
  return Object.freeze({
    ...input,
    matchQuality: Object.freeze({ ...input.matchQuality }),
    attribution: Object.freeze({ ...input.attribution }),
  });
}

function isSafeIdentifier(value: string, maxLength: number): boolean {
  return typeof value === "string" && value.trim() === value && value.length > 0
    && value.length <= maxLength && !/[\u0000-\u001F\u007F]/.test(value);
}
function isValidDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}
