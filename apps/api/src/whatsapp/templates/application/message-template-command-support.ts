import { BadRequestException, ConflictException } from "@nestjs/common";
import { createHash } from "node:crypto";

export type TemplateCommandKey = "create" | "update" | "archive";

export function assertTemplateIdempotencyKey(value: string): void {
  if (typeof value !== "string" || value.length < 16 || value.length > 255 || !/^[\x21-\x7e]+$/.test(value)) {
    throw new BadRequestException({
      code: "WHATSAPP_TEMPLATE_IDEMPOTENCY_KEY_INVALID",
      detail: "Se requiere Idempotency-Key de 16 a 255 caracteres ASCII visibles.",
    });
  }
}

export function hashTemplateCommand(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new TypeError("WHATSAPP_TEMPLATE_COMMAND_SERIALIZATION_FAILED");
  return createHash("sha256").update(serialized, "utf8").digest("hex");
}

export function assertSameTemplateCommand(existing: string, expected: string): void {
  if (existing !== expected) {
    throw new ConflictException({
      code: "WHATSAPP_TEMPLATE_IDEMPOTENCY_KEY_REUSED",
      detail: "La clave de idempotencia ya fue utilizada para una solicitud diferente.",
    });
  }
}
