import { Buffer } from "node:buffer";

export class RespServerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RespServerError";
  }
}

export type RespValue = string | Buffer | number | null | RespServerError | readonly RespValue[];

const CRLF = Buffer.from("\r\n");
const MAX_COMMAND_BYTES = 16 * 1024 * 1024;
const MAX_BULK_STRING_BYTES = 16 * 1024 * 1024;
const MAX_ARRAY_ITEMS = 100_000;
const MAX_NESTING_DEPTH = 32;

export function encodeRespCommand(argumentsList: readonly (string | Uint8Array)[]): Buffer {
  if (!Array.isArray(argumentsList) || argumentsList.length === 0 || argumentsList.length > 1_000) {
    throw new Error("A bounded non-empty Valkey command is required.");
  }
  const parts: Buffer[] = [Buffer.from("*" + String(argumentsList.length) + "\r\n", "ascii")];
  let totalBytes = parts[0]!.byteLength;
  for (const argument of argumentsList) {
    const value = typeof argument === "string" ? Buffer.from(argument, "utf8") : Buffer.from(argument);
    const header = Buffer.from("$" + String(value.byteLength) + "\r\n", "ascii");
    totalBytes += header.byteLength + value.byteLength + CRLF.byteLength;
    if (totalBytes > MAX_COMMAND_BYTES) throw new Error("Valkey command exceeds the configured size limit.");
    parts.push(header, value, CRLF);
  }
  return Buffer.concat(parts, totalBytes);
}

interface ParsedResponse {
  readonly value: RespValue;
  readonly nextOffset: number;
}

function readLine(buffer: Buffer, offset: number): { value: string; nextOffset: number } | null {
  const end = buffer.indexOf(CRLF, offset);
  if (end < 0) return null;
  return { value: buffer.toString("utf8", offset, end), nextOffset: end + CRLF.byteLength };
}

export function parseRespResponse(buffer: Buffer, offset = 0, depth = 0): ParsedResponse | null {
  if (depth > MAX_NESTING_DEPTH) throw new Error("Valkey response nesting exceeds the configured limit.");
  if (offset >= buffer.byteLength) return null;
  const marker = buffer[offset]!;
  const line = readLine(buffer, offset + 1);
  if (!line) return null;

  if (marker === 0x2b) return { value: line.value, nextOffset: line.nextOffset };
  if (marker === 0x2d) return { value: new RespServerError(line.value), nextOffset: line.nextOffset };
  if (marker === 0x3a) {
    const integer = Number(line.value);
    if (!Number.isSafeInteger(integer)) throw new Error("Invalid Valkey integer response.");
    return { value: integer, nextOffset: line.nextOffset };
  }
  if (marker === 0x24) {
    const length = Number(line.value);
    if (!Number.isSafeInteger(length) || length < -1 || length > MAX_BULK_STRING_BYTES) {
      throw new Error("Invalid Valkey bulk-string length.");
    }
    if (length === -1) return { value: null, nextOffset: line.nextOffset };
    const end = line.nextOffset + length;
    if (buffer.byteLength < end + CRLF.byteLength) return null;
    if (buffer[end] !== 0x0d || buffer[end + 1] !== 0x0a) throw new Error("Malformed Valkey bulk-string terminator.");
    return { value: Buffer.from(buffer.subarray(line.nextOffset, end)), nextOffset: end + CRLF.byteLength };
  }
  if (marker === 0x2a) {
    const count = Number(line.value);
    if (!Number.isSafeInteger(count) || count < -1 || count > MAX_ARRAY_ITEMS) throw new Error("Invalid Valkey array length.");
    if (count === -1) return { value: null, nextOffset: line.nextOffset };
    const values: RespValue[] = [];
    let cursor = line.nextOffset;
    for (let index = 0; index < count; index += 1) {
      const item = parseRespResponse(buffer, cursor, depth + 1);
      if (!item) return null;
      values.push(item.value);
      cursor = item.nextOffset;
    }
    return { value: Object.freeze(values), nextOffset: cursor };
  }
  throw new Error("Unsupported Valkey RESP response type.");
}
