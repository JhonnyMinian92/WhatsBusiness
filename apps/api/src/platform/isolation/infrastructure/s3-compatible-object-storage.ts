import { Buffer } from "node:buffer";
import { createHash, createHmac } from "node:crypto";
import type { ObjectStorage, ObjectStorageMetadata } from "../tenant-scoped-object-storage.js";

const MAX_OBJECT_BYTES = 50 * 1024 * 1024;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const EMPTY_SHA256 = createHash("sha256").update(new Uint8Array()).digest("hex");

export interface S3CompatibleStorageConfig {
  readonly endpoint: URL;
  readonly bucket: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken?: string;
  readonly serverSideEncryption: "AES256" | "aws:kms";
  readonly kmsKeyId?: string;
  readonly requestTimeoutMs: number;
  readonly maxObjectBytes: number;
}

export class ObjectStorageUnavailableError extends Error {
  constructor() {
    super("Tenant object storage provider is not configured.");
    this.name = "ObjectStorageUnavailableError";
  }
}
export class ObjectStorageRequestError extends Error {
  constructor(readonly method: string, readonly status: number) {
    super("S3-compatible object storage rejected the request.");
    this.name = "ObjectStorageRequestError";
  }
}
export class ObjectStorageIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ObjectStorageIntegrityError";
  }
}

