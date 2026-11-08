import { createHash, randomUUID } from "node:crypto";
import {
  ConflictException, ForbiddenException, Injectable, NotFoundException,
} from "@nestjs/common";
import type { PoolClient } from "pg";
import { DatabaseService } from "../../database/database.module.js";
import { AppendOnlyAuditRepository } from "../../identity/audit/append-only-audit.repository.js";
import { TENANT_ROLE_CATALOG } from "../../identity/authorization/tenant-role-catalog.js";
import { PlatformAuditRepository } from "./platform-audit.repository.js";
import type {
  AssignTenantPlanCommand, AuthorizeSupportAccessCommand, CreateOrganizationCommand,
  CreateSupportGrantCommand, PlatformAdministrationPort, ProvisionTenantCommand,
  PublishPlanVersionCommand, RecordUsageCommand, RevokeSupportGrantCommand, TenantLifecycleCommand,
} from "../application/platform-administration.port.js";
import type { PlanEntitlementDefinition } from "../domain/platform-administration.policy.js";

interface TenantRow { readonly id: string; readonly status: string; readonly authz_version: number; }
interface PlanRow { readonly id: string; readonly plan_key: string; readonly version: number; }
interface UsageRow { readonly id: string; readonly payload_hash: string; }
interface GrantRow { readonly id: string; readonly expires_at: Date | string; }

@Injectable()
export class PlatformAdministrationRepository implements PlatformAdministrationPort {
  constructor(
    private readonly database: DatabaseService,
    private readonly tenantAudit: AppendOnlyAuditRepository,
    private readonly platformAudit: PlatformAuditRepository,
  ) {}

  async createOrganization(command: CreateOrganizationCommand): Promise<{organizationId:string}> {
    return this.withAdmin(command.actorUserId, null, async (client) => {
      const result = await client.query<{id:string}>(
        "INSERT INTO platform.organizations(organization_type,name,status) VALUES($1,$2,'active') RETURNING id::text",
        [command.organizationType, command.name.trim()],
      );
      const organizationId = result.rows[0]?.id;
      if (!organizationId) throw new Error("Organization creation returned no id.");
      await this.platformAudit.append(client, {
        actorUserId: command.actorUserId, actionKey: "platform.organization.created",
        resourceType: "organization", resourceId: organizationId,
        purpose: "platform.organization.provision", correlationId: command.correlationId,
        requestHash: this.hash({type:command.organizationType,name:command.name.trim()}),
      });
      return {organizationId};
    });
  }

  async publishPlanVersion(command: PublishPlanVersionCommand): Promise<{planVersionId:string}> {
    return this.withAdmin(command.actorUserId, null, async (client) => {
      const existing = await client.query("SELECT 1 FROM platform.plan_versions WHERE plan_key=$1 AND version=$2",
        [command.plan.planKey,command.plan.version]);
      if (existing.rowCount) throw new ConflictException({code:"PLAN_VERSION_ALREADY_EXISTS",detail:"La versión ya existe y es inmutable."});
      const inserted = await client.query<{id:string}>(
        "INSERT INTO platform.plan_versions(plan_key,version,display_name,published_by_user_id) VALUES($1,$2,$3,$4) RETURNING id::text",
        [command.plan.planKey,command.plan.version,command.plan.displayName.trim(),command.actorUserId],
      );
      const planVersionId = inserted.rows[0]?.id;
      if (!planVersionId) throw new Error("Plan version insert returned no id.");
      for (const entitlement of command.plan.entitlements) {
        await client.query(
          "INSERT INTO platform.plan_entitlements(plan_version_id,feature_key,state,limits) VALUES($1,$2,$3,$4::jsonb)",
          [planVersionId,entitlement.featureKey,entitlement.state,JSON.stringify(entitlement.limits)],
        );
      }
      await this.platformAudit.append(client, {
        actorUserId:command.actorUserId,actionKey:"platform.plan.version.published",
        resourceType:"plan_version",resourceId:planVersionId,purpose:"platform.plan.publish",
        correlationId:command.correlationId,requestHash:this.hash(command.plan),
      });
      return {planVersionId};
    });
  }

