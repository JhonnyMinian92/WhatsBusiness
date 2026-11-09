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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;
const SEGMENT_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

export class TenantScopedObjectStorage {
  constructor(private readonly provider: ObjectStorage) {}

  async put(
    tenantId: string,
    namespace: string,
    key: string,
    body: Uint8Array,
    metadata: ObjectStorageMetadata
  ): Promise<void> {
    const scopedKey = this.scopedKey(tenantId, namespace, key);
    if (!metadata || !/^[-\w.+]+\/[-\w.+]+$/.test(metadata.contentType)) {
      throw new Error("A valid content type is required for stored objects.");
    }
    if (!/^[a-f0-9]{64}$/i.test(metadata.checksumSha256)) {
      throw new Error("A valid SHA-256 checksum is required for stored objects.");
    }
    const actualChecksum = createHash("sha256").update(body).digest("hex");
    if (actualChecksum !== metadata.checksumSha256.toLowerCase()) {
      throw new Error("Object checksum does not match the supplied integrity metadata.");
    }
    await this.provider.put(scopedKey, Uint8Array.from(body), metadata);
  }

  get(tenantId: string, namespace: string, key: string): Promise<Uint8Array | null> {
    return this.provider.get(this.scopedKey(tenantId, namespace, key));
  }

  delete(tenantId: string, namespace: string, key: string): Promise<void> {
    return this.provider.delete(this.scopedKey(tenantId, namespace, key));
  }

  private scopedKey(tenantId: string, namespace: string, key: string): string {
    if (!UUID_PATTERN.test(tenantId) || !NAMESPACE_PATTERN.test(namespace)) {
      throw new Error("A valid tenant UUID and object namespace are required.");
    }
    const segments = key.split("/");
    if (!key || segments.some((segment) => !SEGMENT_PATTERN.test(segment) || segment === "." || segment === "..")) {
      throw new Error("Object key contains an invalid or traversal path segment.");
    }
    return "tenants/" + tenantId + "/" + namespace + "/" + segments.join("/");
  }
}
