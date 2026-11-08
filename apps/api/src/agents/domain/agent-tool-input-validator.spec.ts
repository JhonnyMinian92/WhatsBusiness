import assert from "node:assert/strict";
import test from "node:test";
import { findAgentTool } from "./agent-tool-catalog.js";
import { validateAgentToolInput } from "./agent-tool-input-validator.js";

const createDraft = findAgentTool("ads.campaign.draft.create")!;
const valid = () => ({
  draft: {
    name: "Campaña Quito Leads",
    objective: "OUTCOME_LEADS",
    dailyBudget: { amount: "25.00", currency: "USD" },
    startsAt: "2026-11-09T05:00:00.000Z",
    endsAt: "2026-11-16T05:00:00.000Z",
    configuration: {
      targeting: { countries: ["EC"], ageMin: 21 },
      creativeReference: "creative-123",
    },
  },
  idempotencyKey: "draft-idempotency-0001",
});

test("valida un borrador con JSON schema y conserva un objeto inmutable", () => {
  const result = validateAgentToolInput(createDraft, valid());
  assert.equal(result.valid, true);
  assert.deepEqual(result.issues, []);
  assert.ok(Object.isFrozen(result.value));
});

test("rechaza propiedades no declaradas y campos de credenciales", () => {
  const extra = validateAgentToolInput(createDraft, {
    ...valid(),
    providerCampaignId: "forged",
  });
  const secret = validateAgentToolInput(createDraft, {
    ...valid(),
    draft: {
      ...valid().draft,
      configuration: { access_token: "secret" },
    },
  });
  assert.equal(extra.valid, false);
  assert.ok(extra.issues.some((issue) => issue.includes("UNKNOWN_PROPERTY")));
  assert.equal(secret.valid, false);
  assert.ok(secret.issues.some((issue) => issue.includes("FORBIDDEN_PROPERTY")));
});

test("rechaza claves débiles, dinero inválido y tipos inesperados", () => {
  assert.equal(
    validateAgentToolInput(createDraft, { ...valid(), idempotencyKey: "short" }).valid,
    false,
  );
  assert.equal(
    validateAgentToolInput(createDraft, {
      ...valid(),
      draft: { ...valid().draft, dailyBudget: { amount: "NaN", currency: "USD" } },
    }).valid,
    false,
  );
  assert.equal(validateAgentToolInput(createDraft, []).valid, false);
  assert.equal(validateAgentToolInput(createDraft, null).valid, false);
});

test("limita tamaño, profundidad y número de nodos de JSON", () => {
  const tooLarge = validateAgentToolInput(createDraft, {
    ...valid(),
    draft: {
      ...valid().draft,
      configuration: { note: "x".repeat(40_000) },
    },
  });
  let nested: Record<string, unknown> = { value: "x" };
  for (let index = 0; index < 12; index += 1) nested = { child: nested };
  const tooDeep = validateAgentToolInput(createDraft, {
    ...valid(),
    draft: { ...valid().draft, configuration: nested },
  });
  assert.equal(tooLarge.valid, false);
  assert.equal(tooDeep.valid, false);
});

test("acepta únicamente esquemas registrados en el catálogo", () => {
  assert.equal(findAgentTool("meta.raw_http.request"), null);
  assert.equal(findAgentTool("system.execute_shell"), null);
  assert.equal(findAgentTool("ads.campaign.get")?.effect, "read");
});