  async provisionTenant(command: ProvisionTenantCommand): Promise<{tenantId:string;membershipId:string;subscriptionId:string}> {
    return this.withAdmin(command.actorUserId,null,async(client)=>{
      const organization=await client.query<{id:string}>(
        "SELECT id::text FROM platform.organizations WHERE id=$1 AND status='active'",[command.organizationId]);
      if (!organization.rows[0]) throw new NotFoundException({code:"ORGANIZATION_NOT_FOUND",detail:"La organización no existe o no está activa."});
      const owner=await client.query<{id:string}>(
        "SELECT id::text FROM platform.users WHERE id=$1 AND status='active'",[command.ownerUserId]);
      if (!owner.rows[0]) throw new NotFoundException({code:"TENANT_OWNER_NOT_FOUND",detail:"El usuario propietario no existe o no está activo."});
      const plan=await this.findActivePlan(client,command.planKey,command.planVersion);
      const tenantResult=await client.query<{id:string}>(
        "INSERT INTO platform.tenants(organization_id,slug,display_name,status,locale,timezone,currency) VALUES($1,$2,$3,'pending_provisioning',$4,$5,$6) RETURNING id::text",
        [command.organizationId,command.slug,command.displayName.trim(),command.locale??"es-EC",command.timezone??"America/Guayaquil",command.currency??"USD"]);
      const tenantId=tenantResult.rows[0]?.id;
      if(!tenantId) throw new Error("Tenant creation returned no id.");
      await this.setTenantContext(client,tenantId);
      const membership=await client.query<{id:string}>(
        "INSERT INTO platform.memberships(tenant_id,user_id,status) VALUES($1,$2,'active') RETURNING id::text",
        [tenantId,command.ownerUserId]);
      const membershipId=membership.rows[0]?.id;
      if(!membershipId) throw new Error("Tenant owner membership was not created.");

      const ownerRole=TENANT_ROLE_CATALOG.find(role=>role.roleKey==="tenant_owner");
      if(!ownerRole) throw new Error("Canonical tenant_owner role template is unavailable.");
      const role=await client.query<{id:string}>(
        "INSERT INTO platform.roles(tenant_id,role_key,display_name,description,version) VALUES($1,$2,$3,$4,$5) RETURNING id::text",
        [tenantId,ownerRole.roleKey,ownerRole.displayName,ownerRole.description,ownerRole.version]);
      const roleId=role.rows[0]?.id;
      if(!roleId) throw new Error("Tenant owner role was not created.");
      const permissions=await client.query(
        "INSERT INTO platform.role_permissions(role_id,permission_key,tenant_id) SELECT $1,p.permission_key,$2 FROM unnest($3::text[]) AS expected(permission_key) JOIN platform.permissions p ON p.permission_key=expected.permission_key",
        [roleId,tenantId,[...ownerRole.permissions]]);
      if((permissions.rowCount??0)!==ownerRole.permissions.length) {
        throw new ConflictException({code:"TENANT_ROLE_CATALOG_DRIFT",detail:"El catálogo de permisos de tenant_owner no coincide con la base de datos."});
      }
      await client.query("INSERT INTO platform.membership_roles(membership_id,role_id,tenant_id) VALUES($1,$2,$3)",
        [membershipId,roleId,tenantId]);
      const subscriptionId=await this.applyPlan(client,command.actorUserId,tenantId,plan);
      await client.query("UPDATE platform.tenants SET status='active' WHERE id=$1",[tenantId]);
      const tenant=await this.lockTenant(client,tenantId);
      const occurredAt=new Date().toISOString();
      const envelope={
        id:randomUUID(),type:"platform.tenant.created",schemaVersion:"1.0.0",occurredAt,
        tenantId,aggregate:{type:"tenant",id:tenantId,version:Number(tenant.authz_version)},
        source:"platform-identity",correlationId:command.correlationId,
        data:{tenantId,organizationId:command.organizationId},
      };
      await this.insertLifecycleOutbox(client,envelope);
      const requestHash=this.hash({
        organizationId:command.organizationId,ownerUserId:command.ownerUserId,slug:command.slug,
        displayName:command.displayName,planKey:command.planKey,planVersion:command.planVersion,
      });
      await this.tenantAudit.append(client,{
        tenantId,actorUserId:command.actorUserId,actionKey:"platform.tenant.created",
        resourceType:"tenant",resourceId:tenantId,purpose:"platform.tenant.provision",
        outcome:"allowed",correlationId:command.correlationId,requestHash,
      });
      await this.platformAudit.append(client,{
        actorUserId:command.actorUserId,actionKey:"platform.tenant.provisioned",
        resourceType:"tenant",resourceId:tenantId,purpose:"platform.tenant.provision",
        correlationId:command.correlationId,requestHash,
      });
      return {tenantId,membershipId,subscriptionId};
    });
  }

