import { ConflictException, Injectable } from "@nestjs/common";
import { DatabaseService } from "../../../database/database.module.js";
import { AppendOnlyAuditRepository } from "../../../identity/audit/append-only-audit.repository.js";
import type { TenantAccessContext } from "../../../identity/tenant-access-context.js";
import type { MetaOnboardingRecord, MetaOnboardingRepositoryPort } from "../../application/meta-onboarding.ports.js";
import type { ValidatedMetaOnboardingRequest } from "../../domain/meta-onboarding.policy.js";

interface SagaRow {
  id:string;tenant_id:string;initiated_by_user_id:string;provider_product:MetaOnboardingRecord["product"];
  authorization_mode:MetaOnboardingRecord["authorizationMode"];status:MetaOnboardingRecord["status"];
  required_scopes:string[];connection_id:string|null;request_hash:string;sync_attempts:number;
  last_error_code:string|null;discovered_assets_count:number|null;missing_capabilities:string[];
}
@Injectable()
export class PostgresMetaOnboardingRepository implements MetaOnboardingRepositoryPort {
  constructor(private readonly database:DatabaseService,private readonly audit:AppendOnlyAuditRepository){}

  async create(subject:TenantAccessContext,input:ValidatedMetaOnboardingRequest,sagaId:string):Promise<MetaOnboardingRecord>{
    return this.database.withTenantContextAtVersion(subject.actorId,subject.tenantId,subject.authzVersion,async(client)=>{
      const inserted=await client.query<SagaRow>(
        `INSERT INTO platform.meta_onboarding_sagas
          (id,tenant_id,initiated_by_user_id,provider_product,authorization_mode,required_scopes,idempotency_key,request_hash)
         VALUES($1,$2,$3,$4,$5,$6::text[],$7,$8)
         ON CONFLICT(tenant_id,initiated_by_user_id,idempotency_key) DO NOTHING
         RETURNING id::text,tenant_id::text,initiated_by_user_id::text,provider_product,authorization_mode,status,
           required_scopes,connection_id::text,request_hash,sync_attempts,last_error_code,
           discovered_assets_count,missing_capabilities`,
        [sagaId,input.tenantId,input.actorUserId,input.product,input.authorizationMode,input.requiredScopes,input.idempotencyKey,input.requestHash],
      );
      let row=inserted.rows[0];
      if(!row){
        const existing=await client.query<SagaRow>(
          `SELECT id::text,tenant_id::text,initiated_by_user_id::text,provider_product,authorization_mode,status,
                  required_scopes,connection_id::text,request_hash,sync_attempts,last_error_code,
           discovered_assets_count,missing_capabilities
             FROM platform.meta_onboarding_sagas
            WHERE tenant_id=$1 AND initiated_by_user_id=$2 AND idempotency_key=$3`,
          [input.tenantId,input.actorUserId,input.idempotencyKey],
        );
        row=existing.rows[0];
        if(!row||row.request_hash!==input.requestHash)
          throw new ConflictException({code:"META_ONBOARDING_IDEMPOTENCY_CONFLICT"});
      }else{
        await this.audit.append(client,{
          tenantId:subject.tenantId,actorUserId:subject.actorId,actionKey:"meta.connections.manage",
          resourceType:"meta_onboarding_saga",resourceId:row.id,purpose:subject.purpose,
          outcome:"meta_onboarding_started",correlationId:subject.correlationId,requestHash:input.requestHash,
        });
      }
      return this.toRecord(row);
    });
  }

  async get(subject:TenantAccessContext,sagaId:string):Promise<MetaOnboardingRecord|null>{
    const result=await this.database.withTenantContextAtVersion(subject.actorId,subject.tenantId,subject.authzVersion,(client)=>
      client.query<SagaRow>(
        `SELECT id::text,tenant_id::text,initiated_by_user_id::text,provider_product,authorization_mode,status,
                required_scopes,connection_id::text,request_hash,sync_attempts,last_error_code,
           discovered_assets_count,missing_capabilities
           FROM platform.meta_onboarding_sagas WHERE id=$1 AND tenant_id=$2`,
        [sagaId,subject.tenantId],
      ),
    );
    return result.rows[0]?this.toRecord(result.rows[0]):null;
  }

  async markOAuthPending(subject:TenantAccessContext,sagaId:string):Promise<void>{
    await this.updateStatus(subject,sagaId,"oauth_pending",null);
  }

  async attachConnection(subject:TenantAccessContext,sagaId:string,connectionId:string):Promise<void>{
    await this.database.withTenantContextAtVersion(subject.actorId,subject.tenantId,subject.authzVersion,async(client)=>{
      const result=await client.query(
        `UPDATE platform.meta_onboarding_sagas SET status='asset_sync_pending',connection_id=$3,last_error_code=NULL
          WHERE id=$1 AND tenant_id=$2 AND status IN ('oauth_pending','blocked')`,
        [sagaId,subject.tenantId,connectionId],
      );
      if(result.rowCount!==1)throw new ConflictException({code:"META_ONBOARDING_TRANSITION_CONFLICT"});
      await this.audit.append(client,{
        tenantId:subject.tenantId,actorUserId:subject.actorId,actionKey:"meta.connections.manage",
        resourceType:"meta_onboarding_saga",resourceId:sagaId,purpose:subject.purpose,
        outcome:"meta_onboarding_asset_sync_started",correlationId:subject.correlationId,
      });
    });
  }

