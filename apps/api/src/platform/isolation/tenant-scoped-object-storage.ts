import { createHash } from "node:crypto";
import { TenantResourceNamespace } from "./tenant-resource-namespace.js";

export interface ObjectStorageMetadata {
  readonly contentType: string;
  readonly checksumSha256: string;
}

export interface ObjectStorage {
  put(key: string, body: Uint8Array, metadata: ObjectStorageMetadata): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}

/**
 * Enforces tenant-owned object keys before delegating to an S3-compatible store.
 * Provider bucket policy must additionally deny public access and enforce TLS/KMS.
 */
export class TenantScopedObjectStorage {
  constructor(
    private readonly storage: ObjectStorage,
    private readonly namespaces: TenantResourceNamespace = new TenantResourceNamespace(),
  ) {}

  put(
    tenantId: string,
    resource: string,
    key: string,
    body: Uint8Array,
    metadata: ObjectStorageMetadata,
  ): Promise<void> {
    if (!(body instanceof Uint8Array) || body.byteLength === 0) {
      throw new Error("Stored objects must be non-empty byte arrays.");
    }
    if (!/^[-\w.+]+\/[\w.+-]+$/.test(metadata.contentType)) {
      throw new Error("A valid MIME content type is required.");
    }
    const actualChecksum = createHash("sha256").update(body).digest("hex");
    if (!/^[0-9a-f]{64}$/i.test(metadata.checksumSha256)
      || actualChecksum !== metadata.checksumSha256.toLowerCase()) {
      throw new Error("Object SHA-256 checksum does not match its content.");
    }
    return this.storage.put(
      this.namespaces.objectKey(tenantId, resource, key),
      body,
      metadata,
    );
  }

  get(tenantId: string, resource: string, key: string): Promise<Uint8Array | null> {
    return this.storage.get(this.namespaces.objectKey(tenantId, resource, key));
  }

  delete(tenantId: string, resource: string, key: string): Promise<void> {
    return this.storage.delete(this.namespaces.objectKey(tenantId, resource, key));
  }
}
