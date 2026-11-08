import { BadRequestException, ConflictException } from "@nestjs/common";
import { createHash } from "node:crypto";

/** Shared idempotency rules for every command in the CRM Contacts aggregate. */
export function assertIdempotencyKey(value: string): void {
  if (typeof value !== "string" || value.length < 16 || value.length > 255 || !/^[\x21-\x7e]+$/.test(value)) {
    throw new BadRequestException({
      code: "CRM_IDEMPOTENCY_KEY_INVALID",
      detail: "Se requiere Idempotency-Key de 16 a 255 caracteres ASCII visibles.",
    });
  }
}

/** Hashes the normalized command and scope without storing the raw request body. */
export function hashContactCommand(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new TypeError("CRM_COMMAND_SERIALIZATION_FAILED");
  return createHash("sha256").update(serialized, "utf8").digest("hex");
}

export function assertSameIdempotencyRequest(existing: string, expected: string): void {
  if (existing !== expected) {
    throw new ConflictException({
      code: "CRM_IDEMPOTENCY_KEY_REUSED",
      detail: "La clave de idempotencia ya fue utilizada para una solicitud diferente.",
    });
  }
}
