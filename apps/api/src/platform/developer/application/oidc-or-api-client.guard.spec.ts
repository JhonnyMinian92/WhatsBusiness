import assert from "node:assert/strict";
import test from "node:test";
import type { ExecutionContext } from "@nestjs/common";
import { OidcAuthGuard } from "../../identity/oidc-auth.guard.js";
import { OidcOrApiClientGuard } from "./oidc-or-api-client.guard.js";

test("developer tenant guard delegates authentication to the verified OIDC guard", async () => {
  const context = {} as ExecutionContext;
  let received: ExecutionContext | undefined;
  const oidc = {
    canActivate: async (value: ExecutionContext) => {
      received = value;
      return true;
    },
  } as unknown as OidcAuthGuard;
  const guard = new OidcOrApiClientGuard(oidc);
  assert.equal(await guard.canActivate(context), true);
  assert.equal(received, context);
});

test("developer tenant guard propagates OIDC authentication denial", async () => {
  const denial = new Error("OIDC token rejected");
  const oidc = {
    canActivate: async () => { throw denial; },
  } as unknown as OidcAuthGuard;
  const guard = new OidcOrApiClientGuard(oidc);
  await assert.rejects(guard.canActivate({} as ExecutionContext), denial);
});