  async suspendTenant(command:TenantLifecycleCommand):Promise<void> {
    await this.withAdmin(command.actorUserId,command.tenantId,async(client)=>{
      const tenant=await this.lockTenant(client,command.tenantId);
      if(tenant.status==="suspended") return;
      if(tenant.status!=="active") throw new ConflictException({code:"TENANT_LIFECYCLE_CONFLICT",detail:"Solo un tenant activo puede suspenderse."});
      await client.query("UPDATE platform.tenants SET status='suspended' WHERE id=$1",[command.tenantId]);
      await client.query("UPDATE platform.support_grants SET revoked_at=now(),revoked_by_user_id=$2 WHERE tenant_id=$1 AND revoked_at IS NULL",
        [command.tenantId,command.actorUserId]);
      const updated=await this.lockTenant(client,command.tenantId);
      const occurredAt=new Date().toISOString();
      const envelope={
        id:randomUUID(),type:"platform.tenant.suspended",schemaVersion:"1.0.0",occurredAt,
        tenantId:command.tenantId,aggregate:{type:"tenant",id:command.tenantId,version:Number(updated.authz_version)},
        source:"platform-identity",correlationId:command.correlationId,
        data:{tenantId:command.tenantId,reasonCode:command.reasonCode},
      };
      await this.insertLifecycleOutbox(client,envelope);
      const requestHash=this.hash({tenantId:command.tenantId,reasonCode:command.reasonCode});
      await this.tenantAudit.append(client,{
        tenantId:command.tenantId,actorUserId:command.actorUserId,actionKey:"platform.tenant.suspended",
        resourceType:"tenant",resourceId:command.tenantId,purpose:"platform.tenant.lifecycle",
        outcome:"allowed",reasonCode:command.reasonCode,correlationId:command.correlationId,requestHash,
      });
      await this.platformAudit.append(client,{
        actorUserId:command.actorUserId,actionKey:"platform.tenant.suspended",
        resourceType:"tenant",resourceId:command.tenantId,purpose:"platform.tenant.lifecycle",
        reasonCode:command.reasonCode,correlationId:command.correlationId,requestHash,
      });
    });
  }

  async reactivateTenant(command:TenantLifecycleCommand):Promise<void> {
    await this.withAdmin(command.actorUserId,command.tenantId,async(client)=>{
      const tenant=await this.lockTenant(client,command.tenantId);
      if(tenant.status==="active") return;
      if(tenant.status!=="suspended") throw new ConflictException({code:"TENANT_LIFECYCLE_CONFLICT",detail:"Solo un tenant suspendido puede reactivarse."});
      await client.query("UPDATE platform.tenants SET status='active' WHERE id=$1",[command.tenantId]);
      const requestHash=this.hash({tenantId:command.tenantId,reasonCode:command.reasonCode});
      await this.tenantAudit.append(client,{
        tenantId:command.tenantId,actorUserId:command.actorUserId,actionKey:"platform.tenant.reactivated",
        resourceType:"tenant",resourceId:command.tenantId,purpose:"platform.tenant.lifecycle",
        outcome:"allowed",reasonCode:command.reasonCode,correlationId:command.correlationId,requestHash,
      });
      await this.platformAudit.append(client,{
        actorUserId:command.actorUserId,actionKey:"platform.tenant.reactivated",
        resourceType:"tenant",resourceId:command.tenantId,purpose:"platform.tenant.lifecycle",
        reasonCode:command.reasonCode,correlationId:command.correlationId,requestHash,
      });
    });
  }

  async retirePlanVersion(command:import("../application/platform-administration.port.js").RetirePlanVersionCommand):Promise<void> {
    await this.withAdmin(command.actorUserId,null,async(client)=>{
      const retired=await client.query<{id:string}>(
        "UPDATE platform.plan_versions SET status='retired' WHERE plan_key=$1 AND version=$2 AND status='active' RETURNING id::text",
        [command.planKey,command.planVersion]);
      if(!retired.rows[0]) {
        const exists=await client.query("SELECT 1 FROM platform.plan_versions WHERE plan_key=$1 AND version=$2",[command.planKey,command.planVersion]);
        if(!exists.rowCount) throw new NotFoundException({code:"PLAN_VERSION_NOT_FOUND",detail:"La versión del plan no existe."});
        return;
      }
      await this.platformAudit.append(client,{
        actorUserId:command.actorUserId,actionKey:"platform.plan.version.retired",
        resourceType:"plan_version",resourceId:retired.rows[0].id,purpose:"platform.plan.retire",
        correlationId:command.correlationId,requestHash:this.hash({planKey:command.planKey,version:command.planVersion}),
      });
    });
  }

