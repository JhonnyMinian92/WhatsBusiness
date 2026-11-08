import {
  normalizeCreativeText,
  type CreativeSimilarityProfile,
  type CreativeVariantRecord,
} from "./creative-variant.js";

export interface CreativeSimilarityResult {
  readonly score: number;
  readonly reasons: readonly ("same_asset" | "near_identical_copy" | "similar_copy" | "similar_visual")[];
  readonly comparisonAvailable: boolean;
}

export interface CreativeDuplicateCandidate {
  readonly variantId: string;
  readonly score: number;
  readonly reasons: readonly string[];
}

export function compareCreativeSimilarity(
  left: CreativeSimilarityProfile,
  right: CreativeSimilarityProfile,
): CreativeSimilarityResult {
  const reasons: CreativeSimilarityResult["reasons"][number][] = [];
  if (left.assetSha256 !== null && right.assetSha256 !== null
    && left.assetSha256.toLowerCase() === right.assetSha256.toLowerCase()) {
    reasons.push("same_asset");
  }
  const leftTokens = new Set(tokens(left.normalizedText));
  const rightTokens = new Set(tokens(right.normalizedText));
  const textSimilarity = jaccard(leftTokens, rightTokens);
  if (textSimilarity >= 0.96) reasons.push("near_identical_copy");
  else if (textSimilarity >= 0.78) reasons.push("similar_copy");

  let visualSimilarity: number | null = null;
  if (isHash64(left.perceptualHash64) && isHash64(right.perceptualHash64)) {
    visualSimilarity = 1 - (hammingDistance(left.perceptualHash64, right.perceptualHash64) / 64);
    if (visualSimilarity >= 0.9) reasons.push("similar_visual");
  }
  const score = Math.max(
    left.assetSha256 !== null && left.assetSha256 === right.assetSha256 ? 1 : 0,
    textSimilarity,
    visualSimilarity ?? 0,
  );
  return Object.freeze({
    score: roundScore(score),
    reasons: Object.freeze(reasons),
    comparisonAvailable: leftTokens.size > 0 && rightTokens.size > 0
      || visualSimilarity !== null
      || (left.assetSha256 !== null && right.assetSha256 !== null),
  });
}

export function findNearDuplicateCreativeCandidates(
  draft: CreativeSimilarityProfile,
  candidates: readonly CreativeVariantRecord[],
  threshold = 0.88,
): readonly CreativeDuplicateCandidate[] {
  if (!Number.isFinite(threshold) || threshold < 0.5 || threshold > 1) {
    throw new Error("CREATIVE_SIMILARITY_THRESHOLD_INVALID");
  }
  const results = candidates
    .filter((candidate) => candidate.status !== "retired")
    .map((candidate) => {
      const comparison = compareCreativeSimilarity(draft, candidate.similarityProfile);
      return {
        variantId: candidate.id,
        score: comparison.score,
        reasons: comparison.reasons,
      };
    })
    .filter((candidate) => candidate.score >= threshold)
    .sort((left, right) => right.score - left.score || left.variantId.localeCompare(right.variantId));
  return Object.freeze(results.map((candidate) => Object.freeze(candidate)));
}

export function buildSimilarityProfileFromText(
  value: string,
  assetSha256: string | null = null,
  perceptualHash64: string | null = null,
): CreativeSimilarityProfile {
  return Object.freeze({
    normalizedText: normalizeCreativeText(value),
    assetSha256,
    perceptualHash64,
  });
}

function tokens(value: string): readonly string[] {
  return normalizeCreativeText(value).split(" ").filter((token) => token.length > 0);
}

function jaccard(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  if (left.size === 0 && right.size === 0) return 0;
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function isHash64(value: string | null): value is string {
  return value !== null && /^[a-f0-9]{16}$/i.test(value);
}

function hammingDistance(left: string, right: string): number {
  let distance = 0;
  let a = BigInt("0x" + left);
  let b = BigInt("0x" + right);
  let xor = a ^ b;
  while (xor > 0n) {
    distance += Number(xor & 1n);
    xor >>= 1n;
  }
  return distance;
}

function roundScore(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
