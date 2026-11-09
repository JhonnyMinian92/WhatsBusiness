import assert from "node:assert/strict";
import test from "node:test";
import { UnauthorizedException } from "@nestjs/common";
import type { TenantAccessContext } from "../../identity/tenant-access-context.js";
import type { MetaOAuthService } from "./meta-oauth.service.js";
import type {
  MetaAssetDiscoveryPort,
  MetaAssetDiscoveryResult,
  MetaOnboardingRecord,
  MetaOnboardingRepositoryPort,
} from "./meta-onboarding.ports.js";
import { MetaOnboardingService, type StartMetaOnboardingCommand } from "./meta-onboarding.service.js";

const tenantId="b2cbecb4-bda0-4cf4-a43b-ecb34c11b025";
const actorId="c2cbecb4-bda0-4cf4-a43b-ecb34c11b025";
const sagaId="d2cbecb4-bda0-4cf4-a43b-ecb34c11b025";
const connectionId="e2cbecb4-bda0-4cf4-a43b-ecb34c11b025";

function subject(permissionKeys:readonly string[]=["meta.connections.manage"]):TenantAccessContext{
  return {
    actorId,tenantId,membershipId:"f2cbecb4-bda0-4cf4-a43b-ecb34c11b025",
    membershipStatus:"active",authzVersion:1,roleKeys:["tenant_admin"],permissionKeys,
    entitlementKeys:[],locale:"es-EC",timezone:"America/Guayaquil",currency:"USD",
    purpose:"meta.connections.manage",correlationId:"a2cbecb4-bda0-4cf4-a43b-ecb34c11b025",
  };
}
function record(overrides:Partial<MetaOnboardingRecord>={}):MetaOnboardingRecord{
  return {
    sagaId,tenantId,initiatedByUserId:actorId,product:"whatsapp_business_platform",
    authorizationMode:"user_token",status:"created",requiredScopes:["business_management"],
    connectionId:null,requestHash:"a".repeat(64),syncAttempts:0,discoveredAssets:null,
    missingCapabilities:[],lastErrorCode:null,...overrides,
  };
}
const command:StartMetaOnboardingCommand={
  product:"whatsapp_business_platform",authorizationMode:"user_token",
  requiredScopes:["business_management"],redirectUri:"https://app.example.test/meta/callback",
  returnPath:"/settings/integrations",idempotencyKey:"onboarding-request-0001",
};