  async recordAssetSyncFailure(
    subject:TenantAccessContext,sagaId:string,errorCode:string,
    snapshot:{readonly discoveredAssets:number|null;readonly missingCapabilities:readonly string[]},
  ):Promise<void>{
    await this.database.withTenantContextAtVersion(subject.actorId,subject.tenantId,subject.authzVersion,async(client)=>{
      const result=await client.query(
        `UPDATE platform.meta_onboarding_sagas
            SET last_error_code=$3,discovered_assets_count=$4,missing_capabilities=$5::text[]
          WHERE id=$1 AND tenant_id=$2 AND status='asset_sync_pending'`,
        [sagaId,subject.tenantId,normalizeError(errorCode),snapshot.discoveredAssets,[...snapshot.missingCapabilities]],
      );
      if(result.rowCount!==1)throw new ConflictException({code:"META_ONBOARDING_SYNC_STATE_CONFLICT"});
      await this.audit.append(client,{
        tenantId:subject.tenantId,actorUserId:subject.actorId,actionKey:"meta.connections.manage",
        resourceType:"meta_onboarding_saga",resourceId:sagaId,purpose:subject.purpose,
        outcome:"meta_onboarding_asset_sync_failed",reasonCode:normalizeError(errorCode),correlationId:subject.correlationId,
      });
    });
  }

  async markReady(
    subject:TenantAccessContext,sagaId:string,
    result:{readonly discoveredAssets:number;readonly missingCapabilities:readonly string[]},
  ):Promise<void>{
    await this.database.withTenantContextAtVersion(subject.actorId,subject.tenantId,subject.authzVersion,async(client)=>{
      const updated=await client.query(
        `UPDATE platform.meta_onboarding_sagas
            SET status='ready',last_error_code=NULL,discovered_assets_count=$3,missing_capabilities=$4::text[]
          WHERE id=$1 AND tenant_id=$2 AND status='asset_sync_pending' AND connection_id IS NOT NULL`,
        [sagaId,subject.tenantId,result.discoveredAssets,[...result.missingCapabilities]],
      );
      if(updated.rowCount!==1)throw new ConflictException({code:"META_ONBOARDING_TRANSITION_CONFLICT"});
      await this.audit.append(client,{
        tenantId:subject.tenantId,actorUserId:subject.actorId,actionKey:"meta.connections.manage",
        resourceType:"meta_onboarding_saga",resourceId:sagaId,purpose:subject.purpose,
        outcome:"meta_onboarding_ready",correlationId:subject.correlationId,
      });
    });
  }

  async markBlocked(subject:TenantAccessContext,sagaId:string,errorCode:string):Promise<void>{
    await this.updateStatus(subject,sagaId,"blocked",normalizeError(errorCode));
  }

  private async updateStatus(subject:TenantAccessContext,sagaId:string,status:"oauth_pending"|"blocked",errorCode:string|null):Promise<void>{
    await this.database.withTenantContextAtVersion(subject.actorId,subject.tenantId,subject.authzVersion,async(client)=>{
      const result=await client.query(
        `UPDATE platform.meta_onboarding_sagas SET status=$3,last_error_code=$4
          WHERE id=$1 AND tenant_id=$2 AND status IN ('created','blocked')`,
        [sagaId,subject.tenantId,status,errorCode],
      );
      if(result.rowCount!==1)throw new ConflictException({code:"META_ONBOARDING_TRANSITION_CONFLICT"});
      if(status==="blocked")await this.audit.append(client,{
        tenantId:subject.tenantId,actorUserId:subject.actorId,actionKey:"meta.connections.manage",
        resourceType:"meta_onboarding_saga",resourceId:sagaId,purpose:subject.purpose,
        outcome:"meta_onboarding_blocked",reasonCode:errorCode??"META_ONBOARDING_BLOCKED",
        correlationId:subject.correlationId,
      });
    });
  }

  private toRecord(row:SagaRow):MetaOnboardingRecord{
    return Object.freeze({
      sagaId:row.id,tenantId:row.tenant_id,initiatedByUserId:row.initiated_by_user_id,
      product:row.provider_product,authorizationMode:row.authorization_mode,status:row.status,
      requiredScopes:Object.freeze([...row.required_scopes]),connectionId:row.connection_id,
      requestHash:row.request_hash,syncAttempts:row.sync_attempts,
      discoveredAssets:row.discovered_assets_count,
      missingCapabilities:Object.freeze([...(row.missing_capabilities??[])]),
      lastErrorCode:row.last_error_code,
    });
  }
}
function normalizeError(value:string):string{
  return /^[A-Z][A-Z0-9_]{1,95}$/.test(value)?value:"META_ONBOARDING_OPERATION_FAILED";
}