export class S3CompatibleObjectStorage implements ObjectStorage {
  constructor(
    private readonly config: S3CompatibleStorageConfig | null,
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  static fromEnvironment(environment: Readonly<Record<string, string | undefined>>): S3CompatibleObjectStorage {
    const required = {
      endpoint: environment["OBJECT_STORAGE_ENDPOINT"],
      bucket: environment["OBJECT_STORAGE_BUCKET"],
      region: environment["OBJECT_STORAGE_REGION"],
      accessKeyId: environment["OBJECT_STORAGE_ACCESS_KEY_ID"],
      secretAccessKey: environment["OBJECT_STORAGE_SECRET_ACCESS_KEY"],
    };
    const configured = Object.values(required).filter((value) => value !== undefined && value !== "").length;
    if (configured === 0) return new S3CompatibleObjectStorage(null);
    if (configured !== Object.keys(required).length) throw new Error("S3 object storage configuration is incomplete.");

    let endpoint: URL;
    try { endpoint = new URL(required.endpoint!); } catch {
      throw new Error("OBJECT_STORAGE_ENDPOINT must be an absolute HTTP(S) URL.");
    }
    if (!["http:", "https:"].includes(endpoint.protocol)
      || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
      throw new Error("OBJECT_STORAGE_ENDPOINT must not contain credentials, query or fragment.");
    }
    const hostname = endpoint.hostname.toLowerCase();
    const loopback = LOOPBACK_HOSTS.has(hostname) || hostname.startsWith("127.");
    if (endpoint.protocol !== "https:" && !loopback) throw new Error("Non-loopback object storage endpoints must use HTTPS.");
    if (environment["NODE_ENV"] === "production" && endpoint.protocol !== "https:") {
      throw new Error("Production object storage endpoints require HTTPS.");
    }

    const bucket = required.bucket!;
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)
      || bucket.includes("..") || bucket.includes(".-") || bucket.includes("-.")) {
      throw new Error("OBJECT_STORAGE_BUCKET is invalid.");
    }
    const region = required.region!;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(region)) throw new Error("OBJECT_STORAGE_REGION is invalid.");
    if (required.accessKeyId!.length < 8 || required.accessKeyId!.length > 256
      || required.secretAccessKey!.length < 16 || required.secretAccessKey!.length > 512) {
      throw new Error("Object storage credentials are outside the allowed bounds.");
    }
    const sessionToken = environment["OBJECT_STORAGE_SESSION_TOKEN"];
    if (sessionToken && (sessionToken.length < 8 || sessionToken.length > 8_192)) {
      throw new Error("OBJECT_STORAGE_SESSION_TOKEN is outside the allowed bounds.");
    }
    const serverSideEncryption = environment["OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION"] ?? "AES256";
    if (serverSideEncryption !== "AES256" && serverSideEncryption !== "aws:kms") {
      throw new Error("OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION must be AES256 or aws:kms.");
    }
    const kmsKeyId = environment["OBJECT_STORAGE_KMS_KEY_ID"];
    if (serverSideEncryption === "aws:kms" && (!kmsKeyId || kmsKeyId.length > 2_048)) {
      throw new Error("OBJECT_STORAGE_KMS_KEY_ID is required when SSE-KMS is enabled.");
    }
    if (serverSideEncryption === "AES256" && kmsKeyId) {
      throw new Error("OBJECT_STORAGE_KMS_KEY_ID is only valid with SSE-KMS.");
    }

    return new S3CompatibleObjectStorage(Object.freeze({
      endpoint,
      bucket,
      region,
      accessKeyId: required.accessKeyId!,
      secretAccessKey: required.secretAccessKey!,
      ...(sessionToken ? { sessionToken } : {}),
      serverSideEncryption,
      ...(kmsKeyId ? { kmsKeyId } : {}),
      requestTimeoutMs: boundedInteger(environment["OBJECT_STORAGE_TIMEOUT_MS"], 15_000, 250, 120_000),
      maxObjectBytes: boundedInteger(environment["OBJECT_STORAGE_MAX_OBJECT_BYTES"], MAX_OBJECT_BYTES, 1_024, MAX_OBJECT_BYTES),
    }));
  }

  async put(key: string, body: Uint8Array, metadata: ObjectStorageMetadata): Promise<void> {
    const config = this.requireConfig();
    this.assertKey(key);
    if (!(body instanceof Uint8Array) || body.byteLength === 0 || body.byteLength > config.maxObjectBytes) {
      throw new ObjectStorageIntegrityError("Object body is empty or exceeds the configured size limit.");
    }
    if (typeof metadata.contentType !== "string" || metadata.contentType.length > 128
      || !/^[\w.+-]+\/[\w.+-]+$/.test(metadata.contentType)) {
      throw new ObjectStorageIntegrityError("Object content type is invalid.");
    }
    const payload = Buffer.from(body);
    const checksum = createHash("sha256").update(payload).digest("hex");
    if (!/^[0-9a-f]{64}$/i.test(metadata.checksumSha256)
      || checksum !== metadata.checksumSha256.toLowerCase()) {
      throw new ObjectStorageIntegrityError("Object SHA-256 checksum does not match its content.");
    }

    const encryptionHeaders: Record<string, string> = {
      "x-amz-server-side-encryption": config.serverSideEncryption,
    };
    if (config.serverSideEncryption === "aws:kms") {
      encryptionHeaders["x-amz-server-side-encryption-aws-kms-key-id"] = config.kmsKeyId!;
    }
    await this.request("PUT", key, payload, {
      "content-type": metadata.contentType,
      "x-amz-meta-sha256": checksum,
      ...encryptionHeaders,
    }, async (response) => {
      if (!response.ok) throw new ObjectStorageRequestError("PUT", response.status);
    });
  }

  async get(key: string): Promise<Uint8Array | null> {
    const config = this.requireConfig();
    this.assertKey(key);
    return this.request("GET", key, new Uint8Array(), {}, async (response) => {
      if (response.status === 404) return null;
      if (!response.ok) throw new ObjectStorageRequestError("GET", response.status);
      const storedEncryption = response.headers.get("x-amz-server-side-encryption");
      if (storedEncryption !== config.serverSideEncryption) {
        throw new ObjectStorageIntegrityError("Stored object server-side encryption does not match policy.");
      }
      if (config.kmsKeyId
        && response.headers.get("x-amz-server-side-encryption-aws-kms-key-id") !== config.kmsKeyId) {
        throw new ObjectStorageIntegrityError("Stored object was encrypted with an unexpected KMS key.");
      }
      const declaredLength = response.headers.get("content-length");
      if (declaredLength !== null) {
        const parsedLength = Number(declaredLength);
        if (!Number.isSafeInteger(parsedLength) || parsedLength < 0 || parsedLength > config.maxObjectBytes) {
          await response.body?.cancel().catch(() => undefined);
          throw new ObjectStorageIntegrityError("Stored object declares an invalid or oversized content length.");
        }
      }
      const body = await readBoundedBody(response.body, config.maxObjectBytes);
      const expectedChecksum = response.headers.get("x-amz-meta-sha256");
      if (!expectedChecksum || !/^[0-9a-f]{64}$/i.test(expectedChecksum)) {
        throw new ObjectStorageIntegrityError("Stored object is missing a valid SHA-256 metadata checksum.");
      }
      const actualChecksum = createHash("sha256").update(body).digest("hex");
      if (actualChecksum !== expectedChecksum.toLowerCase()) {
        throw new ObjectStorageIntegrityError("Stored object checksum verification failed.");
      }
      return Uint8Array.from(body);
    });
  }

  async delete(key: string): Promise<void> {
    this.requireConfig();
    this.assertKey(key);
    await this.request("DELETE", key, new Uint8Array(), {}, async (response) => {
      if (response.status === 404 || response.ok) return;
      throw new ObjectStorageRequestError("DELETE", response.status);
    });
  }

  private requireConfig(): S3CompatibleStorageConfig {
    if (!this.config) throw new ObjectStorageUnavailableError();
    return this.config;
  }

  private assertKey(key: string): void {
    if (typeof key !== "string" || key.length < 1 || key.length > 1_024
      || key.startsWith("/") || key.includes("\\") || /[\u0000-\u001f]/.test(key)) {
      throw new ObjectStorageIntegrityError("Object key must be a bounded relative path.");
    }
    const segments = key.split("/");
    if (segments.some((segment) => segment.length === 0 || segment === "." || segment === ".." || segment.length > 255)) {
      throw new ObjectStorageIntegrityError("Object key contains an unsafe path segment.");
    }
    for (const segment of segments) {
      let decoded: string;
      try { decoded = decodeURIComponent(segment); } catch {
        throw new ObjectStorageIntegrityError("Object key contains invalid URL encoding.");
      }
      if (decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\")) {
        throw new ObjectStorageIntegrityError("Object key contains an encoded traversal segment.");
      }
    }
  }

  private async request<T>(
    method: "PUT" | "GET" | "DELETE",
    key: string,
    body: Uint8Array,
    extraHeaders: Readonly<Record<string, string>>,
    consume: (response: Response) => Promise<T>,
  ): Promise<T> {
    const config = this.requireConfig();
    const url = this.buildObjectUrl(key);
    const amzDate = this.clock().toISOString().replaceAll("-", "").replaceAll(":", "").replace(/\.\d{3}Z$/, "Z");
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = method === "PUT" ? createHash("sha256").update(body).digest("hex") : EMPTY_SHA256;

    const canonicalHeaderMap: Record<string, string> = {
      host: url.host.toLowerCase(),
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      ...extraHeaders,
    };
    if (config.sessionToken) canonicalHeaderMap["x-amz-security-token"] = config.sessionToken;
    const headerNames = Object.keys(canonicalHeaderMap).sort();
    const canonicalHeaders = headerNames
      .map((name) => name + ":" + canonicalHeaderMap[name]!.trim().replace(/\s+/g, " ") + "\n")
      .join("");
    const signedHeaders = headerNames.join(";");
    const canonicalRequest = [
      method,
      url.pathname,
      "",
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");
    const scope = dateStamp + "/" + config.region + "/s3/aws4_request";
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      scope,
      createHash("sha256").update(canonicalRequest).digest("hex"),
    ].join("\n");
    const signature = createHmac("sha256", this.signingKey(config.secretAccessKey, dateStamp, config.region))
      .update(stringToSign).digest("hex");
    const authorization = "AWS4-HMAC-SHA256 Credential=" + config.accessKeyId + "/" + scope
      + ", SignedHeaders=" + signedHeaders + ", Signature=" + signature;
    const headers: Record<string, string> = {
      ...extraHeaders,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      authorization,
    };
    if (config.sessionToken) headers["x-amz-security-token"] = config.sessionToken;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method,
        headers,
        ...(method === "PUT" ? { body: Buffer.from(body) } : {}),
        redirect: "error",
        cache: "no-store",
        signal: controller.signal,
      });
      return await consume(response);
    } catch (error) {
      if (error instanceof ObjectStorageRequestError
        || error instanceof ObjectStorageIntegrityError
        || error instanceof ObjectStorageUnavailableError) throw error;
      if (controller.signal.aborted) throw new Error("Object storage request timed out.");
      throw new Error("Object storage transport failed.");
    } finally {
      clearTimeout(timer);
    }
  }

  private buildObjectUrl(key: string): URL {
    const config = this.requireConfig();
    const url = new URL(config.endpoint.toString());
    const prefix = url.pathname.replace(/\/+$/, "");
    const encodedKey = key.split("/").map((segment) => encodeURIComponent(decodeURIComponent(segment))).join("/");
    url.pathname = prefix + "/" + encodeURIComponent(config.bucket) + "/" + encodedKey;
    url.search = "";
    url.hash = "";
    return url;
  }

  private signingKey(secret: string, dateStamp: string, region: string): Buffer {
    const dateKey = createHmac("sha256", "AWS4" + secret).update(dateStamp).digest();
    const regionKey = createHmac("sha256", dateKey).update(region).digest();
    const serviceKey = createHmac("sha256", regionKey).update("s3").digest();
    return createHmac("sha256", serviceKey).update("aws4_request").digest();
  }
}

async function readBoundedBody(body: ReadableStream<Uint8Array> | null, maximumBytes: number): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      totalBytes += result.value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
        throw new ObjectStorageIntegrityError("Stored object exceeds the configured maximum size.");
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = Buffer.allocUnsafe(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error("Object storage timeout/size is outside the allowed range.");
  }
  return parsed;
}