  async getUsageSummary(query:import("../application/platform-administration.port.js").UsageSummaryQuery):Promise<readonly import("../application/platform-administration.port.js").UsageSummaryEntry[]> {
    return this.database.withTenantContext(query.actorUserId,query.tenantId,async(client)=>{
      const result=await client.query<import("../application/platform-administration.port.js").UsageSummaryEntry>(
        "SELECT category,metric_key AS \"metricKey\",unit,sum(quantity)::text AS quantity,CASE WHEN count(cost_amount)=0 THEN NULL ELSE sum(cost_amount)::text END AS \"costAmount\",currency,count(*)::int AS \"entryCount\" FROM platform.usage_ledger WHERE tenant_id=$1 AND observed_at >= $2 AND observed_at < $3 GROUP BY category,metric_key,unit,currency ORDER BY category,metric_key,unit,currency",
        [query.tenantId,query.from,query.to]);
      return result.rows;
    });
  }

  async assignTenantPlan(command:AssignTenantPlanCommand):Promise<{subscriptionId:string}> {
    return this.withAdmin(command.actorUserId,command.tenantId,async(client)=>{
      const tenant=await this.lockTenant(client,command.tenantId);
      if(tenant.status!=="active") throw new ConflictException({code:"TENANT_NOT_ACTIVE",detail:"El plan solo puede cambiarse en un tenant activo."});
      const plan=await this.findActivePlan(client,command.planKey,command.planVersion);
      const subscriptionId=await this.applyPlan(client,command.actorUserId,command.tenantId,plan);
      const requestHash=this.hash({tenantId:command.tenantId,planKey:command.planKey,planVersion:command.planVersion});
      await this.tenantAudit.append(client,{
        tenantId:command.tenantId,actorUserId:command.actorUserId,actionKey:"platform.tenant.plan.assigned",
        resourceType:"tenant_subscription",resourceId:subscriptionId,purpose:"platform.plan.assign",
        outcome:"allowed",correlationId:command.correlationId,requestHash,
      });
      await this.platformAudit.append(client,{
        actorUserId:command.actorUserId,actionKey:"platform.tenant.plan.assigned",
        resourceType:"tenant_subscription",resourceId:subscriptionId,purpose:"platform.plan.assign",
        correlationId:command.correlationId,requestHash,
      });
      return {subscriptionId};
    });
  }

  async recordUsage(command:RecordUsageCommand):Promise<{usageId:string;duplicate:boolean}> {
    return this.database.transaction(async(client)=>{
      await client.query("SELECT set_config('app.user_id',$1,true)",[command.actorUserId]);
      const role=await client.query<{allowed:boolean}>("SELECT platform.is_usage_ingestor($1) AS allowed",[command.actorUserId]);
      if(role.rows[0]?.allowed!==true) throw new ForbiddenException({code:"USAGE_INGESTOR_REQUIRED",detail:"El proceso no está autorizado para registrar consumo."});
      await this.setTenantContext(client,command.tenantId);
      const meterable=await client.query<{allowed:boolean}>("SELECT platform.is_meterable_tenant($1) AS allowed",[command.tenantId]);
      if(meterable.rows[0]?.allowed!==true) throw new ConflictException({code:"TENANT_NOT_METERABLE",detail:"El tenant no admite nuevos registros de consumo."});
      const payload={
        metricKey:command.metricKey,unit:command.unit,quantity:command.quantity,
        costAmount:command.costAmount??null,currency:command.currency??null,
        evidenceType:command.evidenceType,sourceReference:command.sourceReference,observedAt:command.observedAt,
      };
      const payloadHash=this.hash(payload);
      const inserted=await client.query<{id:string}>(
        "INSERT INTO platform.usage_ledger(tenant_id,actor_user_id,category,metric_key,unit,quantity,cost_amount,currency,evidence_type,source_reference,idempotency_key,payload_hash,observed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(tenant_id,category,idempotency_key) DO NOTHING RETURNING id::text",
        [command.tenantId,command.actorUserId,command.category,command.metricKey,command.unit,command.quantity,
          command.costAmount??null,command.currency??null,command.evidenceType,command.sourceReference,
          command.idempotencyKey,payloadHash,command.observedAt]);
      if(inserted.rows[0]) {
        await this.tenantAudit.append(client,{
          tenantId:command.tenantId,actorUserId:command.actorUserId,actionKey:"billing.usage.recorded",
          resourceType:"usage_entry",resourceId:inserted.rows[0].id,purpose:"billing.usage.meter",
          outcome:"allowed",correlationId:command.correlationId,requestHash:payloadHash,
        });
        return {usageId:inserted.rows[0].id,duplicate:false};
      }
      const existing=await client.query<UsageRow>(
        "SELECT id::text,payload_hash FROM platform.resolve_usage_idempotency($1,$2,$3,$4)",
        [command.tenantId,command.actorUserId,command.category,command.idempotencyKey]);
      if(!existing.rows[0]||existing.rows[0].payload_hash.trim()!==payloadHash) {
        throw new ConflictException({code:"USAGE_IDEMPOTENCY_CONFLICT",detail:"La clave ya se utilizó con datos diferentes."});
      }
      return {usageId:existing.rows[0].id,duplicate:true};
    });
  }

