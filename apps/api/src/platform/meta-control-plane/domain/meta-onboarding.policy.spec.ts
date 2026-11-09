import assert from "node:assert/strict";
import test from "node:test";
import { MetaOnboardingPolicy, MetaOnboardingPolicyViolation, type MetaOnboardingRequest } from "./meta-onboarding.policy.js";

const request: MetaOnboardingRequest = {
  tenantId:"b2cbecb4-bda0-4cf4-a43b-ecb34c11b025",
  actorUserId:"c2cbecb4-bda0-4cf4-a43b-ecb34c11b025",
  product:"whatsapp_business_platform",
  authorizationMode:"user_token",
  requiredScopes:["business_management","whatsapp_business_management"],
  idempotencyKey:"meta-onboarding-request-0001",
};
function rejects(action:()=>unknown,code:string):void {
  assert.throws(action,(error:unknown)=>error instanceof MetaOnboardingPolicyViolation&&error.code===code);
}

test("valida tenant, actor, producto, modo, scopes e idempotencia",()=>{
  const result=new MetaOnboardingPolicy().validate(request);
  assert.match(result.requestHash,/^[0-9a-f]{64}$/);
  assert.equal(Object.isFrozen(result.requiredScopes),true);
});
test("el hash de idempotencia no depende del orden de scopes",()=>{
  const policy=new MetaOnboardingPolicy();
  assert.equal(policy.validate(request).requestHash,policy.validate({...request,requiredScopes:[...request.requiredScopes].reverse()}).requestHash);
});
test("rechaza producto y modo inválidos en runtime",()=>{
  rejects(()=>new MetaOnboardingPolicy().validate({...request,product:"unknown" as MetaOnboardingRequest["product"]}),"META_ONBOARDING_PRODUCT_INVALID");
  rejects(()=>new MetaOnboardingPolicy().validate({...request,authorizationMode:"password" as MetaOnboardingRequest["authorizationMode"]}),"META_ONBOARDING_AUTHORIZATION_MODE_INVALID");
});
test("rechaza contexto e idempotency keys inválidos",()=>{
  rejects(()=>new MetaOnboardingPolicy().validate({...request,tenantId:"invalid"}),"META_ONBOARDING_CONTEXT_INVALID");
  rejects(()=>new MetaOnboardingPolicy().validate({...request,idempotencyKey:"                "}),"META_ONBOARDING_IDEMPOTENCY_INVALID");
  rejects(()=>new MetaOnboardingPolicy().validate({...request,idempotencyKey:"x".repeat(256)}),"META_ONBOARDING_IDEMPOTENCY_INVALID");
});
test("rechaza scopes vacíos, duplicados y malformados",()=>{
  rejects(()=>new MetaOnboardingPolicy().validate({...request,requiredScopes:[]}),"META_ONBOARDING_SCOPES_INVALID");
  rejects(()=>new MetaOnboardingPolicy().validate({...request,requiredScopes:["business_management","business_management"]}),"META_ONBOARDING_SCOPES_INVALID");
  rejects(()=>new MetaOnboardingPolicy().validate({...request,requiredScopes:["../secret"]}),"META_ONBOARDING_SCOPES_INVALID");
});
