import assert from "node:assert/strict";
import test from "node:test";
import { compareCreativeSimilarity } from "./creative-similarity.js";

test("identical asset hash is a duplicate even if copy changes", () => {
  const result = compareCreativeSimilarity(
    { normalizedText: "Nuevo hook de ventas", assetSha256: "a".repeat(64), perceptualHash64: null },
    { normalizedText: "Oferta comercial diferente", assetSha256: "a".repeat(64), perceptualHash64: null },
  );
  assert.equal(result.score, 1);
  assert.ok(result.reasons.includes("same_asset"));
});

test("near identical normalized copy is detected", () => {
  const result = compareCreativeSimilarity(
    { normalizedText: "responde mas rapido a tus clientes y vende mejor", assetSha256: null, perceptualHash64: null },
    { normalizedText: "responde más rápido a tus clientes y vende mejor", assetSha256: null, perceptualHash64: null },
  );
  assert.ok(result.score >= 0.96);
  assert.ok(result.reasons.includes("near_identical_copy"));
});

test("perceptual hash detects close visual assets without claiming pixel identity", () => {
  const result = compareCreativeSimilarity(
    { normalizedText: "hook uno", assetSha256: "a".repeat(64), perceptualHash64: "ffffffffffffff00" },
    { normalizedText: "hook dos", assetSha256: "b".repeat(64), perceptualHash64: "ffffffffffffff01" },
  );
  assert.ok(result.score >= 0.98);
  assert.ok(result.reasons.includes("similar_visual"));
});

test("empty independent profiles do not falsely produce an exact duplicate", () => {
  const result = compareCreativeSimilarity(
    { normalizedText: "", assetSha256: null, perceptualHash64: null },
    { normalizedText: "", assetSha256: null, perceptualHash64: null },
  );
  assert.equal(result.score, 0);
  assert.equal(result.comparisonAvailable, false);
});