function createHarness(options:{
  initial?:MetaOnboardingRecord;
  discovery?:MetaAssetDiscoveryResult;
  discoveryError?:Error;
  beginError?:Error;
  completeError?:Error;
  markReadyError?:Error;
}={}){
  let saga=record(options.initial??{});
  let beginCalls=0;
  let completeCalls=0;
  let discoveryCalls=0;
  const failureSnapshots:{errorCode:string;discoveredAssets:number|null;missingCapabilities:readonly string[]}[]=[];
  const readySnapshots:{discoveredAssets:number;missingCapabilities:readonly string[]}[]=[];
  const oauth={
    async begin(){
      beginCalls+=1;
      if(options.beginError)throw options.beginError;
      return {authorizationUrl:"https://www.facebook.com/dialog/oauth?state=synthetic",expiresAt:"2026-11-09T12:00:00.000Z"};
    },
    async complete(){
      completeCalls+=1;
      if(options.completeError)throw options.completeError;
      return {connectionId,product:"whatsapp_business_platform",providerUserId:"meta-user",expiresAt:"2026-11-09T13:00:00.000Z",grantedScopes:["business_management"]};
    },
  } as unknown as MetaOAuthService;
  const repository:MetaOnboardingRepositoryPort={
    async create(_subject,input,newSagaId){
      saga=record({
        sagaId:newSagaId,status:"created",requestHash:input.requestHash,
        product:input.product,authorizationMode:input.authorizationMode,
        requiredScopes:input.requiredScopes,
      });
      return saga;
    },
    async get(_subject,id){return id===saga.sagaId?saga:null;},
    async markOAuthPending(){saga={...saga,status:"oauth_pending"};},
    async attachConnection(_subject,_id,newConnectionId){
      saga={...saga,status:"asset_sync_pending",connectionId:newConnectionId,lastErrorCode:null};
    },
    async recordAssetSyncFailure(_subject,_id,errorCode,snapshot){
      failureSnapshots.push({errorCode,...snapshot});
      saga={
        ...saga,status:"asset_sync_pending",lastErrorCode:errorCode,
        discoveredAssets:snapshot.discoveredAssets,missingCapabilities:[...snapshot.missingCapabilities],
        syncAttempts:saga.syncAttempts+1,
      };
    },
    async markReady(_subject,_id,result){
      if(options.markReadyError)throw options.markReadyError;
      readySnapshots.push(result);
      saga={
        ...saga,status:"ready",lastErrorCode:null,discoveredAssets:result.discoveredAssets,
        missingCapabilities:[...result.missingCapabilities],
      };
    },
    async markBlocked(_subject,_id,errorCode){saga={...saga,status:"blocked",lastErrorCode:errorCode};},
  };
  const assets:MetaAssetDiscoveryPort={
    async discoverAndPersist(){
      discoveryCalls+=1;
      if(options.discoveryError)throw options.discoveryError;
      return options.discovery??{requiredAssetsReady:true,discoveredAssets:2,missingCapabilities:[]};
    },
  };
  const service=new MetaOnboardingService(oauth,repository,assets);
  return {
    service,repository,
    counts:()=>({beginCalls,completeCalls,discoveryCalls}),
    saga:()=>saga,
    failureSnapshots:()=>failureSnapshots,
    readySnapshots:()=>readySnapshots,
  };
}

test("inicia OAuth una sola vez y persiste la saga en estado oauth_pending",async()=>{
  const harness=createHarness();
  const result=await harness.service.start(subject(),command);
  assert.equal(result.status,"oauth_pending");
  assert.ok(result.sagaId);
  assert.equal(result.authorizationUrl,"https://www.facebook.com/dialog/oauth?state=synthetic");
  assert.equal(harness.saga().status,"oauth_pending");
  assert.equal(harness.counts().beginCalls,1);
});

test("un provider OAuth no configurado bloquea la saga sin fingir conexión",async()=>{
  const harness=createHarness({beginError:new Error("provider unavailable")});
  const result=await harness.service.start(subject(),command);
  assert.equal(result.status,"blocked");
  assert.equal(result.authorizationUrl,null);
  assert.equal(result.lastErrorCode,"META_OAUTH_PROVIDER_OR_SCOPE_POLICY_UNAVAILABLE");
  assert.equal(harness.counts().beginCalls,1);
});

test("persiste el resumen completo de activos y permite consultar el progreso durable",async()=>{
  const harness=createHarness({initial:record({status:"oauth_pending"})});
  const result=await harness.service.complete(subject(),{
    sagaId,state:"s".repeat(40),code:"authorization-code",redirectUri:command.redirectUri,
  });
  assert.equal(result.status,"ready");
  assert.equal(result.discoveredAssets,2);
  assert.deepEqual(result.missingCapabilities,[]);
  assert.equal(harness.saga().discoveredAssets,2);
  assert.equal(harness.readySnapshots().length,1);

  const progress=await harness.service.getProgress(subject(),sagaId);
  assert.equal(progress.status,"ready");
  assert.equal(progress.discoveredAssets,2);
  assert.deepEqual(progress.missingCapabilities,[]);
  assert.equal(harness.counts().completeCalls,1);
  assert.equal(harness.counts().discoveryCalls,1);
});