  async createSupportGrant(command:CreateSupportGrantCommand):Promise<{grantId:string}> {
    return this.withAdmin(command.requestedByUserId,command.tenantId,async(client)=>{
      await this.lockTenant(client,command.tenantId);
      const approved=await client.query<{allowed:boolean}>(
        "SELECT platform.has_platform_role($1,'platform_owner') AS allowed",[command.approvedByUserId]);
      if(approved.rows[0]?.allowed!==true) throw new ForbiddenException({code:"SUPPORT_APPROVER_REQUIRED",detail:"La aprobación requiere un platform_owner distinto."});
      const operator=await client.query<{allowed:boolean}>(
        "SELECT platform.has_platform_role($1,'support_jit') AS allowed",[command.operatorUserId]);
      if(operator.rows[0]?.allowed!==true) throw new ForbiddenException({code:"SUPPORT_OPERATOR_NOT_REGISTERED",detail:"El operador no está habilitado para soporte JIT."});
      const inserted=await client.query<{id:string}>(
        "INSERT INTO platform.support_grants(tenant_id,operator_user_id,requested_by_user_id,approved_by_user_id,approval_step_up_auth_time,approval_step_up_acr,approval_step_up_amr,reason,purpose,scopes,valid_from,expires_at,correlation_id) VALUES($1,$2,$3,$4,$5,$6,$7::text[],$8,$9,$10::text[],$11,$12,$13) RETURNING id::text",
        [command.tenantId,command.operatorUserId,command.requestedByUserId,command.approvedByUserId,
          command.stepUpAuthTime,command.stepUpAcr??null,[...command.stepUpAmr],command.reason.trim(),command.purpose,
          [...command.scopes],command.validFrom,command.expiresAt,command.correlationId]);
      const grantId=inserted.rows[0]?.id;
      if(!grantId) throw new Error("Support grant insert returned no id.");
      const requestHash=this.hash({operatorUserId:command.operatorUserId,reason:command.reason,purpose:command.purpose,
        scopes:command.scopes,validFrom:command.validFrom,expiresAt:command.expiresAt,approvedBy:command.approvedByUserId,
        stepUpAuthTime:command.stepUpAuthTime,stepUpAcr:command.stepUpAcr??null,stepUpAmr:command.stepUpAmr});
      await this.tenantAudit.append(client,{
        tenantId:command.tenantId,actorUserId:command.requestedByUserId,actionKey:"support.grant.requested",
        resourceType:"support_grant",resourceId:grantId,purpose:"platform.support.grant",
        outcome:"approval_requested",reasonCode:"SUPPORT_ACCESS_APPROVED",correlationId:command.correlationId,requestHash,
      });
      await this.platformAudit.append(client,{
        actorUserId:command.requestedByUserId,actionKey:"platform.support.grant.created",
        resourceType:"support_grant",resourceId:grantId,purpose:"platform.support.grant",
        correlationId:command.correlationId,requestHash,
      });
      return {grantId};
    });
  }

