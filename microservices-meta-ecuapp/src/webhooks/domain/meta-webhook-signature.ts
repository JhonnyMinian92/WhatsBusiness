import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const META_WEBHOOK_MAX_BODY_BYTES = 3 * 1024 * 1024;

export function verifyMetaWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!Buffer.isBuffer(rawBody) || rawBody.length < 1 || rawBody.length > META_WEBHOOK_MAX_BODY_BYTES) return false;
  if (typeof signatureHeader !== "string" || !/^sha256=[0-9a-f]{64}$/i.test(signatureHeader)) return false;
  if (typeof appSecret !== "string" || appSecret.length < 1 || appSecret.length > 4_096) return false;

  const supplied = Buffer.from(signatureHeader.slice(7), "hex");
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function constantTimeHexEquals(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(left) || !/^[0-9a-f]{64}$/i.test(right)) return false;
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
