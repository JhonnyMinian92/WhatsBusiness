import { createHash,createHmac,randomBytes,timingSafeEqual } from "node:crypto";
export const DEVELOPER_API_SCOPES=[
"crm.contacts.read","crm.contacts.create","crm.contacts.update","crm.contacts.identities.read","crm.contacts.identities.link",
"crm.leads.read","crm.leads.assign","inbox.conversations.read","inbox.conversations.assign","inbox.conversations.reply",
"inbox.conversations.handoff","whatsapp.templates.read","whatsapp.templates.create","whatsapp.templates.update","ads.read","ads.draft.create",
] as const;
export type DeveloperApiScope=(typeof DEVELOPER_API_SCOPES)[number];
export interface CreateDeveloperApiClientCommand {readonly name:string;readonly scopes:readonly DeveloperApiScope[];readonly expiresAt:Date|null;}
export interface GeneratedDeveloperApiCredential {readonly keyId:string;readonly bearerToken:string;readonly secretDigest:string;}
const TOKEN=/^wb_live_([a-f0-9]{24})\.([A-Za-z0-9_-]{43})$/, IDEMPOTENCY=/^[\x21-\x7e]{16,255}$/;
export function parseCreateDeveloperApiClient(value: unknown, now = new Date()): CreateDeveloperApiClientCommand {
  const body = record(value);
  exact(body, ["name", "scopes", "expiresAt"], ["name", "scopes"]);

  const name = body["name"];
  if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100) {
    throw new DeveloperApiCredentialValidationError("DEVELOPER_CLIENT_NAME_INVALID");
  }

  const rawScopes = body["scopes"];
  if (!Array.isArray(rawScopes) || rawScopes.length < 1 || rawScopes.length > DEVELOPER_API_SCOPES.length) {
    throw new DeveloperApiCredentialValidationError("DEVELOPER_CLIENT_SCOPES_INVALID");
  }
  const scopes = rawScopes.map((scope) => {
    if (typeof scope !== "string" || !isDeveloperApiScope(scope)) {
      throw new DeveloperApiCredentialValidationError("DEVELOPER_CLIENT_SCOPE_NOT_ALLOWED");
    }
    return scope;
  });
  if (new Set(scopes).size !== scopes.length) {
    throw new DeveloperApiCredentialValidationError("DEVELOPER_CLIENT_SCOPES_DUPLICATED");
  }

  let expiresAt: Date | null = null;
  const rawExpiry = body["expiresAt"];
  if (rawExpiry !== undefined && rawExpiry !== null) {
    if (typeof rawExpiry !== "string") {
      throw new DeveloperApiCredentialValidationError("DEVELOPER_CLIENT_EXPIRY_INVALID");
    }
    const parsedExpiry = Date.parse(rawExpiry);
    if (!Number.isFinite(parsedExpiry) || parsedExpiry <= now.getTime()
      || parsedExpiry > now.getTime() + 366 * 86_400_000) {
      throw new DeveloperApiCredentialValidationError("DEVELOPER_CLIENT_EXPIRY_INVALID");
    }
    expiresAt = new Date(parsedExpiry);
  }
  return Object.freeze({
    name: name.trim(),
    scopes: Object.freeze([...scopes].sort()),
    expiresAt,
  });
}
export function generateDeveloperApiCredential(pepper:Buffer):GeneratedDeveloperApiCredential{assertPepper(pepper);const keyId=randomBytes(12).toString("hex"),secret=randomBytes(32).toString("base64url");return Object.freeze({keyId,bearerToken:"wb_live_"+keyId+"."+secret,secretDigest:digestDeveloperApiSecret(secret,pepper)});}
export function parseDeveloperApiBearerToken(token:string,pepper:Buffer){assertPepper(pepper);const m=typeof token==="string"&&token.length<=160?TOKEN.exec(token):null;if(!m?.[1]||!m[2])throw new DeveloperApiCredentialValidationError("DEVELOPER_CLIENT_TOKEN_INVALID");return {keyId:m[1],secretDigest:digestDeveloperApiSecret(m[2],pepper)};}
export function digestDeveloperApiSecret(secret:string,pepper:Buffer){assertPepper(pepper);if(!/^[A-Za-z0-9_-]{43}$/.test(secret))throw new DeveloperApiCredentialValidationError("DEVELOPER_CLIENT_SECRET_INVALID");return createHmac("sha256",pepper).update(secret).digest("hex");}
export function secureDigestEquals(a:string,b:string){return /^[0-9a-f]{64}$/.test(a)&&/^[0-9a-f]{64}$/.test(b)&&timingSafeEqual(Buffer.from(a,"hex"),Buffer.from(b,"hex"));}
export function hashDeveloperCommand(value:unknown){const raw=JSON.stringify(canonical(value));if(typeof raw!=="string")throw new DeveloperApiCredentialValidationError("DEVELOPER_COMMAND_INVALID");return createHash("sha256").update(raw).digest("hex");}
export function assertDeveloperIdempotencyKey(v:string|undefined):asserts v is string{if(typeof v!=="string"||!IDEMPOTENCY.test(v))throw new DeveloperApiCredentialValidationError("DEVELOPER_IDEMPOTENCY_KEY_REQUIRED");}
export function assertDeveloperUuid(v:string){if(typeof v!=="string"||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v))throw new DeveloperApiCredentialValidationError("DEVELOPER_RESOURCE_ID_INVALID");}
export function isDeveloperApiScope(v:string):v is DeveloperApiScope{return (DEVELOPER_API_SCOPES as readonly string[]).includes(v);}
export class DeveloperApiCredentialValidationError extends Error{constructor(readonly code:string){super(code);this.name="DeveloperApiCredentialValidationError";}}
function record(v:unknown):Record<string,unknown>{if(v===null||typeof v!=="object"||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))throw new DeveloperApiCredentialValidationError("DEVELOPER_COMMAND_BODY_INVALID");return v as Record<string,unknown>;}
function exact(b:Record<string,unknown>,a:string[],r:string[]){if(Object.keys(b).some(k=>!a.includes(k))||r.some(k=>!(k in b)))throw new DeveloperApiCredentialValidationError("DEVELOPER_COMMAND_FIELDS_INVALID");}
function canonical(v:unknown):unknown{if(Array.isArray(v))return v.map(canonical);if(v!==null&&typeof v==="object"){const o=Object.create(null) as Record<string,unknown>;for(const k of Object.keys(v as object).sort())o[k]=canonical((v as Record<string,unknown>)[k]);return o;}return v;}
function assertPepper(p:Buffer){if(!Buffer.isBuffer(p)||p.length!==32)throw new Error("DEVELOPER_API_KEY_PEPPER must be 32 bytes.");}