  async authorizeSupportAccess(command:AuthorizeSupportAccessCommand):Promise<{grantId:string;expiresAt:string}> {
    return this.database.transaction(async(client)=>{
      await client.query("SELECT set_config('app.user_id',$1,true)",[command.operatorUserId]);
      await this.setTenantContext(client,command.tenantId);
      const activeGrant=await client.query<{allowed:boolean}>(
        "SELECT platform.has_active_support_grant($1,$2,$3) AS allowed",
        [command.tenantId,command.operatorUserId,command.scope]);
      if(activeGrant.rows[0]?.allowed!==true) {
        throw new ForbiddenException({code:"SUPPORT_GRANT_NOT_ACTIVE",detail:"El grant JIT no está vigente o el tenant no admite acceso."});
      }
      const grant=await client.query<GrantRow>(
        "SELECT id::text,expires_at FROM platform.support_grants WHERE tenant_id=$1 AND operator_user_id=$2 AND revoked_at IS NULL AND valid_from<=now() AND expires_at>now() AND purpose=$3 AND $4=ANY(scopes) ORDER BY expires_at ASC LIMIT 1",
        [command.tenantId,command.operatorUserId,command.purpose,command.scope]);
      const row=grant.rows[0];
      if(!row) throw new ForbiddenException({code:"SUPPORT_GRANT_NOT_ACTIVE",detail:"No existe un grant JIT vigente para el tenant, propósito y alcance solicitados."});
      const requestHash=this.hash({scope:command.scope,purpose:command.purpose,resourceType:command.resourceType,resourceId:command.resourceId});
      await this.tenantAudit.append(client,{
        tenantId:command.tenantId,actorUserId:command.operatorUserId,actionKey:"support.access.authorized",
        resourceType:command.resourceType,resourceId:command.resourceId,purpose:command.purpose,
        outcome:"allowed",reasonCode:"ACTIVE_JIT_GRANT",correlationId:command.correlationId,requestHash,
      });
      return {grantId:row.id,expiresAt:row.expires_at instanceof Date?row.expires_at.toISOString():new Date(row.expires_at).toISOString()};
    });
  }

  async revokeSupportGrant(command:RevokeSupportGrantCommand):Promise<void> {
    await this.withAdmin(command.actorUserId,command.tenantId,async(client)=>{
      const revoked=await client.query<{id:string}>(
        "UPDATE platform.support_grants SET revoked_at=now(),revoked_by_user_id=$3 WHERE id=$1 AND tenant_id=$2 AND revoked_at IS NULL RETURNING id::text",
        [command.grantId,command.tenantId,command.actorUserId]);
      if(!revoked.rows[0]) {
        const exists=await client.query("SELECT 1 FROM platform.support_grants WHERE id=$1 AND tenant_id=$2",[command.grantId,command.tenantId]);
        if(!exists.rowCount) throw new NotFoundException({code:"SUPPORT_GRANT_NOT_FOUND",detail:"El grant no existe."});
        return;
      }
      await this.tenantAudit.append(client,{
        tenantId:command.tenantId,actorUserId:command.actorUserId,actionKey:"support.grant.revoked",
        resourceType:"support_grant",resourceId:command.grantId,purpose:"platform.support.revoke",
        outcome:"allowed",reasonCode:"SUPPORT_ACCESS_REVOKED",correlationId:command.correlationId,
        requestHash:this.hash({grantId:command.grantId,tenantId:command.tenantId}),
      });
    });
  }

