import { createHash } from "node:crypto";

export interface ObjectStorageMetadata {
  readonly contentType: string;
  readonly checksumSha256: string;
}

export interface ObjectStorage {
  put(key: string, body: Uint8Array, metadata?: ObjectStorageMetadata): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}

/** Enforces tenant-prefixed storage keys and verifies SHA-256 before persistence. */
export class TenantScopedObjectStorage {
  constructor(private readonly provider: ObjectStorage) {}

  async put(
    tenantId: string,
    namespace: string,
    key: string,
    body: Uint8Array,
    metadata: ObjectStorageMetadata,
  ): Promise<void> {
    const scopedKey = buildScopedKey(tenantId, namespace, key);
    validateMetadata(metadata);
    if (!(body instanceof Uint8Array)) throw new Error("Object body must be a Uint8Array.");
    const checksum = createHash("sha256").update(body).digest("hex");
    if (checksum.toLowerCase() !== metadata.checksumSha256.toLowerCase()) {
      throw new Error("Object body checksum does not match metadata.");
    }
    await this.provider.put(scopedKey, Uint8Array.from(body), Object.freeze({ ...metadata }));
  }

  async get(tenantId: string, namespace: string, key: string): Promise<Uint8Array | null> {
    const body = await this.provider.get(buildScopedKey(tenantId, namespace, key));
    return body === null ? null : Uint8Array.from(body);
  }

  async delete(tenantId: string, namespace: string, key: string): Promise<void> {
    await this.provider.delete(buildScopedKey(tenantId, namespace, key));
  }
}

function buildScopedKey(tenantId: string, namespace: string, key: string): string {
  if (!UUID_PATTERN.test(tenantId)) throw new Error("A valid tenant UUID is required.");
  validateSegment(namespace, "namespace");
  if (typeof key !== "string" || key.trim().length === 0 || key.startsWith("/") || key.includes("\\")) {
    throw new Error("Object key must be a relative non-empty path.");
  }
  const segments = key.split("/");
  if (segments.some(segment => segment.length === 0 || segment === "." || segment === "..")) {
    throw new Error("Object key contains an invalid path segment.");
  }
  if (segments.some(segment => !/^[a-zA-Z0-9._-]+$/.test(segment))) {
    throw new Error("Object key contains unsupported characters.");
  }
  return `tenants/${tenantId}/${namespace}/${segments.join("/")}`;
}

function validateSegment(value: string, name: string): void {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(value)) throw new Error(`${name} is invalid.`);
}

function validateMetadata(metadata: ObjectStorageMetadata): void {
  if (!metadata || typeof metadata.contentType !== "string" || !/^[\w.+-]+\/[\w.+-]+$/.test(metadata.contentType)) {
    throw new Error("A valid content type is required.");
  }
  if (typeof metadata.checksumSha256 !== "string" || !/^[0-9a-f]{64}$/i.test(metadata.checksumSha256)) {
    throw new Error("A valid SHA-256 checksum is required.");
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
