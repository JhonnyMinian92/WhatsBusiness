import assert from "node:assert/strict";
import test from "node:test";
import type { ExecutionContext } from "@nestjs/common";
import { OidcAuthGuard } from "../../identity/oidc-auth.guard.js";
import type { DeveloperApiKeyPepperProvider } from "../infrastructure/developer-api-key-pepper.js";
import type { DeveloperPlatformService } from "./developer-platform.service.js";
import { OidcOrApiClientGuard } from "./oidc-or-api-client.guard.js";

function createHttpContext(authorization?: string): ExecutionContext {
  const request = {
    headers: authorization === undefined ? {} : { authorization },
  };
  const response = { setHeader: () => undefined };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

function createGuard(oidc: OidcAuthGuard): OidcOrApiClientGuard {
  return new OidcOrApiClientGuard(
    oidc,
    {} as DeveloperPlatformService,
    {} as DeveloperApiKeyPepperProvider,
  );
}

test("developer tenant guard delegates requests without bearer token to verified OIDC guard", async () => {
  const context = createHttpContext();
  let received: ExecutionContext | undefined;
  const oidc = {
    canActivate: async (value: ExecutionContext) => {
      received = value;
      return true;
    },
  } as unknown as OidcAuthGuard;
  const guard = createGuard(oidc);

  assert.equal(await guard.canActivate(context), true);
  assert.equal(received, context);
});

test("developer tenant guard propagates OIDC authentication denial", async () => {
  const denial = new Error("OIDC token rejected");
  const oidc = {
    canActivate: async () => { throw denial; },
  } as unknown as OidcAuthGuard;
  const guard = createGuard(oidc);

  await assert.rejects(guard.canActivate(createHttpContext()), denial);
});

test("non-developer bearer tokens continue through the standard OIDC guard", async () => {
  let delegated = false;
  const oidc = {
    canActivate: async () => {
      delegated = true;
      return true;
    },
  } as unknown as OidcAuthGuard;

  assert.equal(await createGuard(oidc).canActivate(createHttpContext("Bearer ordinary-oidc-token")), true);
  assert.equal(delegated, true);
});
