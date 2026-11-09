import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ApplicationError } from "../../platform/errors/application-error.js";
import type { DataDeletionRepository } from "./data-deletion.repository.js";

interface MetaSignedRequestPayload {
  readonly algorithm?: string;
  readonly user_id?: string;
  readonly issued_at?: number;
}

export class MetaDataDeletionService {
  constructor(
    private readonly repository: DataDeletionRepository,
    private readonly appSecret: string,
    private readonly publicStatusUrl: string
  ) {}

  async handleSignedRequest(signedRequest: string): Promise<{
    url: string;
    confirmation_code: string;
  }> {
    const decoded = this.verifyAndDecode(signedRequest);
    if (!decoded.user_id) throw new ApplicationError("VALIDATION_ERROR", "Meta deletion request does not include a user id.");
    const confirmationCode = randomBytes(24).toString("base64url");
    const providerUserReferenceHash = createHmac("sha256", this.appSecret)
      .update(decoded.user_id)
      .digest("hex");
    const confirmationCodeHash = createHash("sha256").update(confirmationCode).digest("hex");
    await this.repository.create({
      provider: "META",
      providerUserReferenceHash,
      confirmationCodeHash,
      issuedAt: typeof decoded.issued_at === "number" ? new Date(decoded.issued_at * 1000) : null
    });
    return { url: this.publicStatusUrl, confirmation_code: confirmationCode };
  }

  async status(confirmationCode: string): Promise<{
    request_id: string;
    status: string;
    created_at: string;
    completed_at: string | null;
  }> {
    if (!confirmationCode || confirmationCode.length > 256) {
      throw new ApplicationError("VALIDATION_ERROR", "A valid confirmation code is required.");
    }
    const hash = createHash("sha256").update(confirmationCode).digest("hex");
    const request = await this.repository.findByConfirmationHash(hash);
    if (!request) throw new ApplicationError("NOT_FOUND", "Data deletion request was not found.");
    return {
      request_id: request.requestId,
      status: request.status,
      created_at: request.createdAt.toISOString(),
      completed_at: request.completedAt?.toISOString() ?? null
    };
  }

  private verifyAndDecode(signedRequest: string): MetaSignedRequestPayload {
    const [encodedSignature, encodedPayload, extra] = signedRequest.split(".");
    if (!encodedSignature || !encodedPayload || extra !== undefined) {
      throw new ApplicationError("VALIDATION_ERROR", "Meta signed_request has an invalid format.");
    }
    const receivedSignature = Buffer.from(encodedSignature, "base64url");
    const expectedSignature = createHmac("sha256", this.appSecret)
      .update(encodedPayload)
      .digest();
    if (receivedSignature.length !== expectedSignature.length
      || !timingSafeEqual(receivedSignature, expectedSignature)) {
      throw new ApplicationError("UNAUTHENTICATED", "Meta signed_request signature is invalid.");
    }
    let payload: unknown;
    try {
      payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    } catch {
      throw new ApplicationError("VALIDATION_ERROR", "Meta signed_request payload is invalid.");
    }
    if (!payload || typeof payload !== "object"
      || (payload as MetaSignedRequestPayload).algorithm !== "HMAC-SHA256") {
      throw new ApplicationError("UNAUTHENTICATED", "Meta signed_request algorithm is not supported.");
    }
    return payload as MetaSignedRequestPayload;
  }
}
