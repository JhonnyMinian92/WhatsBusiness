const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESOURCE_PATTERN = /^[a-z][a-z0-9-]{1,47}$/;
const MAX_KEY_LENGTH = 512;

/**
 * Centralizes tenant partitioning for ephemeral and durable resources.
 * Callers cannot provide or override the tenant prefix.
 */
export class TenantResourceNamespace {
  cacheKey(tenantId: string, resource: string, key: string): string {
    return `wb:tenant:${normalizeTenantId(tenantId)}:cache:${normalizeResource(resource)}:${normalizeLogicalKey(key)}`;
  }

  objectKey(tenantId: string, resource: string, key: string): string {
    return `tenants/${normalizeTenantId(tenantId)}/${normalizeResource(resource)}/${normalizeObjectKey(key)}`;
  }
}

function normalizeTenantId(tenantId: string): string {
  if (!UUID_PATTERN.test(tenantId)) {
    throw new Error("A valid tenant UUID is required for resource partitioning.");
  }
  return tenantId.toLowerCase();
}

function normalizeResource(resource: string): string {
  if (!RESOURCE_PATTERN.test(resource)) {
    throw new Error("Resource names must be stable lowercase identifiers.");
  }
  return resource;
}

function normalizeLogicalKey(key: string): string {
  if (typeof key !== "string" || key.length === 0 || key.length > MAX_KEY_LENGTH) {
    throw new Error("A non-empty bounded resource key is required.");
  }
  return encodeURIComponent(key);
}

function normalizeObjectKey(key: string): string {
  if (typeof key !== "string" || key.length === 0 || key.length > MAX_KEY_LENGTH) {
    throw new Error("A non-empty bounded object key is required.");
  }
  const segments = key.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw new Error("Object keys cannot contain empty or traversal path segments.");
  }
  if (key.startsWith("/") || key.includes("\\") || /[\u0000-\u001f]/.test(key)) {
    throw new Error("Object keys must be relative safe paths.");
  }
  return segments.map(encodeURIComponent).join("/");
}
