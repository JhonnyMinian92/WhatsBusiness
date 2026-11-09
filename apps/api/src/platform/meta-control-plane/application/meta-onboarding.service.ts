import { Inject, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { TenantAccessContext } from "../../../identity/tenant-access-context.js";
import { MetaOAuthService } from "./meta-oauth.service.js";
import {
  META_ASSET_DISCOVERY,
  META_ONBOARDING_REPOSITORY,
  type MetaAssetDiscoveryPort,
  type MetaOnboardingRecord,
  type MetaOnboardingRepositoryPort,
} from "./meta-onboarding.ports.js";
import { MetaOnboardingPolicy, MetaOnboardingPolicyViolation } from "../domain/meta-onboarding.policy.js";
import type { MetaOAuthProduct, MetaAuthorizationMode } from "../domain/meta-oauth.policy.js";

export interface StartMetaOnboardingCommand {
  readonly product:MetaOAuthProduct;
  readonly authorizationMode:MetaAuthorizationMode;
  readonly requiredScopes:readonly string[];
  readonly redirectUri:string;
  readonly returnPath:string;
  readonly idempotencyKey:string;
}
export interface StartMetaOnboardingResult {
  readonly sagaId:string;
  readonly status:MetaOnboardingRecord["status"];
  readonly authorizationUrl:string|null;
  readonly expiresAt:string|null;
  readonly lastErrorCode:string|null;
}
export interface CompleteMetaOnboardingCommand {
  readonly sagaId:string;
  readonly state:string;
  readonly code:string;
  readonly redirectUri:string;
}
export interface MetaOnboardingProgress {
  readonly sagaId:string;
  readonly status:MetaOnboardingRecord["status"];
  readonly connectionId:string|null;
  readonly discoveredAssets:number|null;
  readonly missingCapabilities:readonly string[];
  readonly lastErrorCode:string|null;
  readonly syncAttempts:number;
}

@Injectable()
export class MetaOnboardingService {
  private readonly policy=new MetaOnboardingPolicy();
  constructor(
    private readonly oauth:MetaOAuthService,
    @Inject(META_ONBOARDING_REPOSITORY) private readonly repository:MetaOnboardingRepositoryPort,
    @Inject(META_ASSET_DISCOVERY) private readonly assets:MetaAssetDiscoveryPort,
  ){}

  async start(subjectInput:TenantAccessContext,command:StartMetaOnboardingCommand):Promise<StartMetaOnboardingResult>{
    const subject=this.requireManager(subjectInput);
    let validated;
    try{
      validated=this.policy.validate({
        tenantId:subject.tenantId,actorUserId:subject.actorId,product:command.product,
        authorizationMode:command.authorizationMode,requiredScopes:command.requiredScopes,
        idempotencyKey:command.idempotencyKey,
      });
    }catch(error){
      if(error instanceof MetaOnboardingPolicyViolation)
        throw new UnauthorizedException({code:error.code,detail:error.message});
      throw error;
    }
    const saga=await this.repository.create(subject,validated,randomUUID());
    if(saga.status==="ready"||saga.status==="oauth_pending"||saga.status==="asset_sync_pending"||saga.status==="cancelled"){
      return {sagaId:saga.sagaId,status:saga.status,authorizationUrl:null,expiresAt:null,lastErrorCode:saga.lastErrorCode};
    }
    if(saga.connectionId){
      return {sagaId:saga.sagaId,status:"asset_sync_pending",authorizationUrl:null,expiresAt:null,lastErrorCode:saga.lastErrorCode};
    }
    try{
      const oauth=await this.oauth.begin({
        subject,product:command.product,authorizationMode:command.authorizationMode,
        redirectUri:command.redirectUri,returnPath:command.returnPath,scopes:validated.requiredScopes,
      });
      await this.repository.markOAuthPending(subject,saga.sagaId);
      return {sagaId:saga.sagaId,status:"oauth_pending",authorizationUrl:oauth.authorizationUrl,expiresAt:oauth.expiresAt,lastErrorCode:null};
    }catch{
      await this.repository.markBlocked(subject,saga.sagaId,"META_OAUTH_PROVIDER_OR_SCOPE_POLICY_UNAVAILABLE");
      const current=await this.repository.get(subject,saga.sagaId);
      return {
        sagaId:saga.sagaId,status:current?.status??"blocked",
        authorizationUrl:null,expiresAt:null,lastErrorCode:current?.lastErrorCode??"META_OAUTH_PROVIDER_OR_SCOPE_POLICY_UNAVAILABLE",
      };
    }
  }

  async complete(subjectInput:TenantAccessContext,command:CompleteMetaOnboardingCommand):Promise<MetaOnboardingProgress>{
    const subject=this.requireManager(subjectInput);
    const saga=await this.requireOwnedSaga(subject,command.sagaId);
    if(saga.status!=="oauth_pending")
      throw new UnauthorizedException({code:"META_ONBOARDING_OAUTH_NOT_PENDING"});
    if(saga.initiatedByUserId!==subject.actorId)
      throw new UnauthorizedException({code:"META_ONBOARDING_ACTOR_MISMATCH"});
    const connection=await this.oauth.complete({
      subject,state:command.state,code:command.code,redirectUri:command.redirectUri,
    });
    await this.repository.attachConnection(subject,saga.sagaId,connection.connectionId);
    return this.runAssetSync(subject,saga.sagaId,connection.connectionId,saga);
  }

  async retryAssetSync(subjectInput:TenantAccessContext,sagaId:string):Promise<MetaOnboardingProgress>{
    const subject=this.requireManager(subjectInput);
    const saga=await this.requireOwnedSaga(subject,sagaId);
    if(!saga.connectionId||!["asset_sync_pending","blocked"].includes(saga.status))
      throw new UnauthorizedException({code:"META_ONBOARDING_ASSET_SYNC_NOT_RETRYABLE"});
    if(saga.status==="blocked")
      await this.repository.attachConnection(subject,saga.sagaId,saga.connectionId);
    return this.runAssetSync(subject,saga.sagaId,saga.connectionId,saga);
  }

  private async runAssetSync(
    subject:TenantAccessContext,sagaId:string,connectionId:string,saga:MetaOnboardingRecord,
  ):Promise<MetaOnboardingProgress>{
    try{
      const result=await this.assets.discoverAndPersist({
        subject,connectionId,product:saga.product,authorizationMode:saga.authorizationMode,
        requiredScopes:saga.requiredScopes,
      });
      if(!Number.isSafeInteger(result.discoveredAssets)||result.discoveredAssets<0
        ||!Array.isArray(result.missingCapabilities)
        ||result.missingCapabilities.some(value=>typeof value!=="string"||value.length>128)
        ||!result.requiredAssetsReady||result.missingCapabilities.length>0){
        await this.repository.recordAssetSyncFailure(subject,sagaId,"META_REQUIRED_ASSET_GRANTS_INCOMPLETE");
        const pending=await this.requireOwnedSaga(subject,sagaId);
        return this.toProgress(pending,result.discoveredAssets,result.missingCapabilities);
      }
      await this.repository.markReady(subject,sagaId);
      const ready=await this.requireOwnedSaga(subject,sagaId);
      return this.toProgress(ready,result.discoveredAssets,[]);
    }catch{
      await this.repository.recordAssetSyncFailure(subject,sagaId,"META_ASSET_DISCOVERY_UNAVAILABLE");
      const pending=await this.requireOwnedSaga(subject,sagaId);
      return this.toProgress(pending,null,[]);
    }
  }

  private async requireOwnedSaga(subject:TenantAccessContext,sagaId:string):Promise<MetaOnboardingRecord>{
    const saga=await this.repository.get(subject,sagaId);
    if(!saga)throw new NotFoundException({code:"META_ONBOARDING_SAGA_NOT_FOUND"});
    if(saga.initiatedByUserId!==subject.actorId)
      throw new UnauthorizedException({code:"META_ONBOARDING_ACTOR_MISMATCH"});
    return saga;
  }

  private requireManager(subject:TenantAccessContext):TenantAccessContext{
    if(subject.membershipStatus!=="active"||!subject.permissionKeys.includes("meta.connections.manage"))
      throw new UnauthorizedException({code:"META_ONBOARDING_MANAGE_NOT_AUTHORIZED"});
    return subject;
  }

  private toProgress(
    saga:MetaOnboardingRecord,discoveredAssets:number|null,missingCapabilities:readonly string[],
  ):MetaOnboardingProgress{
    return {
      sagaId:saga.sagaId,status:saga.status,connectionId:saga.connectionId,
      discoveredAssets,missingCapabilities:Object.freeze([...missingCapabilities]),
      lastErrorCode:saga.lastErrorCode,syncAttempts:saga.syncAttempts,
    };
  }
}
