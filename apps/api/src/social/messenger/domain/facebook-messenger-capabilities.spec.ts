import assert from "node:assert/strict";
import test from "node:test";
import { createFacebookMessengerCapabilityDefinitions } from "./facebook-messenger-capabilities.js";

test("define permisos, tareas y token Page por operación de Messenger", () => {
  const [conversations, send] = createFacebookMessengerCapabilityDefinitions("v27.0");
  assert.equal(conversations?.key, "facebook.messenger.conversations.read");
  assert.equal(conversations?.product, "facebook_pages");
  assert.equal(conversations?.apiVersion, "v27.0");
  assert.deepEqual(conversations?.requiredOAuthScopes, [
    "pages_manage_metadata", "pages_read_engagement", "pages_messaging",
  ]);
  assert.deepEqual(conversations?.requiredAnyAssetTasks, ["MESSAGING", "MODERATE"]);
  assert.equal(conversations?.requiredAccessTokenType, "page");
  assert.equal(send?.key, "facebook.messenger.messages.send");
  assert.deepEqual(send?.requiredOAuthScopes, ["pages_messaging"]);
  assert.deepEqual(send?.requiredAssetTasks, ["MESSAGE"]);
  assert.equal(send?.requiredAccessTokenType, "page");
  assert.equal(send?.requiresConsentAndLegalBasis, true);
});

test("no presupone una versión global ni acepta alias como latest", () => {
  assert.throws(() => createFacebookMessengerCapabilityDefinitions("latest"), {
    message: "FACEBOOK_MESSENGER_API_VERSION_INVALID",
  });
});

test("devuelve definiciones inmutables", () => {
  const definitions = createFacebookMessengerCapabilityDefinitions("v27.0");
  assert.equal(Object.isFrozen(definitions), true);
  assert.equal(Object.isFrozen(definitions[0]), true);
  assert.equal(Object.isFrozen(definitions[0]?.requiredOAuthScopes), true);
});