test("conserva los grants y capabilities faltantes cuando el inventario todavía no está completo",async()=>{
  const harness=createHarness({
    initial:record({status:"oauth_pending"}),
    discovery:{requiredAssetsReady:false,discoveredAssets:4,missingCapabilities:["whatsapp.messages.send","whatsapp.webhooks.read"]},
  });
  const progress=await harness.service.complete(subject(),{
    sagaId,state:"s".repeat(40),code:"authorization-code",redirectUri:command.redirectUri,
  });
  assert.equal(progress.status,"asset_sync_pending");
  assert.equal(progress.discoveredAssets,4);
  assert.deepEqual(progress.missingCapabilities,["whatsapp.messages.send","whatsapp.webhooks.read"]);
  assert.equal(harness.failureSnapshots()[0]?.errorCode,"META_REQUIRED_ASSET_GRANTS_INCOMPLETE");
  assert.equal(harness.saga().syncAttempts,1);
});

test("rechaza resultados de discovery mal formados sin persistirlos como capabilities válidas",async()=>{
  const malformed={requiredAssetsReady:true,discoveredAssets:-1,missingCapabilities:["bad capability"]}
    as unknown as MetaAssetDiscoveryResult;
  const harness=createHarness({initial:record({status:"oauth_pending"}),discovery:malformed});
  const progress=await harness.service.complete(subject(),{
    sagaId,state:"s".repeat(40),code:"authorization-code",redirectUri:command.redirectUri,
  });
  assert.equal(progress.status,"asset_sync_pending");
  assert.equal(progress.discoveredAssets,null);
  assert.deepEqual(progress.missingCapabilities,[]);
  assert.equal(progress.lastErrorCode,"META_ASSET_DISCOVERY_RESPONSE_INVALID");
  assert.equal(harness.failureSnapshots()[0]?.errorCode,"META_ASSET_DISCOVERY_RESPONSE_INVALID");
});

test("registra un resultado unknown si el provider de activos no está disponible",async()=>{
  const harness=createHarness({initial:record({status:"oauth_pending"}),discoveryError:new Error("Graph unavailable")});
  const progress=await harness.service.complete(subject(),{
    sagaId,state:"s".repeat(40),code:"authorization-code",redirectUri:command.redirectUri,
  });
  assert.equal(progress.status,"asset_sync_pending");
  assert.equal(progress.discoveredAssets,null);
  assert.deepEqual(progress.missingCapabilities,[]);
  assert.equal(progress.lastErrorCode,"META_ASSET_DISCOVERY_UNAVAILABLE");
});

test("no convierte un fallo de persistencia local en un falso fallo del provider",async()=>{
  const storageError=new Error("database unavailable");
  const harness=createHarness({initial:record({status:"oauth_pending"}),markReadyError:storageError});
  await assert.rejects(
    harness.service.complete(subject(),{
      sagaId,state:"s".repeat(40),code:"authorization-code",redirectUri:command.redirectUri,
    }),
    (error:unknown)=>error===storageError,
  );
  assert.equal(harness.counts().discoveryCalls,1);
  assert.equal(harness.failureSnapshots().length,0);
});

test("un actor sin permiso no puede iniciar ni consultar el onboarding",async()=>{
  const harness=createHarness();
  await assert.rejects(harness.service.start(subject([]),command),
    (error:unknown)=>error instanceof UnauthorizedException);
  await assert.rejects(harness.service.getProgress(subject([]),sagaId),
    (error:unknown)=>error instanceof UnauthorizedException);
  assert.equal(harness.counts().beginCalls,0);
});

test("otro administrador del mismo tenant puede consultar el progreso pero no apropiarse del callback",async()=>{
  const harness=createHarness({initial:record({
    status:"ready",connectionId,discoveredAssets:3,missingCapabilities:[],
  })});
  const other={...subject(),actorId:"a2cbecb4-bda0-4cf4-a43b-ecb34c11b025"};
  const progress=await harness.service.getProgress(other,sagaId);
  assert.equal(progress.status,"ready");
  assert.equal(progress.discoveredAssets,3);
  await assert.rejects(
    harness.service.retryAssetSync(other,sagaId),
    (error:unknown)=>error instanceof UnauthorizedException,
  );
});
