import {randomUUID} from "node:crypto";
import {Injectable} from "@nestjs/common";
import type {PoolClient} from "pg";
import type {TenantAccessContext} from "../../identity/tenant-access-context.js";
import {PostgresTenantJobRecordWriter} from "../../isolation/postgres-tenant-job-record.writer.js";
import {assertSafeDeveloperWebhookData,type DeveloperWebhookEventType} from "../domain/developer-webhook.js";
export interface DeveloperWebhookDomainEvent{readonly eventType:DeveloperWebhookEventType;readonly aggregateType:string;readonly aggregateId:string;readonly aggregateVersion:number;readonly data:Readonly<Record<string,unknown>>;}
@Injectable()
export class DeveloperWebhookEventPublisher{
 constructor(private readonly jobs:PostgresTenantJobRecordWriter){}
 async publish(client:PoolClient,subject:TenantAccessContext,event:DeveloperWebhookDomainEvent):Promise<number>{
  if(!/^[a-z][a-z0-9_]{1,63}$/.test(event.aggregateType)||!/^[0-9a-f-]{36}$/i.test(event.aggregateId)||!Number.isSafeInteger(event.aggregateVersion)||event.aggregateVersion<1)throw new Error("DEVELOPER_WEBHOOK_AGGREGATE_INVALID");
  assertSafeDeveloperWebhookData(event.data);const id=randomUUID();
  const envelope={id,type:event.eventType,schemaVersion:"1.0.0",occurredAt:new Date().toISOString(),tenantId:subject.tenantId,
   aggregate:{type:event.aggregateType,id:event.aggregateId,version:event.aggregateVersion},source:"whatsbusiness",correlationId:subject.correlationId,data:event.data};
  const result=await client.query<{delivery_id:string}>("SELECT delivery_id::text FROM platform.publish_developer_webhook_event($1,$2,$3,$4::jsonb)",[subject.tenantId,id,event.eventType,JSON.stringify(envelope)]);
  for(const row of result.rows)await this.jobs.stage(client,{tenantId:subject.tenantId,actorUserId:subject.actorId,purpose:"developer.webhooks.deliver",correlationId:subject.correlationId,jobType:"developer.webhook.delivery",idempotencyKey:"developer-webhook-delivery:"+row.delivery_id,payload:{deliveryId:row.delivery_id},maxAttempts:1});
  return result.rows.length;
 }
}
