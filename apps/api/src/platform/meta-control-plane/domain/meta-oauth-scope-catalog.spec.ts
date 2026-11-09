import assert from "node:assert/strict";
import test from "node:test";
import { MetaOAuthScopeCatalog } from "./meta-oauth-scope-catalog.js";

const catalog = new MetaOAuthScopeCatalog();

test("permite únicamente scopes WhatsApp documentados para el producto correcto", () => {
  assert.equal(catalog.isAllowed("whatsapp_business_platform", "business_management"), true);
  assert.equal(catalog.isAllowed("whatsapp_business_platform", "whatsapp_business_management"), true);
  assert.equal(catalog.isAllowed("whatsapp_business_platform", "whatsapp_business_messaging"), true);
  assert.equal(catalog.isAllowed("instagram", "whatsapp_business_messaging"), false);
  assert.equal(catalog.isAllowed("whatsapp_business_platform", "pages_manage_posts"), false);
});

test("expone procedencia sin confundir scope con aprobación", () => {
  const evidence = catalog.evidenceFor("whatsapp_business_platform", "business_management");
  assert.ok(evidence);
  assert.match(evidence.sourceUrl, /^https:\/\/www\.postman\.com\/meta\//);
  assert.equal(evidence.verifiedAt, "2026-11-08");
  assert.equal(catalog.evidenceFor("threads", "threads_basic"), null);
  assert.equal(Object.isFrozen(catalog.list("whatsapp_business_platform")), true);
});
