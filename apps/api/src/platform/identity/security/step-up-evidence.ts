import type { OidcClaims } from "../oidc-auth.guard.js";

export type StepUpFailureReason =
  | "STEP_UP_AUTH_TIME_MISSING"
  | "STEP_UP_AUTHENTICATION_TOO_OLD"
  | "STEP_UP_AUTHENTICATION_IN_FUTURE"
  | "STEP_UP_METHOD_NOT_ACCEPTED"
  | "STEP_UP_POLICY_NOT_CONFIGURED"
  | "STEP_UP_POLICY_INVALID";

export interface StepUpEvidence {
  readonly verified: boolean;
  readonly authenticatedAt: number | null;
  readonly authenticationContext: string | null;
  readonly authenticationMethods: readonly string[];
  readonly failureReason?: StepUpFailureReason;
}

export interface StepUpRequirements {
  readonly maximumAgeSeconds: number;
  readonly acceptedAuthenticationContexts: readonly string[];
  readonly acceptedAuthenticationMethods: readonly string[];
}

export interface StepUpEvidenceVerifier {
  verify(claims: OidcClaims, now?: number): StepUpEvidence;
}

/**
 * Validates only signed claims emitted by the configured OIDC issuer.
 * It never trusts a client boolean/header. ACR/AMR semantics are issuer-specific:
 * production must configure allowlisted values from the actual IdP contract.
 */
export class OidcStepUpEvidenceVerifier implements StepUpEvidenceVerifier {
  verify(claims: OidcClaims, now = Math.floor(Date.now() / 1000)): StepUpEvidence {
    const requirements = readStepUpRequirements();
    if (!requirements) {
      return this.deny(claims, "STEP_UP_POLICY_NOT_CONFIGURED");
    }
    if (!Number.isSafeInteger(now) || now < 0) {
      return this.deny(claims, "STEP_UP_POLICY_INVALID");
    }

    if (claims.authTime === null) {
      return this.deny(claims, "STEP_UP_AUTH_TIME_MISSING");
    }
    if (claims.authTime > now + 30) {
      return this.deny(claims, "STEP_UP_AUTHENTICATION_IN_FUTURE");
    }
    if (claims.authTime > now || now - claims.authTime > requirements.maximumAgeSeconds) {
      return this.deny(claims, "STEP_UP_AUTHENTICATION_TOO_OLD");
    }

    const contextAccepted = claims.authenticationContext !== null
      && requirements.acceptedAuthenticationContexts.includes(claims.authenticationContext);
    const methodAccepted = claims.authenticationMethods.some((method) =>
      requirements.acceptedAuthenticationMethods.includes(method)
    );
    if (!contextAccepted && !methodAccepted) {
      return this.deny(claims, "STEP_UP_METHOD_NOT_ACCEPTED");
    }

    return {
      verified: true,
      authenticatedAt: claims.authTime,
      authenticationContext: claims.authenticationContext,
      authenticationMethods: claims.authenticationMethods,
    };
  }

  private deny(claims: OidcClaims, failureReason: StepUpFailureReason): StepUpEvidence {
    return {
      verified: false,
      authenticatedAt: claims.authTime,
      authenticationContext: claims.authenticationContext,
      authenticationMethods: claims.authenticationMethods,
      failureReason,
    };
  }
}

function readStepUpRequirements(): StepUpRequirements | null {
  const rawAge = process.env["STEP_UP_MAX_AGE_SECONDS"]?.trim();
  const maximumAgeSeconds = rawAge === undefined || rawAge === ""
    ? 300
    : Number(rawAge);
  const acceptedAuthenticationContexts = parseAllowlist(
    process.env["STEP_UP_ALLOWED_ACR"],
  );
  const acceptedAuthenticationMethods = parseAllowlist(
    process.env["STEP_UP_ALLOWED_AMR"],
  );

  if (
    !Number.isSafeInteger(maximumAgeSeconds)
    || maximumAgeSeconds < 30
    || maximumAgeSeconds > 1800
    || (acceptedAuthenticationContexts.length === 0
      && acceptedAuthenticationMethods.length === 0)
  ) {
    return null;
  }

  return {
    maximumAgeSeconds,
    acceptedAuthenticationContexts,
    acceptedAuthenticationMethods,
  };
}

function parseAllowlist(raw: string | undefined): readonly string[] {
  if (!raw?.trim()) return [];
  const values = raw.split(",").map((value) => value.trim());
  if (
    values.some((value) => value.length === 0 || value.length > 512)
    || new Set(values).size !== values.length
  ) {
    return [];
  }
  return values;
}
