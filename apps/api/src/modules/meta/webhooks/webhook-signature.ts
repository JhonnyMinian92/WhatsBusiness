import { createHmac, timingSafeEqual } from "node:crypto";

export class MetaWebhookSignatureVerifier {
  verify(rawBody: Uint8Array, signatureHeader: string | undefined, appSecret: string): boolean {
    if (!signatureHeader || !/^sha256=[a-f0-9]{64}$/i.test(signatureHeader)) return false;
    const received = Buffer.from(signatureHeader.slice("sha256=".length), "hex");
    const expected = createHmac("sha256", appSecret).update(rawBody).digest();
    return received.length === expected.length && timingSafeEqual(received, expected);
  }
}

export class MetaWebhookChallengeVerifier {
  verify(input: {
    mode: string | undefined;
    suppliedToken: string | undefined;
    expectedToken: string;
    challenge: string | undefined;
  }): string | null {
    if (input.mode !== "subscribe" || !input.suppliedToken || !input.challenge) return null;
    const supplied = Buffer.from(input.suppliedToken);
    const expected = Buffer.from(input.expectedToken);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
    return input.challenge;
  }
}