  private async applyPlan(client:PoolClient,actor:string,tenantId:string,plan:PlanRow):Promise<string> {
    const current=await client.query<{id:string;plan_version_id:string}>(
      "SELECT id::text,plan_version_id::text FROM platform.tenant_subscriptions WHERE tenant_id=$1 AND status='active' FOR UPDATE",[tenantId]);
    if(current.rows[0]?.plan_version_id===plan.id) return current.rows[0].id;
    if(current.rows[0]) await client.query(
      "UPDATE platform.tenant_subscriptions SET status='superseded',ends_at=now() WHERE id=$1 AND tenant_id=$2",[current.rows[0].id,tenantId]);
    const subscription=await client.query<{id:string}>(
      "INSERT INTO platform.tenant_subscriptions(tenant_id,plan_version_id,status,created_by_user_id) VALUES($1,$2,'active',$3) RETURNING id::text",
      [tenantId,plan.id,actor]);
    const subscriptionId=subscription.rows[0]?.id;
    if(!subscriptionId) throw new Error("Subscription creation returned no id.");
    await client.query(
      "UPDATE platform.entitlements SET state='expired',period_ends_at=now(),source_subscription_id=$2,version=version+1,updated_by_user_id=$3,updated_at=now() WHERE tenant_id=$1 AND state<>'expired'",
      [tenantId,subscriptionId,actor]);
    const definitions=await client.query<PlanEntitlementDefinition>(
      'SELECT feature_key AS "featureKey",state,limits FROM platform.plan_entitlements WHERE plan_version_id=$1 ORDER BY feature_key',[plan.id]);
    for(const definition of definitions.rows) await client.query(
      "INSERT INTO platform.entitlements(tenant_id,feature_key,state,limits,period_starts_at,source_subscription_id,version,updated_by_user_id) VALUES($1,$2,$3,$4::jsonb,now(),$5,1,$6) ON CONFLICT(tenant_id,feature_key) DO UPDATE SET state=EXCLUDED.state,limits=EXCLUDED.limits,period_starts_at=EXCLUDED.period_starts_at,period_ends_at=NULL,source_subscription_id=EXCLUDED.source_subscription_id,version=platform.entitlements.version+1,updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=now()",
      [tenantId,definition.featureKey,definition.state,JSON.stringify(definition.limits),subscriptionId,actor]);
    return subscriptionId;
  }

  private async findActivePlan(client:PoolClient,key:string,version:number):Promise<PlanRow> {
    const result=await client.query<PlanRow>(
      "SELECT id::text,plan_key,version FROM platform.plan_versions WHERE plan_key=$1 AND version=$2 AND status='active'",[key,version]);
    const plan=result.rows[0];
    if(!plan) throw new NotFoundException({code:"PLAN_VERSION_NOT_FOUND",detail:"El plan no existe o fue retirado."});
    const count=await client.query<{count:string}>(
      "SELECT count(*)::text AS count FROM platform.plan_entitlements WHERE plan_version_id=$1",[plan.id]);
    if(Number(count.rows[0]?.count??"0")<1) throw new ConflictException({code:"PLAN_WITHOUT_ENTITLEMENTS",detail:"El plan no contiene entitlements."});
    return plan;
  }

  private async lockTenant(client:PoolClient,tenantId:string):Promise<TenantRow> {
    const result=await client.query<TenantRow>(
      "SELECT id::text,status,authz_version FROM platform.tenants WHERE id=$1 FOR UPDATE",[tenantId]);
    const tenant=result.rows[0];
    if(!tenant) throw new NotFoundException({code:"TENANT_NOT_FOUND",detail:"El tenant no existe."});
    return tenant;
  }

  private async insertLifecycleOutbox(client:PoolClient,envelope:{
    id:string;type:"platform.tenant.created"|"platform.tenant.suspended";schemaVersion:"1.0.0";
    occurredAt:string;tenantId:string;aggregate:{type:"tenant";id:string;version:number};
    source:string;correlationId:string;data:Record<string,string>;
  }):Promise<void> {
    await client.query(
      "INSERT INTO platform.domain_outbox_events(id,tenant_id,event_type,schema_version,aggregate_type,aggregate_id,aggregate_version,correlation_id,envelope,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)",
      [envelope.id,envelope.tenantId,envelope.type,envelope.schemaVersion,envelope.aggregate.type,
        envelope.aggregate.id,envelope.aggregate.version,envelope.correlationId,JSON.stringify(envelope),envelope.occurredAt]);
  }

  private async withAdmin<T>(actor:string,tenantId:string|null,work:(client:PoolClient)=>Promise<T>):Promise<T> {
    return this.database.transaction(async(client)=>{
      await client.query("SELECT set_config('app.user_id',$1,true)",[actor]);
      const role=await client.query<{allowed:boolean}>("SELECT platform.is_platform_admin($1) AS allowed",[actor]);
      if(role.rows[0]?.allowed!==true) throw new ForbiddenException({code:"PLATFORM_OPERATOR_REQUIRED",detail:"La operación requiere un operador de plataforma autorizado."});
      if(tenantId!==null) await this.setTenantContext(client,tenantId);
      return work(client);
    });
  }

  private async setTenantContext(client:PoolClient,tenantId:string):Promise<void> {
    await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
  }
  private hash(value:unknown):string {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
  }
}
