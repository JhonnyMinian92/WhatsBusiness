import assert from "node:assert/strict";
import test from "node:test";
import type { OidcClaims } from "../oidc-auth.guard.js";
import { OidcStepUpEvidenceVerifier } from "./step-up-evidence.js";

function claims(overrides: Partial<OidcClaims> = {}): OidcClaims {
  return {
    issuer: "https://issuer.synthetic.test",
    subject: "synthetic-approver",
    audience: ["whatsbusiness-web"],
    expiresAt: 1_900_000_000,
    displayName: "Synthetic Approver",
    authTime: 1_799_999_900,
    authenticationContext: "urn:synthetic:loa:2",
    authenticationMethods: ["pwd", "otp"],
    ...overrides,
  };
}

function withPolicy<T>(
  values: {
    readonly age?: string;
    readonly acr?: string;
    readonly amr?: string;
  },
  callback: () => T,
): T {
  const keys = [
    "STEP_UP_MAX_AGE_SECONDS",
    "STEP_UP_ALLOWED_ACR",
    "STEP_UP_ALLOWED_AMR",
  ] as const;
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  try {
    if (values.age === undefined) delete process.env["STEP_UP_MAX_AGE_SECONDS"];
    else process.env["STEP_UP_MAX_AGE_SECONDS"] = values.age;
    if (values.acr === undefined) delete process.env["STEP_UP_ALLOWED_ACR"];
    else process.env["STEP_UP_ALLOWED_ACR"] = values.acr;
    if (values.amr === undefined) delete process.env["STEP_UP_ALLOWED_AMR"];
    else process.env["STEP_UP_ALLOWED_AMR"] = values.amr;
    return callback();
  } finally {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("step-up accepts recent signed authentication context allowlisted by the issuer contract", () => {
  withPolicy({
    age: "300",
    acr: "urn:synthetic:loa:2",
    amr: "otp,webauthn",
  }, () => {
    const result = new OidcStepUpEvidenceVerifier().verify(claims(), 1_800_000_000);
    assert.equal(result.verified, true);
    assert.equal(result.authenticatedAt, 1_799_999_900);
  });
});

test("step-up accepts a specifically allowlisted authentication method", () => {
  withPolicy({
    age: "300",
    acr: "urn:synthetic:loa:3",
    amr: "otp,webauthn",
  }, () => {
    const result = new OidcStepUpEvidenceVerifier().verify(
      claims({ authenticationContext: null, authenticationMethods: ["pwd", "webauthn"] }),
      1_800_000_000,
    );
    assert.equal(result.verified, true);
  });
});

test("step-up denies when authentication time is absent", () => {
  withPolicy({ acr: "urn:synthetic:loa:2" }, () => {
    const result = new OidcStepUpEvidenceVerifier().verify(
      claims({ authTime: null }),
      1_800_000_000,
    );
    assert.equal(result.verified, false);
    assert.equal(result.failureReason, "STEP_UP_AUTH_TIME_MISSING");
  });
});

test("step-up denies stale or future authentication timestamps", () => {
  withPolicy({ acr: "urn:synthetic:loa:2" }, () => {
    const verifier = new OidcStepUpEvidenceVerifier();
    assert.equal(
      verifier.verify(claims({ authTime: 1_799_999_000 }), 1_800_000_000).failureReason,
      "STEP_UP_AUTHENTICATION_TOO_OLD",
    );
    assert.equal(
      verifier.verify(claims({ authTime: 1_800_000_100 }), 1_800_000_000).failureReason,
      "STEP_UP_AUTHENTICATION_IN_FUTURE",
    );
  });
});

test("step-up denies methods not explicitly configured by the issuer contract", () => {
  withPolicy({ acr: "urn:trusted:high", amr: "webauthn" }, () => {
    const result = new OidcStepUpEvidenceVerifier().verify(claims(), 1_800_000_000);
    assert.equal(result.verified, false);
    assert.equal(result.failureReason, "STEP_UP_METHOD_NOT_ACCEPTED");
  });
});

test("step-up fails closed when no assurance allowlist is configured", () => {
  withPolicy({}, () => {
    const result = new OidcStepUpEvidenceVerifier().verify(claims(), 1_800_000_000);
    assert.equal(result.verified, false);
    assert.equal(result.failureReason, "STEP_UP_POLICY_NOT_CONFIGURED");
  });
});

test("step-up rejects invalid freshness policy configuration", () => {
  withPolicy({ age: "3600", acr: "urn:synthetic:loa:2" }, () => {
    const result = new OidcStepUpEvidenceVerifier().verify(claims(), 1_800_000_000);
    assert.equal(result.verified, false);
    assert.equal(result.failureReason, "STEP_UP_POLICY_NOT_CONFIGURED");
  });
});
