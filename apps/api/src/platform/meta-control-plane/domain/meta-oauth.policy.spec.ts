import assert from "node:assert/strict";
import test from "node:test";
import { MetaOAuthPolicy, MetaOAuthPolicyViolation, type MetaOAuthRequest } from "./meta-oauth.policy.js";
import { MetaOAuthScopeCatalog } from "./meta-oauth-scope-catalog.js";

const redirectUri = "https://app.example.com/settings/meta/callback";
const request: MetaOAuthRequest = {
  product: "whatsapp_business_platform",
  authorizationMode: "user_token",
  redirectUri,
  scopes: ["business_management", "whatsapp_business_management"],
  returnPath: "/settings/meta/connections",
};

function policy(ttl = 600): MetaOAuthPolicy {
  return new MetaOAuthPolicy({
    allowedRedirectUris: [redirectUri, "http://localhost:4200/oauth/callback", "http://app.example.com/callback"],
    allowedAuthorizationHosts: ["www.facebook.com"],
    maximumStateLifetimeSeconds: ttl,
  }, new MetaOAuthScopeCatalog());
}
function rejects(action: () => unknown, code: string): void {
  assert.throws(action, (error: unknown) => error instanceof MetaOAuthPolicyViolation && error.code === code);
}

test("valida scopes, producto, modo y redirect exacto", () => {
  const result = policy().validate(request);
  assert.deepEqual(result.scopes, request.scopes);
  assert.equal(Object.isFrozen(result.scopes), true);
});
test("rechaza scopes sin evidencia para el producto", () => {
  rejects(() => policy().validate({...request,scopes:["business_management","pages_manage_posts"]}),"META_OAUTH_SCOPE_UNVERIFIED");
});
test("rechaza open redirect y destinos no allowlisted", () => {
  rejects(() => policy().validate({...request,redirectUri:"https://attacker.example/callback"}),"META_OAUTH_REDIRECT_NOT_ALLOWED");
  rejects(() => policy().validate({...request,returnPath:"//attacker.example"}),"META_OAUTH_RETURN_PATH_INVALID");
});
test("HTTP solo se permite para loopback local allowlisted", () => {
  assert.equal(policy().validate({...request,redirectUri:"http://localhost:4200/oauth/callback"}).redirectUri,"http://localhost:4200/oauth/callback");
  rejects(() => policy().validate({...request,redirectUri:"http://app.example.com/callback"}),"META_OAUTH_REDIRECT_INSECURE");
});
test("la URL del proveedor requiere host HTTPS autorizado", () => {
  assert.equal(policy().assertAuthorizationUrl("https://www.facebook.com/v27.0/dialog/oauth").hostname,"www.facebook.com");
  rejects(() => policy().assertAuthorizationUrl("https://facebook.com.attacker.example/oauth"),"META_OAUTH_AUTHORIZATION_HOST_NOT_ALLOWED");
  rejects(() => policy().assertAuthorizationUrl("https://user:secret@www.facebook.com/oauth"),"META_OAUTH_AUTHORIZATION_HOST_NOT_ALLOWED");
  rejects(() => policy().assertAuthorizationUrl("https://www.facebook.com:8443/oauth"),"META_OAUTH_AUTHORIZATION_HOST_NOT_ALLOWED");
  rejects(() => policy().assertAuthorizationUrl("https://www.facebook.com/oauth#token"),"META_OAUTH_AUTHORIZATION_HOST_NOT_ALLOWED");
});
test("el TTL de estado permanece en el rango seguro", () => {
  rejects(() => policy(30),"META_OAUTH_TTL_INVALID");
  rejects(() => policy(901),"META_OAUTH_TTL_INVALID");
});
